import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  SignJWT,
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
} from "jose";
import { prisma } from "@/app/lib/prisma";

const ACCESS_TOKEN_SECONDS = 15 * 60;
const REFRESH_TOKEN_DAYS = 30;
const JWT_ISSUER = "toeic-mini-trainer";
const JWT_AUDIENCE = "toeic-mobile";

const googleKeys = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);
const appleKeys = createRemoteJWKSet(
  new URL("https://appleid.apple.com/auth/keys"),
);

export type MobileIdentity = {
  provider: "google" | "apple";
  providerAccountId: string;
  email?: string;
  emailVerified: boolean;
  name?: string;
  image?: string;
};

export class AccountSuspendedError extends Error {
  constructor() {
    super("Account is suspended");
    this.name = "AccountSuspendedError";
  }
}

function mobileJwtSecret() {
  const value = process.env.MOBILE_JWT_SECRET;
  if (!value || value.length < 32) {
    throw new Error("MOBILE_JWT_SECRET must contain at least 32 characters");
  }
  return new TextEncoder().encode(value);
}

function configuredAudiences(...values: Array<string | undefined>) {
  const audiences = values.map((value) => value?.trim()).filter(Boolean) as string[];
  if (audiences.length === 0) {
    throw new Error("OAuth client audience is not configured");
  }
  return audiences;
}

function normalizeEmail(value: unknown) {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 && normalized.length <= 320 ? normalized : undefined;
}

function optionalClaim(value: unknown, maxLength: number) {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : undefined;
}

function isVerifiedClaim(value: unknown) {
  return value === true || value === "true";
}

export async function verifyGoogleIdentity(idToken: string): Promise<MobileIdentity> {
  const { payload } = await jwtVerify(idToken, googleKeys, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: configuredAudiences(
      process.env.GOOGLE_MOBILE_WEB_CLIENT_ID || process.env.GOOGLE_CLIENT_ID,
    ),
  });

  const email = normalizeEmail(payload.email);
  const emailVerified = isVerifiedClaim(payload.email_verified);
  if (!payload.sub || !email || !emailVerified) {
    throw new Error("Google identity does not contain a verified email");
  }

  return {
    provider: "google",
    providerAccountId: payload.sub,
    email,
    emailVerified,
    name: optionalClaim(payload.name, 120),
    image: optionalClaim(payload.picture, 2_048),
  };
}

export async function verifyAppleIdentity(
  idToken: string,
  suppliedName?: string,
): Promise<MobileIdentity> {
  const { payload } = await jwtVerify(idToken, appleKeys, {
    issuer: "https://appleid.apple.com",
    audience: configuredAudiences(process.env.APPLE_CLIENT_ID),
  });

  if (!payload.sub) throw new Error("Apple identity is missing its subject");

  const email = normalizeEmail(payload.email);
  const emailVerified = email ? isVerifiedClaim(payload.email_verified) : false;
  if (email && !emailVerified) {
    throw new Error("Apple identity email is not verified");
  }

  return {
    provider: "apple",
    providerAccountId: payload.sub,
    email,
    emailVerified,
    name: optionalClaim(suppliedName, 120),
  };
}

export async function resolveMobileUser(identity: MobileIdentity) {
  const existingAccount = await prisma.account.findUnique({
    where: {
      provider_providerAccountId: {
        provider: identity.provider,
        providerAccountId: identity.providerAccountId,
      },
    },
    include: { user: true },
  });
  if (existingAccount) {
    if (existingAccount.user.status !== "ACTIVE") throw new AccountSuspendedError();
    return existingAccount.user;
  }

  if (!identity.email || !identity.emailVerified) {
    throw new Error("A verified email is required for the first sign-in");
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.upsert({
        where: { email: identity.email },
        create: {
          email: identity.email,
          emailVerified: new Date(),
          name: identity.name,
          image: identity.image,
        },
        update: {
          emailVerified: new Date(),
          ...(identity.name ? { name: identity.name } : {}),
          ...(identity.image ? { image: identity.image } : {}),
        },
      });

      await tx.account.create({
        data: {
          userId: user.id,
          type: "oidc",
          provider: identity.provider,
          providerAccountId: identity.providerAccountId,
        },
      });
      if (user.status !== "ACTIVE") throw new AccountSuspendedError();
      return user;
    });
  } catch (error) {
    // A concurrent first login may have created the provider account first.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const account = await prisma.account.findUnique({
        where: {
          provider_providerAccountId: {
            provider: identity.provider,
            providerAccountId: identity.providerAccountId,
          },
        },
        include: { user: true },
      });
      if (account) {
        if (account.user.status !== "ACTIVE") throw new AccountSuspendedError();
        return account.user;
      }
    }
    throw error;
  }
}

function hashRefreshToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function newRefreshToken() {
  return randomBytes(48).toString("base64url");
}

async function createAccessToken(userId: string) {
  return new SignJWT({ tokenUse: "access" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setSubject(userId)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_SECONDS}s`)
    .sign(mobileJwtSecret());
}

export async function createMobileSession(
  userId: string,
  deviceId: string,
  deviceName?: string,
) {
  const activeUser = await prisma.user.findFirst({ where: { id: userId, status: "ACTIVE" }, select: { id: true } });
  if (!activeUser) throw new AccountSuspendedError();
  const refreshToken = newRefreshToken();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);

  await prisma.mobileSession.create({
    data: {
      userId,
      tokenHash: hashRefreshToken(refreshToken),
      familyId: randomUUID(),
      deviceId,
      deviceName,
      expiresAt,
    },
  });

  return {
    accessToken: await createAccessToken(userId),
    accessTokenExpiresIn: ACCESS_TOKEN_SECONDS,
    refreshToken,
    refreshTokenExpiresAt: expiresAt.toISOString(),
  };
}

export async function rotateRefreshToken(token: string, deviceId: string) {
  const session = await prisma.mobileSession.findUnique({
    where: { tokenHash: hashRefreshToken(token) },
  });
  if (!session) return null;
  const activeUser = await prisma.user.findFirst({
    where: { id: session.userId, status: "ACTIVE" }, select: { id: true },
  });
  if (!activeUser) return null;

  const now = new Date();
  if (session.revokedAt) {
    if (session.replacedById) {
      await prisma.mobileSession.updateMany({
        where: { familyId: session.familyId, revokedAt: null },
        data: { revokedAt: now },
      });
    }
    return null;
  }
  if (session.expiresAt <= now || session.deviceId !== deviceId) return null;

  const replacementId = randomUUID();
  const replacementToken = newRefreshToken();
  const replacementExpiry = new Date(
    Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000,
  );

  const rotated = await prisma.$transaction(async (tx) => {
    const update = await tx.mobileSession.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { revokedAt: now, replacedById: replacementId, lastUsedAt: now },
    });
    if (update.count !== 1) return false;

    await tx.mobileSession.create({
      data: {
        id: replacementId,
        userId: session.userId,
        tokenHash: hashRefreshToken(replacementToken),
        familyId: session.familyId,
        deviceId: session.deviceId,
        deviceName: session.deviceName,
        expiresAt: replacementExpiry,
      },
    });
    return true;
  });
  if (!rotated) {
    await prisma.mobileSession.updateMany({
      where: { familyId: session.familyId, revokedAt: null },
      data: { revokedAt: now },
    });
    return null;
  }

  return {
    accessToken: await createAccessToken(session.userId),
    accessTokenExpiresIn: ACCESS_TOKEN_SECONDS,
    refreshToken: replacementToken,
    refreshTokenExpiresAt: replacementExpiry.toISOString(),
  };
}

export async function revokeRefreshToken(token: string) {
  const session = await prisma.mobileSession.findUnique({
    where: { tokenHash: hashRefreshToken(token) },
  });
  if (!session) return;

  await prisma.mobileSession.updateMany({
    where: { familyId: session.familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function verifyMobileAccessToken(token: string): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, mobileJwtSecret(), {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    algorithms: ["HS256"],
  });
  if (payload.tokenUse !== "access" || !payload.sub) {
    throw new Error("Invalid access token");
  }
  return payload;
}

export async function mobileUserFromRequest(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice(7);
  if (!token || token.includes(" ")) return null;

  try {
    const payload = await verifyMobileAccessToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, name: true, email: true, image: true, role: true, status: true },
    });
    return user?.status === "ACTIVE" ? user : null;
  } catch {
    return null;
  }
}

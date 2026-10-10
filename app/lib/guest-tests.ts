import { createHmac, randomInt, randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { requestAddress } from "@/app/lib/request-address";

const MAX_GUEST_TESTS_PER_DAY = 3;
const GUEST_TEST_LIFETIME_SECONDS = 30 * 60;

function guestSecret() {
  const secret = process.env.GUEST_TEST_SECRET;
  if (!secret || secret.length < 32) throw new Error("GUEST_TEST_SECRET is not configured");
  return new TextEncoder().encode(secret);
}

export function guestQuotaKey(request: Request, now = new Date()) {
  const address = requestAddress(request);
  const day = now.toISOString().slice(0, 10);
  return createHmac("sha256", guestSecret()).update(`${day}:${address}`).digest("hex");
}

export function guestDailyLimit() {
  return MAX_GUEST_TESTS_PER_DAY;
}

export function shuffleGuestQuestions<T>(items: T[]) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = randomInt(index + 1);
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

export async function createGuestChallenge(questionIds: string[]) {
  return new SignJWT({ tokenUse: "guest_test", questionIds })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("toeic-mini-trainer")
    .setAudience("toeic-guest-test")
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${GUEST_TEST_LIFETIME_SECONDS}s`)
    .sign(guestSecret());
}

export async function verifyGuestChallenge(token: string) {
  const { payload } = await jwtVerify(token, guestSecret(), {
    issuer: "toeic-mini-trainer",
    audience: "toeic-guest-test",
    algorithms: ["HS256"],
  });
  const ids = payload.questionIds;
  if (payload.tokenUse !== "guest_test" || !Array.isArray(ids) || ids.length < 1 || ids.length > 20 ||
    ids.some((id) => typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) || new Set(ids).size !== ids.length) {
    throw new Error("Invalid guest test challenge");
  }
  return ids as string[];
}

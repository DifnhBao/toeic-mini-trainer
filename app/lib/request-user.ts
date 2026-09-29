import { auth } from "@/auth";
import { mobileUserFromRequest } from "@/app/lib/mobile-auth";
import { prisma } from "@/app/lib/prisma";

export async function requestUser(request: Request) {
  // Never fall back to a cookie when a caller supplied an invalid Bearer token.
  // This avoids mixing two authentication contexts in the same request.
  if (request.headers.has("authorization")) {
    return mobileUserFromRequest(request);
  }

  return currentWebUser();
}

export async function currentWebUser() {
  const session = await auth();
  const id = session?.user?.id;
  if (id) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, image: true, role: true, status: true },
    });
    return user?.status === "ACTIVE" ? user : null;
  }

  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) return null;
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, image: true, role: true, status: true },
  });
  return user?.status === "ACTIVE" ? user : null;
}

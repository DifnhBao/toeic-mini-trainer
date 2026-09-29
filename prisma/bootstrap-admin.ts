import "dotenv/config";
import { prisma } from "../app/lib/prisma";

async function main() {
  const userId = process.env.BOOTSTRAP_ADMIN_USER_ID?.trim();
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  if (!userId || !email || process.env.BOOTSTRAP_ADMIN_CONFIRM !== "GRANT_FIRST_ADMIN") {
    throw new Error("Bootstrap requires user ID, matching email and explicit confirmation");
  }
  const result = await prisma.$transaction(async (tx) => {
    const adminCount = await tx.user.count({ where: { role: "ADMIN" } });
    if (adminCount !== 0) throw new Error("An admin already exists");
    const user = await tx.user.findFirst({ where: { id: userId, email, status: "ACTIVE" }, select: { id: true } });
    if (!user) throw new Error("The active user ID and email do not match");
    await tx.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
    await tx.authorizationAuditEvent.create({
      data: { actorId: user.id, action: "FIRST_ADMIN_BOOTSTRAPPED", targetType: "User", targetId: user.id },
    });
    return true;
  });
  if (result) process.stdout.write("First admin role granted.\n");
}

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Bootstrap failed"}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

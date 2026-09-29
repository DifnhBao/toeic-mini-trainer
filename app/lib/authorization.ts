import type { UserRole, UserStatus } from "@prisma/client";

export type Actor = { id: string; role: UserRole; status: UserStatus };

const ROLE_RANK: Record<UserRole, number> = {
  USER: 0,
  REVIEWER: 1,
  ADMIN: 2,
};

export function hasRole(actor: Actor | null, minimum: UserRole) {
  return actor?.status === "ACTIVE" && ROLE_RANK[actor.role] >= ROLE_RANK[minimum];
}

export function canReadOwned(actor: Actor | null, ownerId: string) {
  return actor?.status === "ACTIVE" && actor.id === ownerId;
}

export function canReadQuestion(
  actor: Actor | null,
  question: { ownerId: string | null; publicationStatus: "PRIVATE" | "LEGACY" | "PUBLISHED" | "ARCHIVED" },
) {
  if (question.publicationStatus === "PUBLISHED") return true;
  if (question.publicationStatus === "LEGACY" && actor?.status === "ACTIVE") return true;
  return Boolean(actor && canReadOwned(actor, question.ownerId || ""));
}

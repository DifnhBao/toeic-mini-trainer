import "dotenv/config";
import { GroupType } from "@prisma/client";
import { assertDemoSeedAllowed } from "./seed-policy";

const PART_7_GROUP_ID = "00000000-0000-4000-8000-000000000701";

async function main() {
  // Refuse unsafe targets before importing the database client or issuing writes.
  assertDemoSeedAllowed({
    nodeEnv: process.env.NODE_ENV,
    allowDemoSeed: process.env.ALLOW_DEMO_SEED,
    confirmedDatabaseName: process.env.SEED_DATABASE_NAME,
    databaseUrl: process.env.DATABASE_URL,
  });

  const { prisma } = await import("../app/lib/prisma");
  try {
    await prisma.$transaction(async (tx) => {
      await tx.question.createMany({
        skipDuplicates: true,
        data: [
          {
            id: "00000000-0000-4000-8000-000000000501",
            part: 5,
            content:
              "The marketing team has decided to ------- the launch of the new product until next quarter.",
            options: { A: "delay", B: "delayed", C: "delaying", D: "delays" },
            correctAnswer: "A",
          },
          {
            id: "00000000-0000-4000-8000-000000000502",
            part: 5,
            content:
              "All employees must wear their identification badges ------- at all times while in the building.",
            options: { A: "visible", B: "visibly", C: "visibility", D: "vision" },
            correctAnswer: "B",
          },
        ],
      });

      await tx.questionGroup.createMany({
        skipDuplicates: true,
        data: [
          {
            id: PART_7_GROUP_ID,
            groupType: GroupType.TEXT,
            passageText:
              "<div><strong>To:</strong> All Staff<br><strong>Subject:</strong> Annual Leave<br><br>Please submit your annual leave requests for December by Friday.</div>",
          },
        ],
      });

      await tx.question.createMany({
        skipDuplicates: true,
        data: [
          {
            id: "00000000-0000-4000-8000-000000000702",
            groupId: PART_7_GROUP_ID,
            part: 7,
            content: "What is the purpose of the email?",
            options: {
              A: "To announce a new hire",
              B: "To request vacation forms",
              C: "To schedule a meeting",
              D: "To wish a happy holiday",
            },
            correctAnswer: "B",
          },
          {
            id: "00000000-0000-4000-8000-000000000703",
            groupId: PART_7_GROUP_ID,
            part: 7,
            content: "When is the deadline?",
            options: { A: "Monday", B: "Wednesday", C: "Friday", D: "Next month" },
            correctAnswer: "C",
          },
        ],
      });
    });
    console.log("Demo questions are present; existing user data was not deleted.");
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Demo seed failed.");
    process.exitCode = 1;
  });

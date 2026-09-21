import "dotenv/config"; 
import { GroupType } from "@prisma/client";
import { prisma } from "../app/lib/prisma";

async function main() {
  console.log("Bắt đầu dọn dẹp dữ liệu cũ...");
  await prisma.miniTestQuestion.deleteMany();
  await prisma.miniTest.deleteMany();
  await prisma.question.deleteMany();
  await prisma.questionGroup.deleteMany();

  console.log("Đang nạp Question Bank...");

  // 1. Tạo câu hỏi Part 5 (Độc lập, không có group)
  await prisma.question.createMany({
    data: [
      {
        part: 5,
        content:
          "The marketing team has decided to ------- the launch of the new product until next quarter.",
        options: { A: "delay", B: "delayed", C: "delaying", D: "delays" },
        correctAnswer: "A",
      },
      {
        part: 5,
        content:
          "All employees must wear their identification badges ------- at all times while in the building.",
        options: { A: "visible", B: "visibly", C: "visibility", D: "vision" },
        correctAnswer: "B",
      },
    ],
  });

  // 2. Tạo câu hỏi Part 7 (Có passage chung)
  const groupP7 = await prisma.questionGroup.create({
    data: {
      groupType: GroupType.TEXT,
      passageText:
        '<div class="p-4 bg-gray-50 border rounded"><strong>To:</strong> All Staff<br/><strong>Subject:</strong> Annual Leave<br/><br/>Please submit your annual leave requests for December by Friday.</div>',
    },
  });

  await prisma.question.createMany({
    data: [
      {
        groupId: groupP7.id,
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
        groupId: groupP7.id,
        part: 7,
        content: "When is the deadline?",
        options: { A: "Monday", B: "Wednesday", C: "Friday", D: "Next month" },
        correctAnswer: "C",
      },
    ],
  });

  console.log("Nạp dữ liệu thành công!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

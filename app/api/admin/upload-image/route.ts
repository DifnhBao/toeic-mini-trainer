import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { currentWebUser } from "@/app/lib/request-user";

export async function POST(request: Request) {
  try {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "Endpoint upload local đã bị tắt ở production." },
        { status: 410 },
      );
    }
    const user = await currentWebUser();
    if (!user) {
      return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
    }

    const formData = await request.formData();
    const imageFile = formData.get("image") as File | null;

    if (!imageFile)
      return NextResponse.json({ error: "Không có ảnh" }, { status: 400 });
    if (!imageFile.type.startsWith("image/") || imageFile.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "Ảnh không hợp lệ hoặc lớn hơn 10 MB." }, { status: 400 });
    }

    const bytes = await imageFile.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Lưu vào public/uploads/images
    const uploadDir = path.join(process.cwd(), "public/uploads/images");
    await mkdir(uploadDir, { recursive: true });

    const safeExtension = path.extname(imageFile.name).toLowerCase().replace(/[^.a-z0-9]/g, "") || ".jpg";
    const fileName = `${randomUUID()}${safeExtension}`;
    await writeFile(path.join(uploadDir, fileName), buffer);

    // Trả về đường link để nhét vào JSON
    return NextResponse.json(
      { imageUrl: `/uploads/images/${fileName}` },
      { status: 200 },
    );
  } catch (error) {
    console.error("Lỗi upload ảnh:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

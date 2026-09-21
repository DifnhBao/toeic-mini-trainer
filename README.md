# TOEIC Mini Trainer

Ứng dụng luyện TOEIC cá nhân bằng các phiên ngắn: tự tạo mini test từ kho câu hỏi, luyện theo Listening/Reading hoặc từng Part, xem lịch sử tiến độ, chữa câu sai với AI và hỏi AI Coach như một giáo viên.

## Những gì đã hoạt động

- Đăng nhập Google và tách dữ liệu học theo tài khoản.
- Tạo bài 5–50 câu theo tổng hợp, Listening, Reading hoặc Part 1–7.
- Làm từng câu với bộ đếm thời gian, điều hướng nhanh, audio/ảnh/đoạn đọc và tự lưu bản nháp trên thiết bị.
- Chấm điểm, lưu lịch sử, thống kê độ chính xác theo Part.
- Chữa từng câu sai và sinh giải thích AI có cache trong database.
- AI Coach cho câu hỏi ngữ pháp, từ vựng và chiến thuật TOEIC.
- Nhập JSON hoặc tải PDF + audio, dùng AI cấu trúc dữ liệu rồi kiểm duyệt trước khi lưu.

## Chạy trên máy

Yêu cầu Node.js, PostgreSQL và một Google OAuth app.

1. Sao chép `.env.example` thành `.env` và điền các biến môi trường.
2. Cài dependencies: `npm install`
3. Tạo/cập nhật database: `npx prisma migrate deploy`
4. Chạy môi trường phát triển: `npm run dev`
5. Mở `http://localhost:3000`

Kiểm tra bản production bằng `npm run build` rồi `npm start`.

## Cấu trúc dễ học

- `app/page.tsx`: dashboard và bộ tạo bài luyện.
- `app/(pages)/tests/[id]/page.tsx`: giao diện làm bài.
- `app/(pages)/attempts/[attemptId]/page.tsx`: kết quả và chữa bài.
- `app/(pages)/coach/page.tsx`: giao diện AI Coach.
- `app/(pages)/admin/extract/page.tsx`: pipeline PDF/audio → dữ liệu câu hỏi.
- `app/api/**/route.ts`: backend HTTP của từng luồng.
- `prisma/schema.prisma`: mô hình dữ liệu.
- `data/01.json`: ví dụ đúng định dạng để nhập câu hỏi.
- `docs/PRODUCT_BLUEPRINT.md`: phân tích sản phẩm, kiến trúc và roadmap.

## Luồng vận hành

1. Người dùng đăng nhập.
2. Dashboard gọi API tiến độ và nhận thống kê của đúng tài khoản.
3. Khi tạo bài, server chọn ngẫu nhiên câu hỏi phù hợp và tạo `MiniTest`.
4. Trang làm bài chỉ nhận nội dung câu hỏi; đáp án đúng không được gửi xuống trình duyệt.
5. Khi nộp, server chấm điểm, tạo `TestAttempt` và `UserAnswer`.
6. Trang kết quả đọc dữ liệu thuộc đúng tài khoản. Với câu sai, AI tạo lời giải một lần rồi cache lại.

## Lưu ý trước khi đưa lên Internet

Hiện audio/ảnh upload được lưu trong `public/uploads` để dễ học và chạy local. Filesystem của nhiều nền tảng serverless không bền vững. Trước khi vận hành production, chuyển file sang object storage (S3/R2), thêm bảng metadata tài liệu, giới hạn tần suất gọi AI và chỉ cấp quyền nhập đề cho tài khoản chủ sở hữu.

Không commit `.env`, file audio/PDF riêng tư hoặc khóa API lên Git.

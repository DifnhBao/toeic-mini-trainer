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

`prisma migrate deploy` không chạy seed. Bộ câu hỏi demo chỉ dành cho database dev/test/demo tách biệt: đặt `ALLOW_DEMO_SEED=true` và `SEED_DATABASE_NAME` bằng chính tên database trong `DATABASE_URL`, rồi chạy `npx prisma db seed`. Script từ chối `NODE_ENV=production`, tên database không phải dev/test/demo hoặc thiếu xác nhận; không xóa dữ liệu đang có. Không chạy seed trên database hiện tại chỉ để thử nghiệm.

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

Luồng nhập PDF/audio trên web và mobile dùng chung object storage private tương thích S3/R2. Thư mục `public/uploads` chỉ còn để tương thích dữ liệu cũ, đã bị Git bỏ qua và không được dùng cho tài liệu mới hoặc production.

### Object storage riêng tư — Giai đoạn 5

1. Tạo bucket private trên S3/R2 và credentials chỉ có quyền với bucket đó.
2. Điền các biến `OBJECT_STORAGE_*` theo `.env.example`; không dùng tiền tố `NEXT_PUBLIC_`.
3. Cấu hình CORS chỉ cho origin tin cậy, method `PUT` và header `Content-Type` nếu upload từ web.
4. Cấu hình lifecycle xóa prefix `pending/` sau 24 giờ để dọn upload chưa hoàn tất hoặc URL PUT bị dùng lại.
5. Review cả hai migration `20260921170000_add_uploaded_assets` và `20260921190000_add_ingestion_jobs`, sau đó mới chạy `prisma migrate deploy` trong deployment job.

API chỉ ký quyền PUT trong 5 phút. Server kiểm tra kích thước, MIME và magic bytes, sau đó copy có điều kiện ETag từ `pending/` sang `ready/`. URL đọc chỉ sống 60 phút và chỉ cấp cho chủ sở hữu đã đăng nhập. Pipeline AI chạy theo tác vụ có trạng thái, cho phép thử lại tối đa ba lần và luôn yêu cầu người dùng kiểm tra trước khi nhập câu hỏi.

Việc xử lý nền hiện dùng `after()` của Next.js. Trên Vercel, GitHub Actions gọi
endpoint worker có secret mỗi 5 phút để quét job `PENDING` và phục hồi job bị
ngắt; xem [hướng dẫn staging Vercel](docs/VERCEL_STAGING.md). Tác vụ vượt giới hạn
Function vẫn cần worker/queue riêng trước khi mở rộng người dùng.

Không commit `.env`, file audio/PDF riêng tư hoặc khóa API lên Git.

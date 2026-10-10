# TOEIC Mini Trainer

Ứng dụng luyện TOEIC cá nhân bằng các phiên ngắn: tự tạo mini test từ kho câu hỏi, luyện theo Listening/Reading hoặc từng Part, xem lịch sử tiến độ, chữa câu sai với AI và hỏi AI Coach như một giáo viên.

## Những gì đã hoạt động

- Đăng nhập Google và tách dữ liệu học theo tài khoản.
- Tạo bài 5–50 câu theo tổng hợp, Listening, Reading hoặc Part 1–7.
- Làm từng câu với bộ đếm thời gian, điều hướng nhanh, audio/ảnh/đoạn đọc và tự lưu bản nháp trên thiết bị.
- Chấm điểm, lưu lịch sử, thống kê độ chính xác theo Part.
- Chữa từng câu sai và sinh giải thích AI có cache trong database.
- AI Coach cho câu hỏi ngữ pháp, từ vựng và chiến thuật TOEIC.
- Quản trị viên nhập PDF + audio trên web, sửa/duyệt và công khai; người học chọn bài có sẵn trong Kho bài trên web/Android.

## Chạy trên máy

Yêu cầu Node.js, PostgreSQL và một Google OAuth app.

1. Sao chép `.env.example` thành `.env` và điền các biến môi trường.
2. Cài dependencies: `npm install`
3. Tạo/cập nhật database: `npx prisma migrate deploy`
4. Chạy môi trường phát triển: `npm run dev`
5. Mở `http://localhost:3000`

Kiểm tra bản production bằng `npm run build` rồi `npm start`.

Production build dùng Webpack theo tùy chọn chính thức của Next.js 16.3.8;
Turbopack trên Windows hiện dừng ở tiến trình PostCSS. `npm run build:turbo`
giữ lại cách tái hiện để chẩn đoán. Không dùng build chẩn đoán để phát hành.

Kiểm tra trước phát hành: `npm test`, `npm run typecheck`,
`npm run typecheck:mobile`, `npm run lint`, `npm run build`.
Workflow `.github/workflows/quality.yml` kiểm tra web/mobile và chạy migration,
test tích hợp trên PostgreSQL CI riêng. Hướng dẫn staging, hạn mức, backup và
nghiệm thu ở `docs/RELEASE_RUNBOOK.md`.

Kiểm tra dependency trước phát hành bằng `npm run audit:dependencies -- --project web`,
`npm run audit:dependencies -- --project mobile` và `npm audit --omit=dev --audit-level=high`.
Các ngoại lệ công cụ build hết hạn ngày 22/10/2026; xem `docs/DEPENDENCY_SECURITY_2026-10-08.md`.

Web và mobile dùng chung kiểm tra nộp bài. Web lưu mã lần nộp cùng câu trả lời,
thời gian và vị trí câu trên thiết bị để retry không tạo attempt trùng. Khi bộ
nhớ thiết bị không ghi được, giao diện báo lỗi thay vì báo đã lưu thành công.

Production rate limit dùng bộ đếm PostgreSQL chung giữa các instance; lỗi
counter trả 503 và không thực hiện tác vụ. Quota AI cá nhân vẫn được giữ, thêm
trần toàn hệ thống `AI_DAILY_GLOBAL_CALL_LIMIT` (mặc định 200 lượt/ngày UTC),
`AI_ENABLED=false` và `INGESTION_ENABLED=false` để tạm dừng. Trần này đếm lượt
gọi, kể cả retry phân tích tài liệu, không phải giới hạn chi phí bằng tiền.

`prisma migrate deploy` không chạy seed. Bộ câu hỏi demo chỉ dành cho database dev/test/demo tách biệt: đặt `ALLOW_DEMO_SEED=true` và `SEED_DATABASE_NAME` bằng chính tên database trong `DATABASE_URL`, rồi chạy `npx prisma db seed`. Script từ chối `NODE_ENV=production`, tên database không phải dev/test/demo hoặc thiếu xác nhận; không xóa dữ liệu đang có. Không chạy seed trên database hiện tại chỉ để thử nghiệm.

## Cấu trúc dễ học

- `app/page.tsx`: dashboard và bộ tạo bài luyện.
- `app/(pages)/tests/[id]/page.tsx`: giao diện làm bài.
- `app/(pages)/attempts/[attemptId]/page.tsx`: kết quả và chữa bài.
- `app/(pages)/coach/page.tsx`: giao diện AI Coach.
- `app/(pages)/admin/extract/page.tsx`: pipeline PDF/audio → dữ liệu câu hỏi.
- `app/(pages)/admin/page.tsx`: dashboard quản trị web; các trang con theo dõi tài khoản, tài liệu chờ duyệt, job nhập đề và câu hỏi chung.
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

Quản trị viên nhập PDF/audio trên web vào object storage private tương thích S3/R2. Android dành cho chọn bài và luyện, không nhập file mới. Thư mục `public/uploads` chỉ còn để tương thích dữ liệu cũ, đã bị Git bỏ qua và không được dùng cho tài liệu mới hoặc production.

### Object storage riêng tư — Giai đoạn 5

1. Tạo bucket private trên S3/R2 và credentials chỉ có quyền với bucket đó.
2. Điền các biến `OBJECT_STORAGE_*` theo `.env.example`; không dùng tiền tố `NEXT_PUBLIC_`.
3. Cấu hình CORS chỉ cho origin tin cậy, method `PUT` và header `Content-Type` nếu upload từ web.
4. Cấu hình lifecycle xóa prefix `pending/` sau 24 giờ để dọn upload chưa hoàn tất hoặc URL PUT bị dùng lại.
5. Review cả hai migration `20260921170000_add_uploaded_assets` và `20260921190000_add_ingestion_jobs`, sau đó mới chạy `prisma migrate deploy` trong deployment job.

API chỉ ký quyền PUT trong 5 phút. Server kiểm tra kích thước, MIME và magic bytes, sau đó copy có điều kiện ETag từ `pending/` sang `ready/`. URL đọc chỉ sống 60 phút và chỉ cấp cho chủ sở hữu đã đăng nhập. Pipeline AI chạy theo tác vụ có trạng thái, cho phép thử lại tối đa ba lần và luôn yêu cầu người dùng kiểm tra trước khi nhập câu hỏi.

Việc xử lý nền hiện dùng `after()` của Next.js. Trên Vercel, GitHub Actions gọi
endpoint worker có secret mỗi giờ để quét job `PENDING` và phục hồi job bị
ngắt; xem [hướng dẫn staging Vercel](docs/VERCEL_STAGING.md). Tác vụ vượt giới hạn
Function vẫn cần worker/queue riêng trước khi mở rộng người dùng.

Không commit `.env`, file audio/PDF riêng tư hoặc khóa API lên Git.

## Quản trị web

Đăng nhập bằng tài khoản có vai trò `ADMIN`, rồi mở `/admin`. Dashboard và các trang quản trị mới kiểm tra vai trò đang lưu trong database ở mỗi request; API thay đổi quyền, trạng thái tài khoản, duyệt đóng góp và xuất bản/ẩn câu hỏi tiếp tục kiểm tra quyền độc lập và ghi audit. Admin có thể tìm user, xem trạng thái PDF/audio và job xử lý, duyệt tài liệu kèm PDF nguồn và audio, rà soát câu hỏi `LEGACY`, và xem nhật ký phân trang. Mọi thay đổi quyền/trạng thái hay xuất bản câu hỏi cần lý do.

Trang `/admin/extract` dành cho ADMIN chuẩn bị PDF/audio, kiểm tra từng câu rồi chuyển sang `/admin/contributions` để duyệt và công khai. Người học vào `/library` hoặc tab Kho bài trên Android; chọn trọn nhóm câu đã công khai cùng media/ngữ cảnh. Sáu API tạo nội dung mới, kể cả JSON cũ, chặn USER/REVIEWER. Các câu và nháp cá nhân đã lưu trước đây không bị xóa. Không tự động xuất bản câu hỏi `LEGACY`. Xem [hướng dẫn nhập bài nghe và nghiệm thu](docs/ADMIN_LISTENING_WORKFLOW_2026-10-08.md).

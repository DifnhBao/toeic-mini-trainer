# Sửa lỗi phân tích PDF listening scan

Source `aea97e2`, nhánh `codex/release-readiness`, đã push. Vercel `dpl_7WjBJYxSd87J4CWMgEWC8XzR83HS` READY và đã promote lên `https://toeic-mini-trainer.vercel.app`.

## Bằng chứng

- 133 unit, 19 PostgreSQL integration và kiểm tra lại 16 route test đạt; DB test loopback, container đã dừng.
- TypeScript và production build Next.js 16.3.8 Webpack đạt (41 trang); lint 0 lỗi/3 cảnh báo ảnh có sẵn.
- 15/15 smoke đạt trước và sau promote. Bundle thực ở deployment riêng và domain chính có PDF 50 MiB và cảnh báo thiếu answer key. Phép tìm chuỗi thô ban đầu không thấy cảnh báo do minifier escape Latin-1; kiểm tra sau giải mã escape JavaScript đạt.
- Payload 144 tệp, đủ 120 tệp app/types/prisma; không có `.env`, PDF/MP3 mẫu, backup, APK, mobile hay dữ liệu test.

## Nguyên nhân và sửa đổi

File ETS 14 trang đã qua upload. Bìa có 47 ký tự text, các trang còn lại là ảnh scan. Worker cũ xét tổng text nên chỉ gửi chữ bìa cho AI khi chọn 1–4, gây `DOCUMENT_NO_QUESTIONS`.

Worker mới xét từng trang. Nếu cụm quá nặng, giữ text trong prompt và chỉ đưa trang thiếu text vào PDF OCR, kèm số trang gốc. Với file thật: cụm 1–4 nặng 10.995.190 byte được gửi text trang 1 và OCR trang 2–4 là 4.350.144 byte; các cụm 5–8, 9–12, 13–14 cũng dưới 5 MiB. Đây là kiểm chứng chuẩn bị dữ liệu local, chưa phải kết quả Gemini thật.

Draft thiếu answer key giữ đáp án rỗng; người duyệt phải bổ sung trước khi lưu/công khai. Schema lưu vẫn bắt buộc đáp án hợp lệ. APK cũ gọi import bodyless nhận `REVIEW_REQUIRED` trước khi claim nếu draft còn thiếu key; job cũ hợp lệ giữ tương thích. AI Part 2 phải trả đúng A/B/C; các Part khác A/B/C/D. Không bịa lời thoại hoặc đáp án từ audio chưa được xử lý.

## Nghiệm thu tiếp

1. Ctrl+F5 trang ADMIN, mở lại/chọn PDF và MP3, phân tích lại khoảng trang đã lỗi. Job FAILED cũ không tự biến thành kết quả mới.
2. Kiểm tra số câu/Part/phương án; bỏ qua ví dụ. Trang 8 bắt đầu Part 3 có câu hỏi in trên giấy; thử 8–11 có ích nhưng không thay thế Part 1/2.
3. Chủ dự án xác nhận có file đáp án và sẽ gửi đường dẫn; chưa nhận đường dẫn khi lập biên bản. Đối chiếu key trước khi duyệt.
4. Chưa tự cắt ảnh Part 1/biểu đồ thành media hoặc chia MP3 theo câu. Không coi toàn bộ 100 câu đã sẵn sàng cho người học chỉ vì OCR có kết quả.
5. Tại ngày ghi báo cáo 08/10, trình duyệt Codex chưa có phiên ADMIN để nghiệm thu OCR/lưu/công khai/audio thật. Cập nhật 09/10: phiên ADMIN có sẵn đã upload PDF/MP3 và OCR/lưu/mở lại thành công cụm 1–4; chưa công khai hoặc phát audio, quyền truy cập/upload site sau đó bị từ chối. Xem [ETS_UPLOAD_OCR_ACCEPTANCE_2026-10-09.md](ETS_UPLOAD_OCR_ACCEPTANCE_2026-10-09.md). Không ghi/import/seed DB thật bằng script test.

APK Kho bài vẫn là source mobile `dee15f2`; không cần build mới cho sửa web/API này. QA S23 FE của bản Kho bài, Android thứ hai và beta còn mở.

## Rollback

Bản trước `d02f05d`: `dpl_6QLsfejWfeqwCgUg6qKF545p2aEm`, URL `https://toeic-mini-trainer-gpkdrjvpm-le-dinh-bao-s-projects.vercel.app`.

Không có migration mới. Bản cũ không xử lý được draft đáp án rỗng: rollback giữ dữ liệu nhưng có thể không lưu được draft mới dù người duyệt sửa. Nếu đã có draft mới, ưu tiên dừng ingestion và sửa tiến; không xóa job hoặc tự gán đáp án. Nếu rollback phải kiểm tra draft hiện có và ghi rõ hạn chế.

Log chỉ lưu local: `Test/pdf-diagnosis/preparation-result.json`, `Test/unit-scan.txt`, `Test/integration-scan.txt`, `Test/route-scan-final.txt`, `Test/typecheck-scan.txt`, `Test/lint-scan.txt`, `Test/build-scan.txt`, `Test/vercel-protected-smoke-aea97e2.txt`, `Test/vercel-promoted-smoke-aea97e2.txt`, `Test/vercel-scan-served-bundle-verified.json`, `Test/vercel-scan-canonical-bundle.json`.

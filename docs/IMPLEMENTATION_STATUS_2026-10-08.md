# Kết quả triển khai ngày 08/10/2026

Đây là kết quả sau đợt thực hiện kế hoạch trong `PROJECT_ASSESSMENT_2026-10-08.md`. Các ước lượng phần trăm trong báo cáo trước là đánh giá tại thời điểm khảo sát, không phải số đo nghiệm thu.

## Phần đã thực hiện

- Khắc phục production build trên Windows bằng Webpack; giữ lệnh Turbopack riêng để kiểm tra sau.
- Hoàn thiện luồng mobile xem/sửa/loại câu trích xuất, lưu bản nháp, tìm lại tác vụ, kiểm tra protocol và chỉ nhập câu đã duyệt. Có bộ tình huống nghiệm thu MR-01…MR-14.
- Web và mobile dùng chung xử lý nộp/chấm bài. Kiểm tra quyền, câu thuộc đề và lựa chọn hợp lệ; retry và nộp đồng thời chỉ tạo một attempt. Web lưu mã lần nộp, đáp án, thời gian và vị trí để phục hồi khi tải lại.
- Chuyển limiter production sang bộ đếm PostgreSQL dùng chung; lỗi lưu counter chặn tác vụ, có Retry-After. Không để user đã xác thực đổi header IP để lấy quota mới.
- Thêm công tắc dừng AI/ingestion và hạn mức gọi provider toàn ứng dụng, tính cả retry của worker; giới hạn output và timeout. Hạn mức lượt gọi chưa thay thế ngân sách tiền trên provider.
- Lấy câu và thống kê Part bằng truy vấn DB, tránh tải toàn bộ ngân hàng/lịch sử vào bộ nhớ API.
- Chặn tự liên kết Google/Apple mới vào tài khoản cũ chỉ vì trùng email.
- Thêm kiểm thử tích hợp PostgreSQL, workflow CI web/mobile/integration, smoke API, thử backup/restore cách ly và log lỗi Next.js có cấu trúc.
- Viết quy trình phát hành, rollback, sự cố, cấu hình và tiêu chí mở beta trong `RELEASE_RUNBOOK.md`.

## Bằng chứng kiểm tra

| Hạng mục | Kết quả đã quan sát |
| --- | --- |
| Unit/regression | 93 kiểm thử đạt; không dùng DB/provider thật |
| PostgreSQL integration | 11 kiểm thử đạt trên DB loopback `toeic_release_test` |
| Schema | 11 migration hiện có áp dụng thành công trên DB test; không thêm migration |
| Kiểu dữ liệu | TypeScript web và mobile đạt |
| Lint | 0 lỗi, 3 cảnh báo `<img>` hiện có |
| Production build | Next.js 16.3.8 Webpack đạt trên Windows ngoài sandbox |
| Android bundle | Expo export Android đạt; đây chưa phải APK được nghiệm thu |
| Backup/restore | Dump/restore dữ liệu học mẫu và quan hệ đạt trên PostgreSQL Docker; không phải backup cloud hoặc file R2 |
| Smoke local | 7 kiểm tra public/không đăng nhập đạt; không xác minh Google OAuth hoặc AI thật |
| API công khai cũ | 6/7 smoke đạt; GET ingestion list trả 405, cần deploy API mới trước mobile |
| Dependency web production | `npm audit --omit=dev` báo 0 lỗ hổng sau vá dependency |
| Dependency công cụ build | Braces/node-forge chưa có bản vá; ngoại lệ CI hết hạn 22/10/2026, không có trong 1.337 source của bundle Android mới |
| APK preview nền | EAS build `1f35e1b8-3a13-4977-907b-297a541d3b1a` FINISHED từ commit `24b9d6e`; chưa chứa bản vá dependency tiếp theo |
| Vercel | CLI đã đăng nhập thành công; project/env names được kiểm tra; dry-run sau sửa ignore xác minh 136 tệp, đủ 112 tệp app/types/prisma và không có env/APK/dữ liệu test |

Các lỗi EPERM của sandbox khi build/đọc module đã được kiểm tra lại ngoài sandbox. Một lượt unit test đồng thời build gặp EPERM khi đọc React; phải dùng kết quả của lượt chạy hoàn chỉnh sau đó. Không bỏ qua kiểm thử thất bại để tuyên bố đạt.

## Các cổng còn lại trước sử dụng thực tế

1. Xác minh backup và deploy commit mới lên project Vercel đã đăng nhập. Không chạy seed hoặc migration tùy tiện vào DB thật.
2. Smoke và đăng nhập trên API mới; kiểm tra ingestion protocol, worker, storage và AI trên tài khoản test.
3. Build APK preview từ cùng commit, cài điện thoại Android thật và nghiệm thu luồng học/Google/upload/OCR/audio/phục hồi lỗi khi Metro tắt.
4. Cấu hình cảnh báo, ngân sách, backup Neon và R2; chỉ định người vận hành và kiểm duyệt nội dung.
5. Chuẩn bị bộ nội dung có quyền sử dụng, hướng dẫn/support/chính sách dữ liệu, rồi chạy beta 10–20 người trong hai tuần và xử lý lỗi trước mở rộng.

Nguồn đã được sửa và kiểm tra không đồng nghĩa hệ thống đang chạy ngoài Internet đã được cập nhật. Không có cơ sở để tuyên bố toàn bộ sản phẩm hoàn tất hoặc nâng tỷ lệ sẵn sàng chỉ vì build/test đạt.

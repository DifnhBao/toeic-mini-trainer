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
| Unit/regression | 111 kiểm thử đạt; không dùng DB/provider thật |
| PostgreSQL integration | 15 kiểm thử đạt trên DB loopback `toeic_release_test`, gồm thống kê bài rỗng/câu lặp/bỏ qua và tách tài khoản |
| Schema | 11 migration hiện có áp dụng thành công trên DB test; không thêm migration |
| Kiểu dữ liệu | TypeScript web và mobile đạt |
| Lint | 0 lỗi, 3 cảnh báo `<img>` hiện có |
| Production build | Next.js 16.3.8 Webpack đạt trên Windows ngoài sandbox |
| Android bundle | Expo export Android đạt; đây chưa phải APK được nghiệm thu |
| Backup/restore | Fixture local đạt; DB Neon thật đã backup mã hóa DPAPI và restore cách ly, 22 bảng khớp snapshot trong 24,657 giây; chưa backup R2/định kỳ/offsite |
| Smoke local | 7 kiểm tra public/không đăng nhập đạt; không xác minh Google OAuth hoặc AI thật |
| Smoke sau promote | 7/7 kiểm tra public đạt tại `https://toeic-mini-trainer.vercel.app`; chưa phải nghiệm thu tài khoản thật |
| OAuth preflight | Google provider đã bật; sign-in/callback URL đúng domain chính; chưa xác minh đăng nhập thật |
| API cũ trước rollout | 6/7 smoke đạt; GET ingestion list trả 405 |
| Dependency web production | `npm audit --omit=dev` báo 0 lỗ hổng sau vá dependency |
| Dependency công cụ build | Braces/node-forge chưa có bản vá; ngoại lệ CI hết hạn 22/10/2026, không có trong 1.337 source của bundle Android mới |
| APK preview nền | EAS build `1f35e1b8-3a13-4977-907b-297a541d3b1a` FINISHED từ commit `24b9d6e`; chưa chứa bản vá dependency tiếp theo |
| Vercel | Deployment `dpl_51LUoFCVA9UrTPrpB746D2J7UHn2`, source `dcb6524`, build Ready; 7/7 smoke trước/sau promote; giữ `5107b97` để rollback |
| Payload Vercel | 137 tệp, đủ 113 tệp app/types/prisma; không có env/APK/dữ liệu test; có lệnh kiểm tra source không bị thiếu |
| APK `5107b97` | EAS build `d2e40383-bd61-407d-9ad5-2081468f4165` FINISHED; người thử S23 FE báo A-01/02/06/07 đạt và ba lỗi A-03/04/08 |
| APK sửa Samsung | Build `ee0468f2-ffd3-4d5f-ad45-b9c7c6dc4a27`, source `dcb6524`, FINISHED; artifact/CRC/arm64/SHA-256 đạt; chờ thử lại theo `ANDROID_RETEST_DCB6524.md` |
| Truy vấn tải local | Cùng fixture 20 user/400.000 answer: p95 thống kê cũ/mới 1.218/354 ms khi lặp 20 câu và 1.209/739 ms khi phủ 10.000 câu; chưa phải HTTP/production (`PERFORMANCE_LOCAL_2026-10-08.md`) |

Các lỗi EPERM của sandbox khi build/đọc module đã được kiểm tra lại ngoài sandbox. Một lượt unit test đồng thời build gặp EPERM khi đọc React; phải dùng kết quả của lượt chạy hoàn chỉnh sau đó. Không bỏ qua kiểm thử thất bại để tuyên bố đạt.

## Đối chiếu với kế hoạch tổng thể

| Nhóm công việc | Trạng thái thực tế |
| --- | --- |
| BUILD-01, BASE-01 | Production build đã đạt local và Vercel; source được chốt/push, không có secret hoặc dữ liệu thử nghiệm |
| BASE-02, E2E-01 | API `dcb6524` đã lên domain chính, 7 smoke đạt; DB hiện có 11 migration, không thêm migration; readiness có secret chưa kiểm tra được |
| E2E-02…05 | APK sửa ba lỗi Samsung đã build xong; chờ nghiệm thu lại S23 FE Android 16 / One UI 8.5 và thiết bị thứ hai |
| SAFE-01/02 | Kiểm thử tích hợp phân quyền/auth/scoring và chống nộp trùng đã đạt trên PostgreSQL cách ly |
| SAFE-03 | Đã rollout limiter, quota/ngày, công tắc dừng và giới hạn AI đồng thời qua PostgreSQL; kiểm chứng local đạt, chưa thử provider/tải thật; ngân sách tiền/cảnh báo chưa hoàn tất |
| OPS-01 | Workflow và cổng dependency đã có, kiểm tra local đạt; chưa xác minh được remote CI hoặc branch protection bằng quyền GitHub hiện có |
| OPS-02 | Backup DB thật mã hóa và restore cách ly đạt; backup định kỳ/offsite/PITR và R2 chưa hoàn tất |
| OPS-03/04 | Đã có log/runbook/worker recovery nền; chưa nghiệm thu cảnh báo thực tế, tải worker và phục hồi khi ngắt |
| CONTENT, UX, PERF | Cần nội dung có quyền dùng, nghiệm thu thiết bị và đo tải lớn; tối ưu truy vấn đã triển khai nhưng chưa phải báo cáo tải mục tiêu |
| Beta/phát hành rộng | Chưa bắt đầu; cần hoàn tất các cổng trước beta và theo dõi 10–20 người trong hai tuần |

Hiện đã hoàn thành phần nền kỹ thuật và rollout API để bắt đầu nghiệm thu giai đoạn 1. Các việc bảo mật/kiểm thử của giai đoạn 2 được thực hiện sớm; không đồng nghĩa giai đoạn 2 đã đóng hoặc sản phẩm đã sẵn sàng phát hành rộng.

## Các cổng còn lại trước sử dụng thực tế

1. Kiểm tra readiness có xác thực và worker/storage trên hạ tầng: Vercel không cho pull worker secret qua CLI. Không thay/đọc lén secret để bỏ qua giới hạn này.
2. Đăng nhập trên API mới; kiểm tra ingestion protocol và AI trên tài khoản test.
3. Samsung S23 FE đã báo A-01/A-02/A-06/A-07 đạt ở APK trước; APK `dcb6524` đã được người thử ghi R-02 (phục hồi bài) và R-03 (tạo bài sau nộp) đạt trong `ANDROID_RETEST_DCB6524.md`. Các mục còn lại, gồm Coach/media/đổi tài khoản, đang chờ kết quả. A-05 thiếu dữ liệu media, đã chuẩn bị bộ mẫu gốc để thử audio/passage; ảnh cần kiểm tra riêng. Cần thiết bị Android thứ hai trước khi đóng các cổng E2E.
4. Cấu hình cảnh báo, ngân sách, backup Neon định kỳ/offsite và R2; chỉ định người vận hành và kiểm duyệt nội dung.
5. Chuẩn bị bộ nội dung có quyền sử dụng, hướng dẫn/support/chính sách dữ liệu, rồi chạy beta 10–20 người trong hai tuần và xử lý lỗi trước mở rộng.

API ngoài Internet đã được cập nhật như bằng chứng ở trên. APK/device QA, vận hành đầy đủ và beta vẫn chưa hoàn tất; không nâng tỷ lệ sẵn sàng chỉ vì build/test đạt.

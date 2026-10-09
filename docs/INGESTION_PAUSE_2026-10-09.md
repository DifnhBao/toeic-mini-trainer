# Giữ tác vụ OCR khi tạm dừng dịch vụ — 09/10/2026

## Vấn đề và hành vi mới

Trước sửa, worker vẫn nhận job PENDING và tăng attemptCount khi AI/OCR bị tắt. Công tắc được kiểm tra muộn, sau khi đọc hoặc phân tích PDF; job có thể chuyển FAILED với lỗi hạn mức/capacity và mất một lượt thử. Cron tiếp tục xử lý hàng đợi trong thời gian bảo trì có thể làm các tài liệu chờ mất lượt thử mà chưa gọi provider.

Khi `AI_ENABLED=false` hoặc `INGESTION_ENABLED=false`, worker mới không nhận job, không đọc object và không đổi hàng đợi. Endpoint drain vẫn kiểm tra cấu hình và Bearer secret trước khi trả HTTP 200 `{ queued: false, paused: true }`. Đây là phản hồi tạm dừng, không phải bằng chứng hàng đợi đã xử lý xong.

Nếu worker quan sát công tắc tắt tại một mốc kiểm tra sau khi đã nhận job nhưng trước khi gọi provider, worker trả job về PENDING, xóa mốc xử lý/lỗi và hoàn lại lượt vừa nhận. Mọi cập nhật vẫn so đúng PROCESSING, startedAt và attemptCount; worker cũ bị thay thế không được hoàn lượt hoặc requeue worker mới. Lỗi capacity thực khi dịch vụ vẫn bật tiếp tục chuyển FAILED, không bị che thành tạm dừng.

Kiểm tra công tắc được thực hiện trước claim, sau claim, sau đọc tài liệu, trước lấy capacity và trước dự trữ quota toàn hệ thống. Bật lại dịch vụ cho phép lần trigger tiếp theo xử lý job cũ. Không cần upload lại hoặc tạo job mới.

## Phạm vi và kiểm chứng

`tests/integration/ingestion-worker.test.ts` bổ sung bảy kiểm thử PostgreSQL: hai công tắc trước claim; hai công tắc giữa lúc đọc; worker cũ trả muộn trong lúc tắt; phân biệt capacity bị tắt với lỗi thật; xác thực drain trong lúc tắt. Dữ liệu PDF/trích xuất giả được điều khiển trong bộ nhớ; không gọi Gemini hoặc R2.

| Kiểm tra | Kết quả |
| --- | --- |
| Worker PostgreSQL riêng | 13/13 đạt, gồm bảy trường hợp mới |
| PostgreSQL toàn bộ | 68/68 đạt, không bỏ qua; 11 suite, 116,234 giây |
| Unit toàn bộ | 209/209 đạt |
| TypeScript | Đạt |
| Lint | 0 lỗi, ba cảnh báo img hiện có |
| Production build | Next.js 16.3.8 Webpack đạt, 41/41 trang tĩnh; không chạy đồng thời integration |

DB PostgreSQL 16 chỉ bind `127.0.0.1:55433`, tên `toeic_release_test`, có opt-in và guard loopback. Kiểm tra độc lập sau chạy: users/assets/jobs/questions/tests/attempts/personal explanations/explanation cache đều còn 0; container riêng đã dừng. Không ghi DB thật, gọi AI hoặc storage cloud.

Log đặt trong `Test/`: `integration-ingestion-pause-targeted.txt`, `integration-ingestion-pause.txt`, `unit-ingestion-pause.txt`, `typecheck-ingestion-pause.txt`, `lint-ingestion-pause.txt`, `build-ingestion-pause.txt`, `ingestion-pause-fixture-cleanup.txt`; không đưa dữ liệu fixture hoặc log lên Git.

## Triển khai và giới hạn vận hành

- Chưa triển khai bản sửa; mốc API live được xác minh gần nhất là `ff80432`. Không thêm migration hoặc thay giao thức người học/APK.
- Công tắc là biến môi trường của từng process/deployment. Thay cấu hình cần áp dụng qua quy trình deploy của hạ tầng; không có cơ chế phát công tắc tức thời tới invocation cũ. Kiểm thử thay biến trong process chỉ tái hiện các mốc kiểm tra, chưa chứng minh việc truyền cấu hình trên Vercel.
- Lời gọi provider đã bắt đầu vẫn có thể hoàn tất và lưu kết quả. Không hoàn quota hoặc lượt thử đã thực sự dùng cho provider chỉ vì sau đó tắt AI; đây không phải cơ chế hủy lời gọi từ xa.
- Trong lúc paused, endpoint drain cũng bỏ qua sweep trạng thái treo và dọn counter hết hạn. Lease AI vẫn có cơ chế hết hạn theo đồng hồ DB khi lấy capacity; maintenance thông thường tiếp tục khi bật lại.
- Giữ lịch recovery mỗi giờ và tối đa một job mỗi drain. Bật lại không tự xử lý toàn bộ backlog; cần trigger hợp lệ hoặc chờ lịch hiện có. Không thay lịch, quota, ngân sách hoặc secret cloud.
- Rollback về API cũ mở lại nguy cơ tiêu hao lượt thử trong thời gian tắt; giữ worker cũ dừng nhận job trong bảo trì. Không sửa hàng loạt job thật để nghiệm thu.
- OPS-04 vẫn cần xác minh cron/secret và ngắt worker trong staging, đo thời gian phục hồi thực tế. CI từ xa, UI quản trị, media thật, Android và beta là các cổng riêng chưa đóng.

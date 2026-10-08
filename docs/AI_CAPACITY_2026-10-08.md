# Giới hạn gọi AI dùng chung

Ngày kiểm chứng: 08/10/2026. Không thêm migration; dùng namespace riêng trong `user_ai_usage`.

- `AI_MAX_CONCURRENT_CALLS` mặc định 3, chấp nhận số nguyên 1–20. Cấu hình sai, AI bị tắt hoặc không giữ được lease đều chặn gọi provider.
- PostgreSQL transaction advisory lock chỉ giữ khi đếm/cấp lease, không giữ trong thời gian gọi Gemini. Tất cả function web/mobile/worker dùng chung DB và namespace `ai:lease:v1:`.
- Chỉ dự trữ quota ngày sau khi có chỗ. AI Coach/lời giải trả HTTP 503 và `Retry-After` khi đầy; lời giải dùng cooldown ít nhất 60 giây. Cache đã có không gọi AI.
- Deadline gồm tra quota và provider: 45 giây cho Coach/lời giải, 240 giây cho nhập đề. SDK được đặt `retryOptions.attempts = 1`; không có retry HTTP ngầm. Worker retry có kiểm soát vẫn tính lượt provider riêng.
- Thành công giải phóng lease. Chưa gọi provider thì lỗi/quota hết cũng giải phóng. Timeout hoặc provider lỗi giữ lease đến deadline cộng 30 giây vì hủy ở client không bảo đảm server Gemini đã ngừng tính toán/tính phí. Lease dùng giờ DB và UUID riêng, tự thu hồi khi hết hạn; generic quota sweep không được xóa lease bằng giờ app.
- Job nhập đề gặp `AI_BUSY` trở lại `PENDING`, giữ asset và hoàn lại lần thử đã claim; không tạo thêm job hoặc tiêu thụ quota provider. Lần trigger worker sau thử lại. Cron hiện tại theo giờ, chưa cam kết thời gian chờ ngắn hoặc tự drain toàn bộ hàng đợi.
- Endpoint upload cũ vẫn trả 410 ở production. Khi dùng trong development, nó cũng phải qua công tắc/quota/capacity/deadline.

## Bằng chứng

7 unit test mới kiểm tra cấu hình SDK, bận không trừ quota, lỗi DB, timeout/abort, quota lookup treo và giải phóng thất bại. 3 integration test mới trên PostgreSQL loopback: hai Prisma client độc lập gửi 20 yêu cầu giữ lease, đúng 3 được nhận; lease hết hạn được thay và late release không xóa lease mới; job bận giữ nguyên upload/lượt thử, rồi hai worker chạy đồng thời chỉ hoàn thành một lần. Không gọi Gemini thật trong các kiểm thử này.

Đây là giới hạn request từ ứng dụng với lease hữu hạn, không phải bảo đảm Gemini ngừng xử lý sau timeout hoặc trần ngân sách tiền. Chưa có đo tải production, token/cost dashboard hoặc cảnh báo ngân sách thực tế. Các function cũ còn chạy trong lúc rollout chưa áp dụng logic mới.

Tham chiếu: [Gemini GenerateContentConfig](https://googleapis.github.io/js-genai/release_docs/interfaces/types.GenerateContentConfig.html), [HttpOptions](https://googleapis.github.io/js-genai/release_docs/interfaces/types.HttpOptions.html), [PostgreSQL advisory locks](https://www.postgresql.org/docs/18/explicit-locking.html#ADVISORY-LOCKS).

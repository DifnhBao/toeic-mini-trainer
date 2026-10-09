# Đo phân tích học tập và ưu tiên câu chưa làm

Ngày 09/10/2026, PostgreSQL 16 local, Prisma/pg pool mặc định tối đa 10 kết nối. Fixture riêng: 20 người học giả, 1.000 bài/người, 20 đáp án/bài, 400.000 đáp án, 10.000 câu hỏi chung tự tạo. Không dùng API/DB thật, không đọc lịch sử học thật, không gọi AI.

## Kết quả đã chạy xong

Lượt đầu ở `725b420`: 200 lần phân tích, p95 702,77 ms; 200 lần chọn câu ưu tiên mới, p95 8.795,21 ms, lớn nhất 11.714,93 ms. Mọi người học đã làm toàn bộ 10.000 câu hai lần; bước chọn phải fallback về câu đã luyện. Số liệu phân tích vẫn bị chặn ở 100 bài gần nhất và 2.000 lượt trả lời trong fixture này.

Đã thay tìm lịch sử theo từng câu bằng tập ID câu đã làm của đúng người học, tính một lần trong CTE materialized rồi nối với kho được phép dùng. LATERAL gom ID trong từng attempt qua index sẵn có; không thêm index/migration/cache hoặc thay quyền chọn câu. Mặc định không ưu tiên mới vẫn chọn ngẫu nhiên như trước. Builder SQL dùng chung giữa runtime và EXPLAIN.

So sánh cũ/mới trên **cùng fixture** trong lượt sau, thứ tự cũ–mới–mới–cũ, 20 tác vụ đồng thời, hai lời gọi mỗi tác vụ mỗi vòng, 80 lần mỗi biến thể:

| Chọn câu ưu tiên mới | p50 | p95 | Lớn nhất |
| --- | --- | --- | --- |
| Cũ: EXISTS theo từng câu | 6.778,61 ms | 13.112,94 ms | 13.600,79 ms |
| Mới: tính tập câu đã làm một lần | 739,73 ms | 1.190,98 ms | 1.291,27 ms |

Ở lượt này phân tích 200 lần có p95 1.352,32 ms; chọn câu mới thêm 200 lần sau so sánh có p95 809,05 ms. Không so những phép đo khác thời điểm để kết luận phần trăm cải thiện. Máy có tải kiểm tra khác và áp lực tài nguyên; đây là quan sát local, không bảo đảm latency production.

EXPLAIN truy vấn mới: 1.000 attempt qua `test_attempts_userId_idx`, 20 answer/attempt qua `user_answers_attemptId_idx`, gom thành 10.000 ID riêng của user rồi hash join kho 10.000 câu. Execution riêng 35,513 ms; không đồng nhất với thời gian lời gọi có chờ pool. Các nguyên tắc [CTE materialization](https://www.postgresql.org/docs/18/queries-with.html#QUERIES-WITH-CTE-MATERIALIZATION) và [LATERAL](https://www.postgresql.org/docs/18/queries-table-expressions.html#QUERIES-LATERAL) theo tài liệu PostgreSQL.

Assertions đạt: 100 bài/2.000 lượt mỗi phân tích, phạm vi bị giới hạn, số đúng/sai theo Part khớp fixture, tổng các Part bằng số câu khác nhau, kho theo Part đúng, không tự tạo nhãn; lựa chọn đủ 20 ID không lặp và thuộc tập câu đã làm khi kho mới đã cạn. Hai lượt đã hoàn tất exit 0 và dọn fixture của chúng. Log riêng trong `Test/insights-performance-diverse*.txt`, không commit.

## Lượt chưa đạt vì môi trường

Lượt tiếp theo với chỉ 20 câu lặp/người chưa hoàn tất: PostgreSQL test mất kết nối; container exit 135, đọc log Docker gặp I/O error; Docker Desktop sau đó báo không khởi động được. Windows báo ổ C còn 0 byte, ổ D còn khoảng 78 GB. Không coi lượt này là bằng chứng hiệu năng hoặc cleanup thành công. Không xóa/move dữ liệu cá nhân, không reset volume, không dùng DB thật để thay thế test.

Container liên quan `toeic-resubmit-test-20261009`, volume chỉ chứa DB test. Fixture cuối có thể còn do DB dừng giữa xử lý/dọn; cần phục hồi Docker rồi xác minh và dọn dữ liệu giả theo quyền sở hữu trước tái sử dụng. Hai lượt đã đạt phía trên vẫn có log và exit riêng; lần thất bại không chứng minh lỗi scoring hoặc quyền truy cập.

Unit mặc định lúc tải nặng có một lỗi I/O khi mở file key của fixture R2, trước assertion dự kiến; không đổi test để bỏ qua. Chạy lại toàn bộ với `--test-concurrency=2` đã đạt **246/246**, không skip. Giữ log lỗi và log chạy lại để đối chiếu. Kiểm thử integration/build tiếp theo dùng CI riêng, không đánh dấu local đạt nếu chưa chạy xong.

## Tái lập sau khi Docker hoạt động

```powershell
$env:TEST_DATABASE_URL = 'postgresql://test:test@127.0.0.1:55433/toeic_release_test?sslmode=disable'
$env:ALLOW_INTEGRATION_TEST_DATABASE = 'true'
node --import tsx scripts/benchmark-learning-history.mts --insights --diverse --compare-unseen
node --import tsx scripts/benchmark-learning-history.mts --insights --compare-unseen
```

Script chỉ nhận DB loopback tên `toeic_release_test`, không fallback `.env`, không truncate/reset; tạo/xóa theo UUID riêng. PostgreSQL test và migration phải sẵn có. Không dùng các lệnh trên với Neon. Hiện chưa kiểm chứng phép đo trên staging, HTTP/auth, Neon/Vercel, thiết bị Android, cache lạnh, audio/media hoặc AI/provider; không đóng cổng PERF-01 bằng số local.

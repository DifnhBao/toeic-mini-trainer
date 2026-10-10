# Đo HTTP luồng học cục bộ ngày 08/10/2026

Phép đo bổ sung HTTP thật, xác thực JWT và kiểm tra tài khoản ACTIVE vào bằng chứng truy vấn trong [PERFORMANCE_LOCAL_2026-10-08.md](PERFORMANCE_LOCAL_2026-10-08.md). Next.js chạy bằng `next start` từ production build trên Windows, Node 22.19.0, PostgreSQL 16 trong Docker loopback. Runtime source `0c21f9f`; không thay mã ứng dụng, migration hoặc bản triển khai đang hoạt động trong đợt đo này.

## Phạm vi và tải

- 20 người học giả lập đồng thời; mỗi người có 1.000 bài lịch sử và 20.000 câu trả lời. Tổng 20.000 attempt và 400.000 answer trước warmup.
- Ngân hàng 10.000 câu Part 5, chia thành 500 nhóm/bài, thuộc 20 đóng góp đã duyệt giả lập của một ADMIN. Metadata tài liệu chỉ là fixture, không có PDF hoặc object storage thật.
- Lịch sử mỗi người dùng lại 20 câu khác nhau qua 1.000 attempt, đáp án khớp bài chứa câu. Đây chưa phải phân bố lịch sử phủ toàn bộ 10.000 câu.
- Warmup 20 hành trình đầy đủ, không tính vào số đo. Sau đó chạy 10 vòng × 20 hành trình; chờ toàn bộ người học hoàn thành mỗi vòng, không thêm thời gian nghỉ.
- Mỗi hành trình: đọc Kho bài, thống kê và lịch sử; tạo bài 20 câu từ ngân hàng hoặc nhóm đã chọn; lấy đề; gửi hai request nộp giống nhau đồng thời; xem kết quả và thống kê mới. Tổng 9 request/hành trình, 1.800 request được đo. Hai cách tạo bài luân phiên, mỗi cách 100 lượt trong phần đo.
- 20 người học có thể tạo tối đa 40 request HTTP đang chạy khi thử nộp lại đồng thời. Đây là tải closed-loop ngắn, không phải 40 người dùng hoặc tải đến đều theo thời gian.

## Kết quả

Lượt đầy đủ cuối đạt với Build ID `tmC9jQgJK_TJ9u9X3wtpc`: 1.800 request trong 39,762 giây, khoảng 45,27 request/giây. Có 1.600 phản hồi 200 và 200 phản hồi 201; không có lỗi HTTP, 429 hoặc 5xx trong phần đo. p50 toàn lượt 316,77 ms, p95 1.288,74 ms, lớn nhất 2.006,14 ms.

| Bước HTTP | Số request | p50 (ms) | p95 (ms) | Lớn nhất (ms) |
| --- | ---: | ---: | ---: | ---: |
| Kho bài | 200 | 134,82 | 203,81 | 240,43 |
| Thống kê trước làm bài | 200 | 294,67 | 399,47 | 424,94 |
| Lịch sử | 200 | 1.082,76 | 1.279,30 | 1.412,86 |
| Tạo bài từ Kho bài | 100 | 249,41 | 672,57 | 758,75 |
| Tạo bài ngẫu nhiên | 100 | 177,10 | 586,54 | 681,71 |
| Chi tiết đề | 200 | 226,22 | 352,98 | 927,75 |
| Nộp bài cùng retry đồng thời | 400 | 858,86 | 1.639,32 | 2.006,14 |
| Chi tiết kết quả | 200 | 339,16 | 793,14 | 885,14 |
| Thống kê sau làm bài | 200 | 206,66 | 356,39 | 425,27 |

39 mẫu `pg_stat_activity` quan sát server con dùng tối đa 10 kết nối, tối đa 10 active. Lịch sử và nộp bài là hai bước có p95 cao nhất trong lượt này; cần đo trên staging trước quyết định tối ưu tiếp. Một lượt đầy đủ trước khi bổ sung assertion đúng nhóm có p95 tổng 1.187,43 ms; chênh lệch giữa hai lượt không chứng minh regression hoặc ảnh hưởng của assertion vì tải máy/cache có thể khác. Không dùng p95 tổng để che các endpoint chậm hơn.

Kiểm chứng công cụ: 156/156 unit test đạt, gồm sáu guard của runner; TypeScript và lint đạt (toàn repo còn ba cảnh báo `<img>` cũ). Không chạy build/unit đồng thời với phần đo tải.

## Kiểm tra tính đúng đắn

Mỗi trang Kho bài phải có 20 ID nhóm không trùng, có thể chơi và đúng số câu. Đề tạo từ Kho bài phải chứa câu thuộc đúng nhóm được chọn; mọi đề có 20 câu khác nhau, đúng Part và người sở hữu, không trả `correctAnswer` trước nộp. Hai request nộp đồng thời cùng `clientSubmissionId` phải trả cùng attempt, điểm đúng 20/20. Sau mỗi bài, thống kê phải tăng đúng một attempt/20 answer và tỷ lệ đúng fixture; lịch sử chỉ chứa bài của người hiện tại.

Ngoài phần đo có năm kiểm tra quyền: không token → 401; token sai → 401; đọc đề hoặc attempt của người khác → 404; tài khoản bị SUSPENDED → 401. Cuối lượt kiểm tra trực tiếp DB không có attempt/answer thừa do retry. Limiter production vẫn bật với bộ đếm PostgreSQL, không xóa quota giữa các vòng đo.

## Cách ly và dọn dữ liệu

`scripts/benchmark-http-learning.mts` chỉ nhận `TEST_DATABASE_URL` loopback, tên DB chính xác `toeic_release_test`, `sslmode=disable`, không nhận tham số kết nối khác và phải có opt-in. Controller từ chối `NODE_ENV=production`; chỉ server con chạy production. API cố định `127.0.0.1:3807`, kiểm tra port trống trước tạo fixture, không nhận URL remote.

Server con dùng khóa JWT/auth ngẫu nhiên trong bộ nhớ. Các tên biến cấu hình trong `.env.example` được ghi đè trước khởi động để không dùng cấu hình cloud của dự án; AI và ingestion tắt. Không gọi provider, Neon, R2 hoặc API production. Sáu kiểm thử âm xác nhận runner từ chối cấu hình không hợp lệ trước khi tạo fixture/server.

Khối `finally` dừng đúng server con và xóa theo UUID của lượt đo, gồm bài/attempt/answer, câu hỏi/nhóm/đóng góp/job, asset metadata, tài khoản và quota tương ứng. Không truncate/reset DB. Lượt cuối báo `cleaned=true` và `serverStopped=true`; kiểm tra độc lập trả 0 tài khoản/câu hỏi/asset mang dấu fixture, kết nối port 3807 bị từ chối. Container `toeic-release-test-20261008` đã dừng sau kiểm tra. JSON kết quả và log server ở `Test/`, đã loại khỏi Git; không lưu token hoặc khóa thử nghiệm trong báo cáo.

## Tái lập

Chuẩn bị container PostgreSQL test và 11 migration theo [RELEASE_RUNBOOK.md](RELEASE_RUNBOOK.md). Cần production build hiện có từ đúng source; khi đổi runtime phải build lại trước đo. Dừng các tác vụ build/test khác trong lúc đo và để port 3807 trống.

```powershell
$env:TEST_DATABASE_URL = 'postgresql://test:test@127.0.0.1:55432/toeic_release_test?sslmode=disable'
$env:ALLOW_INTEGRATION_TEST_DATABASE = 'true'
try {
  node --import tsx scripts/benchmark-http-learning.mts
} finally {
  Remove-Item Env:TEST_DATABASE_URL,Env:ALLOW_INTEGRATION_TEST_DATABASE -ErrorAction SilentlyContinue
}
docker stop toeic-release-test-20261008
```

`--quick` vẫn dùng 20 người học nhưng chỉ 1.000 câu, 10 attempt/người và một vòng đo. Kết quả đầy đủ nằm ở `Test/http-learning-full.json`, bản nhanh ở `Test/http-learning-quick.json`; log server tương ứng có hậu tố `-server.log`. Khi phép đo thất bại, giữ log và kiểm tra cleanup/port trước chạy tiếp; không dùng số liệu thất bại để tuyên bố đạt.

## Giới hạn và việc tiếp theo

PERF-01 vẫn mở. Đây là HTTP local đã warmup, JWT giả lập với lookup tài khoản thật trong DB test; không đo Google OAuth, Wi-Fi/4G, Android, Vercel cold start, độ trễ Neon, upload/OCR/AI, phát audio/ảnh hoặc các Part khác. Không đồng nhất kết quả với SLA production hoặc khả năng phục vụ 20 người học thật. Thông lượng phản ánh hành trình hiện tại, không phải công suất tối đa.

Cần phép đo staging cách ly được phép với dữ liệu phân bố đa dạng, cache lạnh, media, mạng thực tế và thời gian dài hơn; theo dõi CPU, chờ pool, lỗi và chi phí. Snapshot kết nối PostgreSQL lấy mỗi giây chỉ phản ánh mẫu quan sát, không đo chính xác hàng đợi hoặc cực đại giữa các mẫu. Không kết luận phần trăm cải thiện bằng cách so trực tiếp với báo cáo SQL cũ có phạm vi/fixture khác.

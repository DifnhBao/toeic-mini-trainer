# Đo truy vấn PostgreSQL cục bộ

Ngày 08/10/2026. Node 22.19.0, PostgreSQL 16 trong Docker trên máy Windows hiện tại. Prisma/pg dùng pool mặc định tối đa 10 kết nối. Không truy cập DB thật, không gọi AI hoặc tạo dữ liệu trên API production.

## Kết quả

| Tình huống | Số lần đo | p50 | p95 | Lớn nhất |
| --- | --- | --- | --- | --- |
| Chọn 20 câu, kho 10.000 câu private, 10 tác vụ đồng thời | 200 | 21,17 ms | 50,53 ms | 225,37 ms |
| Chọn 20 câu, kho chung 10.000 câu, 20 user với lịch sử lớn | 200 | 341,22 ms | 606,16 ms | 900,19 ms |
| Thống kê học tập, 20 user đồng thời, 1.000 attempt/user | 200 | 912,52 ms | 1.503,67 ms | 1.787,43 ms |

Tình huống lớn có 20.000 attempt và 400.000 answer; mỗi bài 20 câu. Sau bulk insert đã `ANALYZE` ba bảng trước đo. Lượt trước ANALYZE có p95 chọn câu 685,26 ms, thống kê 1.743,14 ms; không dùng sự khác biệt này để kết luận quan hệ nhân quả duy nhất vì điều kiện cache/tải máy có thể khác.

Mỗi lượt kiểm tra số câu/không lặp/đúng Part; thống kê mỗi user phải có 1.000 bài, 20.000 answer và độ chính xác đúng fixture. Cleanup theo UUID do lượt đo tạo đã chạy thành công; không truncate/reset/seed DB hiện tại. Các script chỉ nhận `TEST_DATABASE_URL` loopback với tên DB chính xác `toeic_release_test` và opt-in; không fallback `.env`.

## Phạm vi và việc tiếp theo

Đây là thời gian hàm Prisma/truy vấn, gồm chờ pool; không có HTTP, xác thực, độ trễ Neon/Vercel, upload/audio/AI hoặc thiết bị Android. Chưa chứng minh p95 API production dưới 2 giây hoặc khả năng phục vụ 20 người dùng thực.

EXPLAIN của truy vấn thống kê cho thấy parallel sequential scan trên 400.000 answer rồi hash join với 1.000 attempt của user, memoize lookup câu hỏi. Execution riêng ở lượt EXPLAIN khoảng 159,37 ms; không đồng nhất với thời gian request khi có 20 user. Cần đo thêm kế hoạch/index và pool trên staging trước chọn cách tối ưu. Không thêm index, migration hoặc cache mới vào DB thật trong đợt này.

Việc còn lại của PERF-01: đo HTTP/auth trên staging cách ly với cùng quy mô, thử dữ liệu phân bố đa dạng và cache lạnh, đo hàng đợi/pool/CPU, nghiệm thu media/group và cân nhắc index/aggregate khi có bằng chứng. Không chốt PERF-01 chỉ dựa vào bảng trên.

## Tái lập

```powershell
$env:TEST_DATABASE_URL = 'postgresql://test:test@127.0.0.1:55432/toeic_release_test?sslmode=disable'
$env:ALLOW_INTEGRATION_TEST_DATABASE = 'true'
node --import tsx scripts/benchmark-practice.mts
node --import tsx scripts/benchmark-learning-history.mts
```

Container test và 11 migration phải có trước, theo `RELEASE_RUNBOOK.md`. Không dùng URL Neon/DB dự án cho các lệnh này. Kết quả phụ thuộc máy và trạng thái PostgreSQL, không phải SLA.

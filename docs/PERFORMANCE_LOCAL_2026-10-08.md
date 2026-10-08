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

## Tối ưu thống kê sau lượt đo nền

Truy vấn mới gom câu trả lời bằng `LATERAL` theo từng attempt của user rồi tổng hợp theo Part; dùng index `test_attempts(userId)` và `user_answers(attemptId)` đã có. Không thêm migration, index hoặc cache. Builder SQL được dùng chung giữa runtime và EXPLAIN để tránh đo nhầm truy vấn. Cách tham chiếu từng hàng trong `LATERAL` theo [tài liệu PostgreSQL](https://www.postgresql.org/docs/18/queries-table-expressions.html#QUERIES-LATERAL).

Hai lượt so sánh dùng cùng fixture trong từng lượt: 20 user, 1.000 attempt/user, tổng 400.000 answer; pool 10. Mỗi biến thể 200 lời gọi, chạy bốn vòng cũ–mới–mới–cũ (20 tác vụ, 5 lần mỗi tác vụ mỗi vòng), sau ANALYZE và warmup. Tính cả query đếm attempt và chờ pool, giống hàm production. Kiểm tra mọi user cho kết quả theo Part giống truy vấn cũ trước đo.

| Phân bố câu đã làm | Truy vấn | p50 | p95 | Lớn nhất |
| --- | --- | --- | --- | --- |
| 20 câu lặp lại qua các attempt | Cũ | 855,73 ms | 1.218,12 ms | 1.348,57 ms |
| 20 câu lặp lại qua các attempt | Mới | 296,13 ms | 354,25 ms | 419,08 ms |
| 10.000 câu, mỗi câu hai lần/user | Cũ | 842,57 ms | 1.209,47 ms | 1.553,24 ms |
| 10.000 câu, mỗi câu hai lần/user | Mới | 584,14 ms | 739,20 ms | 901,74 ms |

p95 giảm khoảng 71% và 39% trong hai lượt cục bộ này. EXPLAIN mới đọc 20 answer/attempt × 1.000 attempt qua index, không sequential scan toàn bộ 400.000 answer; execution riêng lần lượt 44,92 và 61,01 ms. Đây là quan sát trên fixture đã warmup, không bảo đảm planner mọi dữ liệu hoặc PostgreSQL khác sẽ chọn cùng kế hoạch. Lịch sử đa dạng là fixture thống kê, không phải đề chơi được: các answer dùng ID từ toàn bộ ngân hàng mẫu.

Sau so sánh, lượt trộn chọn câu/thống kê có p95 thống kê 351,16 ms (20 câu khác nhau) và 607,48 ms (10.000 câu khác nhau). Không so trực tiếp các số này với lượt nền ở đầu tài liệu để kết luận phần trăm cải thiện vì trạng thái cache và tải máy khác. Chỉ dùng so sánh cũ/mới cùng fixture ở bảng trên.

Bổ sung integration cho user chưa làm bài, user không tồn tại, attempt không có answer, câu lặp qua nhiều attempt, câu bỏ trống, nhiều câu cùng Part, làm tròn tỷ lệ và hai user dùng cùng câu hỏi. Việc đếm bài rỗng vẫn thực hiện riêng; không mất bài khỏi `totalTests`.

Source `35e9e44` đã qua 111 unit, 15 integration, TypeScript, lint và production build; đã lên Vercel `dpl_2BN16pCYioxSoiE4ypKfAnoKiKst`, 9/9 HTTP smoke trước và sau promote. Điểm rollback ngay trước đó là `dcb6524`, deployment `dpl_51LUoFCVA9UrTPrpB746D2J7UHn2`. Không cần APK mới cho riêng thay đổi truy vấn này. Smoke không đăng nhập chưa xác minh kế hoạch/thời gian SQL trên Neon.

## Giới hạn còn lại

Đây là thời gian hàm Prisma/truy vấn, gồm chờ pool; không có HTTP, xác thực, độ trễ Neon/Vercel, upload/audio/AI hoặc thiết bị Android. Chưa chứng minh p95 API production dưới 2 giây hoặc khả năng phục vụ 20 người dùng thực.

EXPLAIN của truy vấn cũ ở lượt nền cho thấy parallel sequential scan trên 400.000 answer rồi hash join với 1.000 attempt của user, memoize lookup câu hỏi. Execution riêng ở lượt EXPLAIN khoảng 159,37 ms; không đồng nhất với thời gian request khi có 20 user. Cần đo kế hoạch và pool trên staging để kiểm chứng lợi ích ngoài máy local. Không thêm index, migration hoặc cache mới vào DB thật trong đợt này.

Việc còn lại của PERF-01: đo HTTP/auth trên staging cách ly với cùng quy mô, thử dữ liệu phân bố đa dạng và cache lạnh, đo hàng đợi/pool/CPU, nghiệm thu media/group và cân nhắc index/aggregate khi có bằng chứng. Không chốt PERF-01 chỉ dựa vào bảng trên.

## Tái lập

```powershell
$env:TEST_DATABASE_URL = 'postgresql://test:test@127.0.0.1:55432/toeic_release_test?sslmode=disable'
$env:ALLOW_INTEGRATION_TEST_DATABASE = 'true'
node --import tsx scripts/benchmark-practice.mts
node --import tsx scripts/benchmark-learning-history.mts
node --import tsx scripts/benchmark-learning-history.mts --compare-baseline
node --import tsx scripts/benchmark-learning-history.mts --compare-baseline --diverse
```

Container test và 11 migration phải có trước, theo `RELEASE_RUNBOOK.md`. Không dùng URL Neon/DB dự án cho các lệnh này. Kết quả phụ thuộc máy và trạng thái PostgreSQL, không phải SLA.

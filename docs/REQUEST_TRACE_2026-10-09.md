# Đối chiếu lỗi API bằng mã yêu cầu

Ngày 09/10/2026. Đã kiểm chứng source cục bộ; chưa triển khai. API live vẫn là `ff80432`.

## Hành vi

`proxy.ts` theo convention Next 16.3.8 tạo UUID v4 mới cho mỗi request `/api/:path*`. ID do client gửi luôn bị ghi đè. Mã được chuyển tới route qua request header `x-request-id` và đưa vào response header cùng tên. Authorization/cookie chỉ được chuyển nội bộ tới route, không sao chép ra response. Proxy không đọc body, xác thực phiên, truy vấn DB hoặc gọi provider. Đã đọc guide proxy trong package Next đang cài; không dùng convention middleware đã deprecated hoặc shared global giữa proxy và route.

Logger upload/media/đọc bài, các catch AI/auth/import/đóng góp, readiness/drain và hook lỗi Next nhận mã đã chuẩn hóa. Chỉ chuỗi UUID v4 dài đúng 36 ký tự được đưa vào log. Các lọc loại lỗi và giới hạn dữ liệu từ `d39efee` giữ nguyên; không thêm URL/query, header xác thực, nội dung tài liệu hay Error thô.

Create/retry ingestion và cron drain chụp ID trước `after()` rồi truyền riêng tới worker. Nếu worker bắt lỗi, log chứa `jobId`, `requestId` của lần kích hoạt đó và loại lỗi đã lọc. Mỗi lần cron/retry có ID mới; `jobId` dùng để nối các lần. Không lưu thêm ID vào DB, không đổi claim, retry, quota, kết quả hoặc migration. Lỗi claim trước khối catch vẫn đi qua hook Next; không khẳng định mọi lỗi thư viện có đủ job context.

Guard payload Vercel yêu cầu cả hai entry point ở root `proxy.ts` và `instrumentation.ts`, bên cạnh source app/types/prisma. Tránh gói build hợp lệ nhưng bỏ mất proxy hoặc hook lỗi.

## Kiểm chứng

- Sáu kiểm thử mới: server ID thay ID từ caller và không đổi credential nội bộ; loại ID sai/array/newline; log route không lộ request/error; hook Next đọc ID hợp lệ; worker thật với dependency giả truyền job/ID qua lỗi và không gọi mạng; manifest thiếu entry point hoặc chứa env/backup/key bị từ chối.
- Toàn bộ 195/195 unit đạt; TypeScript đạt; lint 0 lỗi, ba cảnh báo img đã có. Logs: `Test/unit-request-trace.txt`, `Test/typecheck-request-trace.txt`, `Test/lint-request-trace.txt`.
- Production Webpack build đạt, 41/41 trang tĩnh và trace hoàn tất, exit 0, có mục Proxy. Log `Test/build-request-trace.txt`.
- Server production chỉ bind `127.0.0.1:3811`, config ứng dụng được ghi đè bằng giá trị local/dummy, AI/ingestion tắt. 16 request GET ingestion chưa xác thực, có Bearer/cookie giả và ID caller hợp lệ hoặc tùy ý, đều trả 401 với 16 UUID mới khác nhau. Không phản chiếu authorization/cookie hoặc header nội bộ `x-middleware-*` ra wire. Favicon trả 200 và không có ID (ngoài matcher). Tổng 17 phản hồi đạt, server đã dừng; không gọi DB/provider/cloud. Bằng chứng `Test/request-trace-http.json`, build ID `WymAMO7MmWbIYEUBBC_oL`.
- PostgreSQL/S3 integration 44 kiểm thử là bằng chứng trước đó ở API `ff80432`; chưa chạy lại cho source này vì Docker đang dừng. Mock worker không thay integration hoặc diễn tập ngắt worker thật.

## Vận hành và giới hạn

Khi báo lỗi, lấy `x-request-id` của phản hồi API trong Network rồi tìm ID đó trong log của đúng deployment; nếu là ingestion, ghi thêm job ID. Không gửi toàn bộ request/response header, URL ký hoặc token. Mã không chứa thông tin user và không cấp quyền truy cập dữ liệu. Đây chỉ là ID lần request, không bảo đảm lỗi bị bắt luôn được log hoặc log nền tảng/SDK đều đã được lọc.

Chưa có UI mobile/web tự hiển thị ID khi lỗi, distributed trace qua provider, metric/alert, kênh trực hoặc xác minh trên Vercel. Chưa deploy, smoke cloud hoặc cập nhật APK. Cần kiểm tra ID response/log trên deployment được phép, job background và giới hạn quyền trước khi coi bản live đã có correlation. OPS-03 vẫn mở; không suy ra hệ thống sẵn sàng beta từ các kiểm tra cục bộ này.

## GitHub sau khi đổi kết nối

Trước đổi kết nối, connector xác thực `thiennn20` và đọc repository trả 404. Người dùng báo đã kết nối, sau đó xác nhận chọn tài khoản `ddinhbao05`. Lần đọc tiếp theo trả lỗi `Unknown tool` cho cả `github.get_user_login` và `github.get_repo`; tìm plugin xác nhận GitHub vẫn installed/enabled. Chưa xác minh được tài khoản mới hoặc kết quả CI. Không dùng lỗi công cụ này để kết luận `ddinhbao05` thiếu quyền hoặc repo không tồn tại; không suy ra CI xanh từ SSH push.

Source và tài liệu đã commit/push bằng SSH tại `82c16e0` trên `codex/release-readiness`. Sau đó thử mở đúng trang Actions bằng Browser Use cũng bị từ chối quyền truy cập `github.com`; đã dừng, không thử HTTP/CLI/browser khác để thay thao tác bị chặn. Người dùng được đề nghị cấp lại quyền Browser Use cho GitHub hoặc cung cấp link/kết quả ba job `web`, `integration`, `mobile`. Bằng chứng local không đóng cổng CI từ xa.

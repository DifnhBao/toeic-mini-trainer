# Mã hỗ trợ trong thông báo lỗi web và Android

Ngày 09/10/2026. Thay đổi mã nguồn, chưa triển khai API hoặc tạo APK mới.

## Hành vi và phạm vi

Các lỗi HTTP của wrapper API Android giữ nguyên status/code để cơ chế xác thực tiếp tục hoạt động. Thông báo bổ sung `Mã hỗ trợ: <UUID>` nếu response có `x-request-id` hợp lệ. Các luồng web tạo/mở/nộp bài, phân tích học tập, Kho bài, Coach/lời giải và thao tác nhập/duyệt nội dung dùng cùng helper cho lỗi API. Payload lỗi legacy và v1 đều được đọc; JSON hỏng hoặc thông báo lỗi không đúng kiểu dùng lời nhắc mặc định. Không biến phản hồi nhập JSON thất bại thành thông báo thành công.

Chỉ nhận UUID v4 chữ thường dài đúng 36 ký tự từ header phản hồi. Không lấy ID caller/body/provider, cookie, token, URL ký hay body HTML để làm mã hỗ trợ. Không tự tạo mã khi mất mạng/timeout, API cũ không có header hoặc header sai định dạng. Mã không cấp quyền xem dữ liệu và không được lưu thêm vào DB. Không thêm dịch vụ báo lỗi hoặc gửi dữ liệu tới bên thứ ba. Nội dung thông báo hợp lệ từ API vẫn được giữ; helper không phải bộ lọc bí mật cho văn bản lỗi do server tạo.

Giới hạn: chưa phải mọi thông báo đều có mã. Lỗi đọc thống kê nền ở trang chủ hiện chỉ đi tới console; job FAILED có job ID để đối chiếu. Upload trực tiếp R2, phát audio, SDK đăng nhập và lỗi mạng không tự có request ID API. Cần tra mã trong log của đúng deployment; không bảo đảm mọi lỗi đều có log tương ứng.

Metro được mở phạm vi chỉ tới `../shared` vì helper dùng lúc chạy nằm ngoài thư mục mobile; không thêm thư mục mã web hoặc node_modules web vào resolver, không thay dependencies/lockfile. Cấu hình theo [Expo](https://docs.expo.dev/guides/monorepos/) và yêu cầu file ngoài projectRoot của [Metro](https://metrobundler.dev/docs/configuration/#watchfolders). Đã kiểm tra loader local nhận đúng projectRoot và duy nhất thư mục shared; CI Android export/audit bundle cũng đạt theo bằng chứng dưới đây.

## Bằng chứng cục bộ

- Sáu ca mới kiểm tra: lỗi legacy/v1 và giới hạn metadata; ID/body sai; status/code xác thực; HTTP không phải JSON và JSON thành công hỏng; không tự tạo mã cho API cũ/timeout; payload thành công và header caller giữ nguyên.
- Kiểm thử tập trung 11/11 đạt, gồm mã hỗ trợ, serialization header Android và request trace server. Toàn bộ Windows 252/252 đạt, không skip. Logs trong `Test/client-support-targeted.txt` và `Test/client-support-unit-full.txt`.
- TypeScript web và mobile đạt; lint toàn bộ 0 lỗi, 3 cảnh báo img đã có; cấu hình Metro lint đạt. Logs `Test/client-support-*` nằm ngoài Git.
- Source `08bfafbaf0e10521eff73bbb199de7c1c0561506` đã commit/push. CI [37938249776](https://github.com/DifnhBao/toeic-mini-trainer/actions/runs/37938249776) completed/success; cả web/integration/mobile và từng bước được xác minh qua connector. Đọc log: PostgreSQL 78/78 không skip, Linux unit 249/252 đạt và 3 skip do FFmpeg/ffprobe/DPAPI Windows (đã chạy đủ trên Windows), build web thành công, Android export/audit bundle 1.324 source đạt. Không chạy lại PostgreSQL local cho source này; CI dùng DB test riêng, không thay bằng DB thật.

## Nghiệm thu sau triển khai được phép

1. Trên web và S23 FE, gây lỗi API bằng dữ liệu thử được phép; ghi thông báo, mã hỗ trợ và deployment/build đang dùng, tránh gửi toàn bộ header/URL/token.
2. Đối chiếu UUID response với log đã lọc của cùng request; ingestion ghi thêm job ID để nối các lần retry/drain.
3. Thử timeout, mất mạng và đăng nhập hết hạn: thông báo vẫn đọc được; không có mã giả, chính sách refresh/logout vẫn đúng.

Chưa nghiệm thu UI trên trình duyệt/điện thoại hoặc response/log Vercel. OPS-03 còn mở vì rollout, metric/cảnh báo thật và người xử lý chưa hoàn tất.

# Phiên đăng nhập Android khi phản hồi đến muộn

Ngày 09/10/2026. Source `3cbde63`, gồm controller `b6092a3` và bảo vệ điều hướng; bổ sung phía client cho API `ff80432`. Chưa đóng cổng SAFE-01/E2E bằng kiểm thử cục bộ.

## Hành vi đã sửa

Controller dùng chung trong một runtime app đánh dấu thế hệ phiên. Logout hoặc bắt đầu đăng nhập mới làm hết hiệu lực ngay phiên trước; phản hồi login/refresh/profile/request của phiên cũ không được cập nhật user, trả dữ liệu riêng tư cho màn hình hoặc retry bằng token tài khoản mới. Callback màn hình giữ lại cũng gắn với thế hệ ban đầu. Token mới đến muộn được gửi yêu cầu thu hồi theo khả năng kết nối.

Root navigator bảo vệ Tabs, bài luyện, kết quả và lịch sử bằng `Stack.Protected`, đồng thời remount Stack theo user ID để bỏ state màn hình của tài khoản trước ngay cả khi các cập nhật auth được React gộp. Không chỉ chặn API: cần bỏ cả dữ liệu đã render. Dùng API `guard` có trong Expo Router SDK 57, không dùng `redirectTo` chỉ có từ SDK 58. [Tài liệu Expo Protected routes](https://docs.expo.dev/router/advanced/protected/) mô tả việc loại history của route khi guard chuyển false; việc điều hướng native thực tế vẫn cần nghiệm thu.

Ghi/đọc/xóa refresh token qua một hàng đợi SecureStore, dùng nguyên key và tùy chọn mã hóa cũ. App chỉ nhận access token sau khi lưu refresh token thành công. Ghi chậm phải kết thúc trước thao tác xóa hoặc ghi của lần đăng nhập tiếp theo; lỗi ghi không cho lộ phiên chưa lưu. Không thêm persistence bằng AsyncStorage, dependency hoặc migration.

Các request cùng phiên chia sẻ một refresh đang chạy. Nếu một request trả 401 muộn sau khi request khác đã refresh, nó dùng access token mới sẵn có thay vì xoay vòng refresh lần nữa. Retry tối đa một lần; 401 cuối của phiên hiện tại xóa phiên. Lỗi mạng/503 tạm thời giữ token đang lưu để thử khôi phục sau.

Logout xóa phiên trong bộ nhớ ngay; màn hình đăng nhập phân biệt chưa xóa được phiên thiết bị và chưa xác nhận thu hồi trên server, có nút thử lại. Nếu chưa biết token trong bộ nhớ và đọc SecureStore lỗi, không phá hủy bản token còn trên thiết bị: giữ khả năng đọc/thu hồi khi thử lại. Các token chờ thu hồi chỉ ở bộ nhớ, không được ghi log hoặc lưu lại vào thiết bị.

Màn hình đăng nhập dùng ScrollView để thông báo và nút thử lại vẫn truy cập được khi nội dung cao hơn màn hình hoặc dùng chữ lớn.

## Bằng chứng cục bộ

- 177/177 unit, gồm 21 kiểm thử trực tiếp controller production với network/storage được điều khiển bằng Promise: refresh đồng thời, logout/đổi tài khoản trong lúc chờ, phản hồi và callback cũ, ghi chậm, lỗi đọc/ghi/xóa, retry 401/503, restore lặp và restore đến muộn.
- TypeScript web/mobile đạt; lint 0 lỗi, ba cảnh báo `<img>` web hiện có.
- Expo SDK 57 dependency check đạt; Android export có source map đạt, 1.322 source; không có `braces` hoặc `node-forge` trong source map. Export không chứng minh APK đã cài/chạy trên điện thoại.
- Sau bổ sung điều hướng/ScrollView: TypeScript mobile, lint hai tệp thay đổi và export/source map chạy lại đạt. Chưa có test render navigator hoặc nghiệm thu native; không coi 21 controller test là bằng chứng cho Back/deep link/chữ lớn.
- Log ở `Test/unit-mobile-session.txt`, `mobile-auth-session-final.txt`, `typecheck-mobile-session-root.txt`, `typecheck-mobile-session-app.txt`, `lint-mobile-session.txt`, `expo-dependencies-mobile-session.txt`, `export-mobile-session.txt`, `bundle-mobile-session.txt`.
- Log bổ sung: `Test/typecheck-mobile-session-navigation.txt`, `lint-mobile-session-navigation.txt`, `export-mobile-session-navigation.txt`, `bundle-mobile-session-navigation.txt`.

Không gọi Google/Apple, DB, R2 hoặc thu hồi phiên thật trong các kiểm thử này. Không thay runtime web/API; giữ deployment `ff80432` đang phục vụ domain chính. 44 integration PostgreSQL và production build của server đã được kiểm chứng riêng trong báo cáo server, không chạy lại hoặc coi là kiểm thử Android của lượt này.

## APK preview

Build thay thế [88bbd6b1-ca59-4153-9bfd-cf43e06661f4](https://expo.dev/accounts/dinhbao05s-team/projects/dinhbao05/builds/88bbd6b1-ca59-4153-9bfd-cf43e06661f4), source đầy đủ `3cbde6358c03c5f5e98a9d5771ce9a810e78be13`, profile preview/internal/Android, FINISHED lúc 02:15:20 ngày 09/10 giờ Việt Nam. [Tải APK](https://expo.dev/artifacts/eas/HQsh1uAZ9NxH0pay9CNPlroMv8VH3bT3p4cyEX5zt7Q.apk), 114.438.583 byte; SHA-256 `97A3A1D0E54C070137B6687DF7A94D03709450957CDA2B84D430880ADC7DE245`.

Archive 298 tệp, đủ và khớp hash 67 tệp mobile được theo dõi; không có env, secret, backup, PDF/MP3 nguồn hoặc APK cũ. Upload khoảng 1,8 MB, dùng khóa ký có sẵn và `--freeze-credentials`, không mua gói hoặc gửi store. Log ở `Test/eas-archive-3cbde63-proof.json`, `eas-submit-3cbde63.json`, `eas-build-3cbde63-latest.json`; không đưa metadata cloud lên Git.

Đã đọc lại đúng build ID/FINISHED/source SHA và tải artifact tương ứng. ZIP CRC 1.698 mục, manifest/dex và bốn ABI gồm arm64-v8a đạt; bundle có domain API chính và marker `SESSION_CHANGED`, `SESSION_STORAGE_FAILED`, `/api/v1/auth/logout`. Android SDK apksigner xác minh chữ ký v2 hợp lệ, một signer, cùng chứng chỉ SHA-256 `042767669c1def0f9a52a80a0945af451f7aa37dcbb31fdc3a40483706ed2fe6` với APK Kho bài `dee15f2`. Package `com.toeicminitrainer.app`, version 1.0.0/code 1, min SDK 24, target/compile SDK 36. Không tạo build trùng trong lúc chờ.

Log kiểm chứng artifact: `Test/apk-3cbde63-verification.json`, `apk-3cbde63-signature.json`, `apksigner-3cbde63.txt`, `apk-3cbde63-badging.txt`; APK lưu local trong `Test/`, không đưa lên Git. Kiểm tra file/chữ ký chưa thay MS-01…MS-08 trên thiết bị. Cài cập nhật bằng APK cùng package/chứng chỉ; không yêu cầu gỡ bản cũ hoặc xóa dữ liệu để nghiệm thu.

Đã thử chuẩn bị emulator Android 16/API 36 riêng từ image có sẵn, không dùng điện thoại/AVD/tài khoản Google của người dùng. Chỉ cài APK nền `dee15f2`, chưa cài hoặc chạy APK `3cbde63`: System UI có ANR khi khởi động; giảm từ 1080x2400@420 xuống 540x1200@210 giữ dp thì thấy màn hình đăng nhập nền. Host khoảng 7,5 GiB RAM, bộ nhớ trống có lúc chỉ 24 MiB; dừng emulator riêng để tránh ảnh hưởng máy, xác minh độc lập còn 0 tiến trình/cổng QA. Không dùng kết quả này làm bằng chứng native của APK mới hoặc thay Samsung. Log ở `Test/android-qa-3cbde63/`; không thay setting desktop hoặc dừng thiết bị khác.

## Nghiệm thu thiết bị còn phải thực hiện

Thiết bị dự kiến Samsung S23 FE, Android 16, OneUI 8.5. Ghi build ID/source SHA/API SHA, mạng và kết quả thực tế; không ghi token, email hoặc URL media ký tạm thời. Build `94120675-bb75-4272-a461-042de6a20fa3` của `b6092a3` đã CANCELED để thay bằng bản có bảo vệ navigator; không dùng build đó để nghiệm thu.

| Mã | Thao tác | Kết quả cần quan sát |
| --- | --- | --- |
| MS-01 | Cập nhật APK, đăng nhập Google, đóng/mở lại app khi có mạng | Đúng tài khoản, lịch sử và Kho bài; không yêu cầu đăng nhập lại vô cớ |
| MS-02 | Khi đang tải lịch sử/Kho bài, logout rồi đăng nhập tài khoản B | Không hiển thị dữ liệu A, request cũ không xóa hoặc thay phiên B; đóng/mở lại vẫn B |
| MS-03 | Khi offline, logout rồi bật mạng và bấm thử logout lại | App vào màn hình đăng nhập ngay, có cảnh báo chưa xác nhận server; thử lại thành công hết cảnh báo; mở lại không tự vào tài khoản cũ |
| MS-04 | Đóng/mở app khi offline, rồi bật mạng và thử kết nối lại | Có thông báo khôi phục chưa được; mạng trở lại khôi phục đúng tài khoản, không mất tiến độ đã lưu trên server |
| MS-05 | Sau khi để app quá thời hạn access token, mở các màn hình cần đăng nhập | Khôi phục đúng phiên; không lặp refresh hoặc logout bất thường |
| MS-06 | Mở bài Listening đã duyệt trong Kho bài, nghe/làm/nộp và xem lịch sử qua Wi-Fi/4G | Luồng học không hồi quy; chỉ đánh dấu đạt khi có bài thật đủ đáp án và audio khớp nhóm |
| MS-07 | Mở lịch sử/kết quả của A, logout rồi vào B; thử Back và deep link màn hình riêng tư khi chưa đăng nhập | Không trở lại dữ liệu đã render của A; chưa đăng nhập được chuyển về luồng đăng nhập; B không xem được kết quả A |
| MS-08 | Bật chữ lớn, đăng nhập offline/khôi phục lỗi | Cuộn tới đầy đủ cảnh báo, nút thử lại, Google và học thử; không có nút nằm ngoài vùng truy cập |

Không cố sửa SecureStore hoặc đổi token thật để tái tạo lỗi trên điện thoại. Các tình huống storage lỗi và thứ tự phản hồi đã kiểm tra bằng controller cục bộ; nghiệm thu thiết bị bổ sung phần native/OAuth/mạng/vòng đời app.

## Giới hạn

Yêu cầu đã gửi lên server trước logout có thể vẫn thực thi; client chỉ bỏ phản hồi cũ, không bảo đảm hủy tác vụ server. Access JWT cũ vẫn có TTL 15 phút theo chính sách server. Nếu mất mạng rồi app bị đóng trước retry, danh sách token chờ thu hồi trong bộ nhớ không còn; không tuyên bố thu hồi server thành công khi chỉ đã xóa ở thiết bị. Không tự retry refresh vô hạn khi mất phản hồi: reuse token đã xoay vòng vẫn thu hồi family theo server và có thể yêu cầu đăng nhập lại.

Google Login, SecureStore native, APK trên điện thoại, bộ Listening ETS đầy đủ, thiết bị Android thứ hai và các cổng vận hành/beta vẫn cần bằng chứng thực tế. Người dùng đã xác nhận sẽ cung cấp đường dẫn đáp án ETS Test 1; chưa có đường dẫn tại thời điểm ghi báo cáo.

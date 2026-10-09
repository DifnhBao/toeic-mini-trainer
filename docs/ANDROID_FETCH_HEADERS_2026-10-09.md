# Sửa lỗi Android NativeRequest headers — 2026-10-09

Người dùng báo lỗi trên Samsung S23 FE / Android 16 / OneUI 8.5 khi tạo bài luyện, mở bài luyện và tải kho bài. Ảnh cho thấy Expo NativeRequest từ chối `headers` vì nhận Map thay vì String. Ba luồng này chưa đạt nghiệm thu trên APK `3cbde63`.

## Nguyên nhân và thay đổi

`authorizedFetch` tạo một `Headers` có Authorization, rồi `apiRequest` trải `...init.headers` vào object. Headers trên React Native có map nội bộ enumerable; map này bị đưa thành giá trị HTTP header và Expo Android không ép được sang `List<Pair<String, String>>`.

API hiện đọc Headers qua giao diện chuẩn `forEach`, gộp với Accept/Content-Type mặc định rồi chuyển thành mảng cặp chuỗi trước khi gọi fetch. Hỗ trợ object, mảng cặp và Headers; giữ Authorization, header tùy chỉnh, ghi đè mặc định không phân biệt chữ hoa/thường và không sửa Headers của caller. Không thay đổi backend hay dependency.

## Bằng chứng kiểm tra

- Test mới dùng Headers có map nội bộ enumerable và kiểm tra kiểu tại ranh giới fetch Android. Test thất bại với source cũ (object thay vì string), đạt với source sửa.
- Test đi qua API thật kết hợp auth session: đăng nhập, tải kho, POST tạo bài nhận 401, refresh, retry, header tùy chỉnh và yêu cầu không có header.
- Unit: 210/210 đạt trên Windows; auth session và test mới: 22/22.
- TypeScript root/mobile và ESLint hai file thay đổi đạt.
- Export Android release đạt; source-map check 1.322 nguồn đạt.
- CI của source `0941a11ffd90c2dfb17b6e030483bee9c1b11f33`: [PR run 37880968851](https://github.com/DifnhBao/toeic-mini-trainer/actions/runs/37880968851), cả web/integration/mobile success. Log integration xác nhận 11 migrations và 68/68 kiểm thử PostgreSQL đạt trên DB CI cách ly.

## Phát hành và nghiệm thu

APK sửa lỗi đã build và kiểm tra gói cài đặt đạt:

- Source: `0941a11ffd90c2dfb17b6e030483bee9c1b11f33`.
- EAS: [12e9d824-9e71-40fc-aff9-c1afad529d6a](https://expo.dev/accounts/dinhbao05s-team/projects/dinhbao05/builds/12e9d824-9e71-40fc-aff9-c1afad529d6a), FINISHED.
- [Tải APK mới](https://expo.dev/artifacts/eas/MihlTASY0WovsMk15JWJG7M1TT19eL0KU0gKn5pebwQ.apk), 114.438.847 byte.
- SHA-256: `84B51DFA22F00218B22C46844614C6C00773058DEF6B01730B97538DBF984763`.
- APK CRC 1.698 mục, manifest/dex, 4 ABI đạt. Package `com.toeicminitrainer.app`, version 1.0.0/code 1, min SDK 24/target 36; chữ ký v2 hợp lệ, cùng chứng chỉ APK `3cbde63`.
- API đóng gói vẫn là `https://toeic-mini-trainer.vercel.app`. Không chuyển production API trong lần sửa này.
- Bằng chứng cục bộ, Git-ignored: `Test/apk-0941a11-verification.json`, `Test/apksigner-0941a11.txt`, `Test/apk-0941a11-badging.txt`.

Chưa xác minh bản sửa trên thiết bị Android thật. Ba màn hình trong ảnh người dùng cùng báo lỗi truyền header; các mục MS-01/MS-02/MS-07 được người dùng đánh dấu lỗi trên bản trước vẫn cần kiểm tra lại sau khi cài bản này. Người dùng báo MS-04/MS-05 đạt trên bản trước; kết quả đó không tự áp dụng cho APK mới. MS-03 hiện ghi thao tác đăng nhập offline, chưa đủ bằng chứng cho toàn bộ kịch bản logout offline.

Cài cập nhật, giữ dữ liệu. Kiểm tra lại Kho bài → tải lại; Luyện tập → tạo bài; mở bài đang làm → chọn đáp án/nộp → lịch sử. Kiểm tra refresh sau khi để ứng dụng ít nhất 16 phút. Thử Wi-Fi và 4G. Các kiểm tra cách ly tài khoản/offline trong biên bản `ANDROID_RETEST_3CBDE63_2026-10-09.md` vẫn cần làm lại trên APK mới; thành công của unit/export không thay thế nghiệm thu điện thoại.

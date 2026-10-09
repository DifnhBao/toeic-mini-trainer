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

## Phát hành và nghiệm thu

APK mới đang chuẩn bị build EAS preview với khóa ký hiện có. Chưa xác minh bản sửa trên thiết bị Android thật.

Cài cập nhật, giữ dữ liệu. Kiểm tra lại Kho bài → tải lại; Luyện tập → tạo bài; mở bài đang làm → chọn đáp án/nộp → lịch sử. Kiểm tra refresh sau khi để ứng dụng ít nhất 16 phút. Thử Wi-Fi và 4G. Các kiểm tra cách ly tài khoản/offline trong biên bản `ANDROID_RETEST_3CBDE63_2026-10-09.md` vẫn cần làm lại trên APK mới; thành công của unit/export không thay thế nghiệm thu điện thoại.

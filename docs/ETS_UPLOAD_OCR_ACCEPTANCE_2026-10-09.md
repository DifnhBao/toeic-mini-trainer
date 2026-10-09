# Nghiệm thu upload và OCR ETS thực tế

Ngày 09/10/2026, API/web `ff80432`, domain `https://toeic-mini-trainer.vercel.app`. Đây là luồng ADMIN thật với hai tệp chủ dự án cung cấp, không phải fixture integration hoặc seed DB.

## Đã quan sát

1. Tab quản trị có phiên ADMIN hợp lệ sẵn có. Mở tác vụ ETS cũ FAILED vẫn trả thông báo không tìm thấy câu; không coi job cũ tự sửa thành công và không giả mạo/mint token đăng nhập.
2. Chọn đúng PDF `D:\ENG\Upload-test\ETS 2022 - LC - Full-001-014.pdf` (19,1 MB hiển thị, 14 trang) và audio `D:\ENG\Upload-test\TEST 1.mp3` (42,2 MB hiển thị). Khoảng 1–4 được chấp nhận, không còn lỗi giới hạn PDF 15 MB.
3. Bấm phân tích qua UI bình thường. Luồng upload riêng tư PDF/audio, xác nhận asset và OCR provider thật hoàn tất; có hai câu Part 1 với ký hiệu A/B/C/D, không tự điền đáp án. Không dùng script ghi DB hoặc gọi provider ngoài guard/quota của ứng dụng.
4. Đối chiếu render đủ bốn trang nguồn: trang 1–2 là bìa, trang 3 là hướng dẫn/ví dụ, trang 4 có câu 1–2. Hai câu OCR là đúng phạm vi này; không phải bằng chứng toàn bộ 100 câu đã được trích xuất.
5. Tab ban đầu còn giữ JavaScript cũ: có kết quả nhưng thiếu phần gắn ảnh/audio và cảnh báo key mới. Reload có chủ đích sau khi kết quả đã lưu, đăng nhập vẫn hợp lệ; danh sách xuất hiện tác vụ ETS trang 1–4 COMPLETED. Mở lại không gọi AI và thấy đủ hai câu, công cụ gắn ảnh/audio theo nhóm, nút nghe audio nguồn và cảnh báo thiếu answer key. Kết quả và liên kết audio tồn tại qua reload; chưa phát/nghe hoặc đối chiếu mốc audio.
6. Chưa duyệt/bỏ qua câu nào, chưa xác nhận quyền chia sẻ, chưa chuyển sang đóng góp hoặc công khai. Đáp án vẫn trống; nút duyệt/chuyển sang xuất bản bị chặn tương ứng. Không đoán đáp án bằng ảnh hoặc MP3.

Ảnh bằng chứng trước khi quyền trình duyệt bị rút: `Test/ets-ocr-current-client.jpg`, hiển thị tác vụ mới COMPLETED cạnh tác vụ FAILED cũ. Các render đối chiếu ở `Test/pdf-diagnosis/page-01.png` đến `page-04.png`, manifest ảnh nguồn trong `output/pdf/ets-2022-test-1-media/`. Không đưa PDF, MP3, ảnh câu hỏi, screenshot hoặc metadata tài khoản lên Git/Vercel/EAS.

## Dừng thao tác theo quyền trình duyệt

Thử chọn ảnh local `part1-q001.png` để gắn vào nhóm 1 bị Browser Use từ chối vì người dùng từ chối quyền upload. Chưa upload/gắn ảnh này. Thao tác đóng hộp chọn file tiếp theo cũng bị từ chối quyền truy cập toàn origin. Đã dừng toàn bộ thao tác web; không chuyển sang HTTP/CLI, browser khác hoặc lấy cookie/token để vượt qua giới hạn. Không dùng lỗi quyền này làm lỗi upload sản phẩm.

Quản trị viên có thể tự mở lại tác vụ COMPLETED và gắn ảnh từ gói local theo `ETS_MEDIA_PREPARATION_2026-10-08.md`. Nếu cần agent tiếp tục trên web, cần người dùng cấp lại quyền truy cập/upload tương ứng. Quyền còn thiếu được ghi rõ; không tự thử lại các upload hoặc truy cập đã bị từ chối.

## Việc còn lại

- Chưa nhận đường dẫn đáp án dù chủ dự án đã xác nhận có file. Cần đối chiếu key hợp lệ trước duyệt.
- Các trang 5–14 chưa nghiệm thu OCR thật trong lượt này; chuẩn bị OCR local cho các cụm đã có bằng chứng riêng. Chưa tạo thêm job cho các cụm sau khi quyền site bị rút.
- 11 ảnh đã cắt vẫn local, chưa gắn vào tác vụ. MP3 còn nguyên bài; chưa chia theo nhóm. Chưa nghiệm thu playback, xuất bản, quyền người học hoặc vòng Listening trên Android.
- Backup R2 16 object/18.948.378 byte trước đây không bao gồm các upload PDF/audio mới; không coi snapshot đó là điểm khôi phục của lượt nhập này.
- Không thay runtime hoặc triển khai lại API trong lượt nghiệm thu. APK mới `3cbde63` đã FINISHED/kiểm chứng file và chữ ký riêng; còn MS-01…MS-08 trên S23 FE và thiết bị Android thứ hai.

Kết luận giới hạn: lỗi chặn 15 MB và lỗi không thấy câu ở cụm 1–4 đã qua nghiệm thu upload/OCR/lưu/mở lại trên file thật. Bộ ETS đầy đủ, ảnh/audio khớp nhóm, key, công khai và beta chưa hoàn tất.

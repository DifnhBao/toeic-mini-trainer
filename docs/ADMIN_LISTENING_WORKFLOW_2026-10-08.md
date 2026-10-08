# Quản trị nhập đề/audio, người học chọn bài

Quyết định của người dùng ngày 08/10/2026: quản trị viên chuẩn bị nội dung trên web; người học không nhập tài liệu trên điện thoại. R-01…R-05 của APK `dcb6524` đã được người thử ghi đạt; R-06 chưa hoàn tất, cần nghiệm thu lại luồng dưới đây.

Source mobile `dee15f2`, API `0c21f9f` hỗ trợ gắn/lưu/xuất bản ảnh và audio riêng theo nhóm; giữ bản sửa scan và draft thiếu key của `aea97e2`; PDF nguồn tối đa 50 MiB. Guard ADMIN cho đường JSON cũ đã có từ `4242017`. APK preview EAS `f66fc9a6-cd3a-4985-9fb4-8664eff8db32`; theo dõi tại [trang build](https://expo.dev/accounts/dinhbao05s-team/projects/dinhbao05/builds/f66fc9a6-cd3a-4985-9fb4-8664eff8db32). Không dùng APK `dcb6524` để kết luận đã thử giao diện Kho bài mới. Bản sửa PDF nằm trên web/API, không cần build lại APK Kho bài.

APK đã FINISHED ngày 08/10/2026: [tải bản Kho bài mới](https://expo.dev/artifacts/eas/BuQ4n2XzKW6tim3MFgJZZvscfO6I_4V-yLGumPGtErk.apk). Bản cục bộ `Test/release-dee15f2.apk`, 114.429.599 byte; SHA-256 `702AEF922860D9066FA8CFB085340A38F34B9E2983BE64EACAB19CEDA50D21E4`. Kiểm tra CRC toàn bộ 1.698 mục, manifest, classes.dex và bốn ABI đạt, có arm64-v8a cho S23 FE. Đây là kiểm tra tính toàn vẹn gói, chưa xác nhận cài/chạy trên điện thoại. Cài cập nhật bằng APK này để giữ dữ liệu ứng dụng hiện có; nếu máy báo lỗi cài đặt, ghi lại thông báo trước khi gỡ app.

API `0c21f9f` đã promote lên domain chính, deployment `dpl_4Jjpy2Lak7ZcTwrp4aboKtmh6aKf`; 19/19 smoke trước và sau promote đạt. Bundle thực có gắn/nghe audio riêng, gắn/xem ảnh, PDF 50 MiB và cảnh báo thiếu key. Bản trước `f0bc90f`, deployment `dpl_FDgketUQrPGQj62jjd87kvETRNiu`; rollback chưa hỗ trợ clip riêng của tác vụ pending, cần bảo toàn dữ liệu và ưu tiên sửa tiến. Chi tiết tại `GROUP_AUDIO_2026-10-08.md`.

Đã kiểm tra 150 unit, 29 integration PostgreSQL/S3 loopback cách ly, TypeScript/lint, production build; Android export của APK Kho bài có 1.320 source. Archive EAS kiểm tra 270 tệp, không có env/backup/APK/dữ liệu thử. Kiểm tra tự động không upload hay công khai tài liệu trên DB thật.

R2 theo cấu hình cục bộ đã đạt HEAD bucket và OPTIONS preflight từ origin domain chính: HTTP 204, cho phép PUT và Content-Type. Đây chỉ là kiểm tra đọc bằng khóa cục bộ, không chứng minh secret Vercel giống cấu hình này hoặc upload thật đã thành công; không tạo object hay sửa CORS. Bằng chứng: `Test/storage-browser-readonly.json`.

## Quản trị viên trên máy tính

1. Đăng nhập đúng tài khoản ADMIN tại `https://toeic-mini-trainer.vercel.app`. Mở **Quản trị → Nhập đề & audio** (`/admin/extract`). Nếu báo chưa có quyền, dùng tài khoản quản trị hiện có; không tự sửa role/secret hoặc chạy seed DB.
2. Chọn PDF có quyền sử dụng, chứa câu hỏi/phương án và đủ thông tin kiểm tra đáp án; tối đa 50 MB (50 MiB). Chọn MP3/M4A/WAV tương ứng, tối đa 100 MB. Fixture trong `Test/qa-content` chỉ phục vụ kiểm tra kỹ thuật; nghiệm thu chính dùng PDF ETS 14 trang và MP3 do chủ dự án cung cấp.
3. Chọn tối đa bốn trang liên tiếp rồi bấm **Phân tích trang đã chọn**. Với ETS 14 trang, kiểm tra lần lượt các cụm 1–4, 5–8, 9–12, 13–14; không bỏ qua Part 1/2 khi nghiệm thu đầy đủ. Ở bước kiểm tra, gắn audio riêng khớp từng nhóm và nghe đối chiếu; hệ thống chưa tự cắt audio hoặc đặt mốc thời gian. Audio gắn vào nhóm có câu Part 1–4, không tự gắn vào câu đọc.
4. Đối chiếu từng câu với nguồn, sửa nội dung/phương án/đáp án/Part. Gắn ảnh đã cắt vào đúng nhóm (JPG/PNG/WebP tối đa 10 MiB); ảnh lưu vào tác vụ và cần duyệt lại nhóm sau thay đổi. Part 1 cần ảnh; không để đáp án thiếu. Dùng **Gắn audio riêng cho nhóm** và **Nghe audio của nhóm** để thay đoạn đã chuẩn bị; đổi media cần duyệt lại nhóm và xác nhận quyền chia sẻ. Sau đó bấm **Duyệt câu này** hoặc **Bỏ qua câu này**. Chỉ câu được duyệt mới được đưa sang bước tiếp theo. Không công khai nếu thiếu audio/ngữ cảnh hoặc đáp án chưa chắc chắn.
5. Xác nhận quyền chia sẻ; bấm **Chuyển … câu sang bước xuất bản** rồi **Mở trang Duyệt nội dung**. Không cần lưu một bản cá nhân trước. Nếu đóng trang, mở lại tài liệu trong **Tiếp tục tài liệu đã xử lý**; kết quả đã gửi được dẫn về hàng chờ, không tạo lần gửi mới.
6. Trên **Duyệt nội dung**, lấy/mở PDF nguồn, lấy audio và ảnh, nghe từng audio và kiểm tra đúng media theo số nhóm/tên file, kiểm tra toàn bộ câu và quyền chia sẻ. Xác nhận đã kiểm tra rồi bấm **Duyệt & công khai**. Audio và ảnh được sao chép và kiểm chứng trong vùng chia sẻ; PDF nguồn giữ riêng tư. Bước này tạo nội dung thật, cần người quản trị thực hiện sau kiểm tra.
7. Mở **Kho bài** (`/library`), tải lại, chọn bài vừa công khai và nghe thử. Mỗi bài là một nhóm câu chung audio/đoạn đọc, không phải toàn bộ PDF. Nhóm trên 50 câu cần chia lại; nhóm thiếu audio, ảnh Part 1 hoặc đoạn đọc Part 6–7 bị chặn tạo bài.

AI chỉ trích xuất nội dung PDF, không nghe audio đính kèm để xác định đáp án hoặc chép lời thoại. Quản trị viên cần đáp án/lời thoại từ nguồn hợp lệ để đối chiếu và sửa trước khi công khai. Với bộ mẫu, đáp án và lời thoại nằm ở trang 3, không nằm trong hai trang câu hỏi dùng để phân tích.

Giới hạn PDF nguồn đã được nâng từ 15 lên 50 MiB để nhận trường hợp PDF listening 19,1 MB người dùng báo. Giao diện, policy upload và worker dùng cùng một giới hạn; file được PUT trực tiếp lên R2, không gửi nguyên PDF qua body Vercel. Chọn lần lượt 1–4, 5–8… theo đúng nhóm câu/ngữ cảnh trong tài liệu. Không phân tích toàn bộ 14 trang hoặc cả 100 câu trong một lượt. PDF scan sau tách trang vẫn giới hạn 5 MiB cho OCR; nếu phần chọn quá nặng, chọn 1–2 trang hoặc giảm dung lượng rồi thử lại. Audio nguyên bài không tự chia; dùng chức năng gắn audio riêng để thay đoạn theo nhóm. Nút Dùng audio nguồn khôi phục nguồn nếu còn sẵn sàng, không xóa file.

Ảnh trong PDF chưa tự được cắt. Bản hiện tại cho gắn ảnh chuẩn bị riêng, lưu vào tác vụ và xuất bản bản sao ảnh/audio; người học nhận ảnh nhóm từ API đã có. Cần nghiệm thu media thật trên web/điện thoại; kiểm thử S3 giả lập chưa thay thế R2 thật.

Bộ ETS do chủ dự án cung cấp đã có 11 ảnh chuẩn bị riêng tại `output/pdf/ets-2022-test-1-media/`, kèm README ánh xạ câu 1-6 và các nhóm biểu đồ Part 3/4. Chọn đúng PNG theo số câu nguồn khi gắn ảnh; số thứ tự nhóm UI có thể khác. Gói ZIP cục bộ/kiểm tra toàn vẹn ghi tại `ETS_MEDIA_PREPARATION_2026-10-08.md`. Chưa upload/công khai và chưa có đáp án/audio chia theo nhóm.

## Người học trên web/Android

Mở **Kho bài → Tải lại kho bài → Luyện bài này**. Ứng dụng tạo một bài riêng cho tài khoản, lấy đầy đủ các câu đang công khai của nhóm; giữ audio/ngữ cảnh. Đáp án không nằm trong dữ liệu danh sách hoặc phản hồi tạo bài. Có **Xem thêm bài** khi danh sách dài.

Không thấy bài: quản trị viên phải hoàn tất **Duyệt & công khai**, không chỉ phân tích PDF hoặc gửi vào hàng chờ. Kho trống có hướng dẫn và lối vào luyện ngẫu nhiên theo Part. Các câu cá nhân và nháp bài luyện đã lưu trước đây không bị xóa.

APK cũ vẫn có thể hiện nút nhập tài liệu, nhưng USER/REVIEWER gọi API tạo upload, xác nhận upload, tạo/retry ingestion, gửi nội dung mới hoặc import JSON sẽ nhận `403 ADMIN_CONTENT_ONLY`. Quyền được kiểm tra lại ở server; UI không thay thế kiểm tra quyền. ADMIN dùng luồng web; API vẫn kiểm tra role và sở hữu media, không dựa vào tên thiết bị/client. Luồng JSON cũ chỉ lưu kho cá nhân của ADMIN, không thay thế xuất bản bài chung kèm audio.

## Nghiệm thu còn phải ghi

| Mã | Kiểm tra | Tiêu chí |
| --- | --- | --- |
| L-01 | USER và REVIEWER gọi tám API ghi nội dung mới, gồm JSON cũ | 403; không upload/gọi AI/tạo job |
| L-02 | ADMIN tải PDF/audio, duyệt và công khai trên web thật | Đúng câu/đáp án/nhóm, nghe được audio; PDF nguồn không công khai |
| L-03 | USER mở Kho bài trên web và APK mới qua Wi-Fi/4G | Thấy bài công khai, luyện/nghe lại/nộp đúng; không cần nhập file |
| L-04 | Thử nhóm riêng tư/chưa duyệt/đã ẩn, media bị thu hồi | Không tạo được bài; không lộ nội dung/đáp án nguồn |
| L-05 | Đóng trang quản trị rồi mở tài liệu gần đây | Tìm lại đúng job; GET không gọi AI mới; không gửi/xuất bản trùng |

Các kiểm thử tự động chỉ chứng minh trên dữ liệu cách ly. Chưa thay thế L-02/L-03/L-05 với tài khoản, R2, provider và thiết bị thật. Không seed/import bộ mẫu vào DB thật bằng script trong đợt triển khai mã.

Cập nhật OCR: bản `aea97e2` đã promote, 133 unit/19 integration/15 smoke trước và sau promote đạt. File ETS 14 trang thật đã kiểm chứng bước chuẩn bị OCR cả bốn cụm, chưa nghiệm thu Gemini thật. Xem `PDF_SCAN_RELEASE_2026-10-08.md`; draft thiếu key cần bổ sung trước khi lưu.

# Audio riêng cho từng nhóm câu

## Vấn đề và thay đổi

Trước đây mọi nhóm trong một tác vụ phải dùng cùng audio nguồn; nhóm câu ngắn có thể phải nghe/tìm trong MP3 nguyên bài. Bản này cho ADMIN gắn đoạn audio đã chuẩn bị vào từng nhóm, lưu lựa chọn vào tác vụ và chuyển đúng audio đó sang Kho bài khi duyệt. Không tự đoán mốc thời gian hoặc cắt MP3; nội dung audio phải được người quản trị đối chiếu với câu hỏi.

Ở bước kiểm tra câu, chọn **Gắn audio riêng cho nhóm**, tải MP3/M4A/WAV (tối đa 100 MiB), rồi **Nghe audio của nhóm** để kiểm tra. Audio áp dụng cho toàn bộ câu cùng nhóm; thay audio đặt lại quyết định duyệt của nhóm và xác nhận quyền chia sẻ. **Dùng audio nguồn** khôi phục audio gốc của tác vụ nếu còn READY. Nếu tác vụ không có audio nguồn, phải gắn file trước khi duyệt câu nghe. Không thay các câu cá nhân đã import trước đó.

Trang Duyệt nội dung liệt kê từng audio với tên file và số nhóm sử dụng, link tạm năm phút; các câu cũng hiện số nhóm để đối chiếu. Duyệt sẽ copy các audio/ảnh thực sự dùng sang vùng chia sẻ, kiểm chứng rồi lưu dữ liệu trong một giao dịch. Audio dùng ở nhiều nhóm chỉ copy một lần. Audio/PDF nguồn vẫn riêng tư.

## Quyền và tính đúng đắn

- API `POST /api/v1/ingestions/:id/audio` chỉ dành cho ADMIN ACTIVE; chủ tác vụ, COMPLETED/IMPORTED, chưa có đóng góp. Audio phải thuộc chủ tác vụ, đúng loại AUDIO và READY; null khôi phục nguồn, không xóa file cloud.
- Giới hạn 64 audio khác nhau/tác vụ, 30 thao tác gắn/phút; dùng upload intent/PUT/complete đã có. Chặn ghi đè bằng `updatedAt` tăng đơn điệu và compare-and-set, kể cả cạnh tranh với gửi đóng góp.
- Khi gửi/xem/duyệt: audio phải là nguồn hoặc đã đăng ký trong kết quả tác vụ, đúng chủ/loại/READY; duyệt cần ETag. File không đăng ký hoặc của tài khoản khác bị từ chối.
- Giữ copy ETag, kiểm tra byte đầu/size/type, giao dịch DB và cleanup an toàn. Nếu một source bị thu hồi lúc copy, toàn bộ xuất bản rollback; chỉ dọn bản sao chưa được DB tham chiếu. Không xóa bản sao khi trạng thái commit chưa rõ.
- Không thêm migration/dependency, không đổi runtime mobile. Luồng bài luyện tiếp tục dùng `group.audioUrl` hiện có; chưa thay thế nghiệm thu nghe thật trên APK.
- Tác vụ cũ dùng một audio nguồn vẫn được hỗ trợ. API preview giữ `audioUrl` khi chỉ có một audio và thêm `audios[]` ánh xạ nhóm; nhiều audio không trả một file mặc định gây nghe nhầm.

## Kiểm chứng

- 150 unit đạt; lint 0 lỗi/3 cảnh báo img đã có; TypeScript đạt.
- 29 integration đạt trên PostgreSQL loopback `toeic_release_test` và S3 HTTP loopback; container đã dừng. Thêm upload/verify clip, lưu và mở lại, audio sai chủ/loại/trạng thái, file chưa đăng ký, khôi phục nguồn và khóa sau gửi, nhiều nhóm/clip/dedup, người học đọc đúng bản sao, rollback khi thu hồi clip. Dữ liệu audio fixture chỉ kiểm chứng liên kết và byte, chưa phải nghiệm thu decoder/nghe MP3 thực tế.
- Không ghi Neon/R2 thật trong test. Lượt đầu thiếu `sslmode=disable` ở URL test đã dừng; lượt tiếp gặp quota do các ca dùng chung admin. Đã tách counter contribution-submit giữa các ca độc lập, giữ limiter trong từng ca và giữ nguyên policy production. Lượt hoàn chỉnh cuối mới là bằng chứng đạt.
- Production build Next.js 16.3.8 Webpack đạt, TypeScript và 41 trang static hoàn tất; route audio mới được build. Log local: `Test/unit-audio-final.txt`, `Test/typecheck-audio-final.txt`, `Test/lint-audio-final.txt`, `Test/integration-audio-final.txt`, `Test/build-audio-final.txt`. Rollout sẽ ghi riêng sau kiểm chứng.

## Cổng còn lại

Chưa cắt/chọn mốc cho MP3 ETS thật, chưa nhận file đáp án 1-100, chưa nghiệm thu OCR provider/ADMIN upload-R2/Kho bài trên điện thoại. Bộ 11 ảnh local đã chuẩn bị tại `ETS_MEDIA_PREPARATION_2026-10-08.md` chưa được công khai. Không coi bộ ETS hoàn chỉnh hoặc mở beta chỉ vì test đạt.

Bản rollback trước khi triển khai là `f0bc90f` (`dpl_FDgketUQrPGQj62jjd87kvETRNiu`). Bản đó chưa nhận audio riêng của nhóm, nên rollback phải dừng gửi/duyệt tác vụ mới có clip và bảo toàn dữ liệu; không xóa media/job để né lỗi. Không có migration nhưng cần kiểm tra dữ liệu pending và ưu tiên sửa tiến.

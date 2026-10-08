# Ảnh cho đề nghe và Kho bài

## Luồng quản trị

Sau khi AI trả draft, tại **Kiểm tra dữ liệu → Ảnh Part 1 hoặc biểu đồ**, chọn JPG/PNG/WebP đã cắt từ tài liệu (tối đa 10 MiB). Ảnh gắn cho toàn nhóm câu đang mở. Với draft mới, AI được yêu cầu tách mỗi câu Part 1 thành một nhóm; nếu nhóm cũ chứa nhiều ảnh, quản trị viên phải dùng ảnh tổng hợp có đủ số câu hoặc chuẩn bị lại nhóm. Không coi AI phân nhóm là đúng nếu chưa kiểm tra.

Liên kết ảnh được lưu vào `IngestionJob.result`, không chỉ trong bộ nhớ trình duyệt. Mở lại tài liệu vẫn có nút xem/thay/bỏ ảnh; bỏ liên kết không xóa file gốc. Ảnh thay đổi làm các quyết định duyệt của nhóm trên trang hiện tại quay về chờ duyệt. Chỉnh ảnh của tác vụ đã IMPORTED không sửa những câu cá nhân đã lưu trước đó.

Khi gửi vào hàng chờ, tác vụ được khóa theo phiên bản trong cùng giao dịch tạo đóng góp. Tác vụ đã gửi không nhận thay ảnh nữa. Trang **Duyệt nội dung → Lấy audio và ảnh** cho xem ảnh theo số nhóm và nghe audio bằng link tạm thời 5 phút.

**Duyệt & công khai** kiểm tra lại nguồn/đáp án/media. Bài nghe thiếu audio hoặc Part 1 thiếu ảnh bị chặn trước khi sao chép. Ảnh và audio được copy có điều kiện ETag vào vùng chia sẻ, xác minh rồi lưu asset/câu hỏi/trạng thái duyệt trong một giao dịch. Bản nguồn vẫn riêng tư. Kho bài và APK Kho bài hiện có đã có khả năng hiển thị `imageUrl`, không thay runtime mobile.

## Kiểm soát dữ liệu

- API gắn ảnh chỉ dành cho ADMIN, tác vụ của chính tài khoản, trạng thái COMPLETED/IMPORTED, chưa có đóng góp. Chỉ nhận asset IMAGE/READY/đúng chủ; tối đa 16 ảnh duy nhất/tác vụ.
- Cập nhật dùng `updatedAt` tăng đơn điệu và compare-and-set; import/gửi duyệt cũng kiểm tra phiên bản để không bỏ mất thay đổi ảnh từ tab khác.
- Gửi/duyệt chỉ nhận ảnh đã đăng ký trên tác vụ, cùng chủ và còn READY. Audio vẫn phải thuộc source job; không xuất bản PDF dưới dạng ảnh hoặc audio.
- Khi duyệt, tạo bản sao riêng cho từng asset, thay toàn bộ tham chiếu; không chuyển quyền sở hữu file gốc. Trong giao dịch còn kiểm tra owner/kind/status/ETag nguồn.
- Copy/verify/SQL lỗi thì dọn các destination của chính lượt đó. Nếu phản hồi commit DB không rõ, chỉ dọn khi xác minh không có asset DB tham chiếu; nếu DB không đọc được thì giữ object để xử lý sau, không xóa media có thể đã công khai.
- Tệp nguồn/backup/.env không nằm trong Git hoặc payload Vercel. Không có migration mới.

## Bằng chứng local

146 unit, TypeScript và production build Next.js 16.3.8 Webpack đạt; lint 0 lỗi/3 cảnh báo ảnh có sẵn. Một lượt trong sandbox gặp lỗi tài nguyên/module; lượt chạy đầy đủ ngoài sandbox đạt, không dùng kết quả thiếu test làm bằng chứng.

Năm phép thử API tích hợp mới dùng PostgreSQL loopback và server S3 giả lập chỉ bind 127.0.0.1, credential fixture và ảnh PNG fixture. Chúng kiểm tra upload/complete thật qua API, gắn/mở lại tác vụ, từ chối file khác loại/tài khoản khác, xem media theo quyền, hai lượt duyệt đồng thời chỉ công khai một lần, người học lấy ảnh copy mà không nhận đáp án, rollback DB và dọn copy khi thu hồi ảnh trong lúc copy, và chặn Part 1 thiếu ảnh trước cloud write. Có cảnh báo deprecation của driver pg khi duyệt đồng thời; hành vi hiện tại đạt, cần theo dõi khi nâng pg/Prisma. Lượt cuối **24/24 integration đạt** sau sửa chống ghi đè; container test đã dừng. Deployment ghi sau rollout.

Không ghi Neon/R2 thật trong test. Chưa thay thế nghiệm thu trình duyệt ADMIN, R2 thật và APK trên điện thoại.

## Còn thiếu để dùng trọn bộ ETS

- Đường dẫn file answer key: chủ dự án đã xác nhận có, chưa cung cấp. Không tự suy đáp án từ MP3.
- OCR Gemini thật của PDF được cung cấp cần nghiệm thu sau bản sửa scan.
- Cắt ảnh từ PDF và chia audio/mốc thời gian vẫn thủ công; bản này hỗ trợ gắn ảnh đã chuẩn bị, không tự làm các bước đó.
- Kiểm tra các biểu đồ và ảnh đúng nhóm, nội dung/đáp án/quyền chia sẻ trước công khai. Sau đó thử Kho bài trên S23 FE qua Wi-Fi/4G và thiết bị Android thứ hai.
- Vận hành/offsite backup/cảnh báo provider/tải/beta vẫn là các cổng còn mở trong `IMPLEMENTATION_STATUS_2026-10-08.md`.

## Rollout đã kiểm chứng

Source `f0bc90f`, nhánh `codex/release-readiness`, đã push. Deployment `dpl_FDgketUQrPGQj62jjd87kvETRNiu` READY và đã promote lên `https://toeic-mini-trainer.vercel.app`. 18/18 HTTP smoke đạt trước và sau promote; bundle thực ở cả hai URL có gắn/xem ảnh, PDF 50 MiB và cảnh báo thiếu key. Payload 147 tệp/đủ 123 app-types-prisma, không có env/nguồn mẫu/backup/APK. Log cục bộ `Test/unit-images-final.txt`, `Test/integration-images-final.txt`, `Test/build-images-final.txt`, `Test/vercel-protected-smoke-f0bc90f.txt`, `Test/vercel-promoted-smoke-f0bc90f.txt`, `Test/vercel-images-canonical-bundle.json`.

Bản trước: `aea97e2`, deployment `dpl_7WjBJYxSd87J4CWMgEWC8XzR83HS`, URL `https://toeic-mini-trainer-p3dxwsfpa-le-dinh-bao-s-projects.vercel.app`. Không có migration. Rollback mất chức năng gắn/xuất bản ảnh cho tác vụ pending; không xóa ảnh/job để né lỗi, ưu tiên dừng ingestion và sửa tiến nếu đã có dữ liệu mới.

# Kiểm tra câu hỏi cũ trước khi xuất bản — 09/10/2026

## Vấn đề và thay đổi

API `POST /api/v1/admin/questions/{id}/publish` trước đây chỉ kiểm tra trạng thái câu và đóng góp của nhóm có media. Dữ liệu `LEGACY`/`ARCHIVED` chưa qua schema nhập mới có thể được xuất bản dù đáp án không thuộc lựa chọn, bài nghe thiếu audio/ảnh hoặc bài đọc thiếu đoạn văn. Một đóng góp đã duyệt cũng chưa chứng minh asset hiện tại là media chia sẻ sẵn sàng.

Bản sửa kiểm tra lại ngay trong transaction xuất bản:

- Part nguyên 1–7; lựa chọn A–D có nội dung, từ hai đến bốn lựa chọn theo hợp đồng import hiện có; đáp án phải nằm trong lựa chọn. Nội dung câu bắt buộc từ Part 3 trở lên, có giới hạn độ dài.
- Part 1–4 cần audio; Part 1 cần thêm ảnh. Tất cả media được tham chiếu phải thuộc nhóm đã duyệt, là asset `READY`, đúng loại và không thuộc tài khoản riêng. Nhóm riêng tư và URL legacy bị chặn, kể cả khi đóng góp mang trạng thái đã duyệt.
- Part 6–7 cần đoạn đọc có chữ; HTML rỗng, script và khoảng trắng không đủ điều kiện.
- Cập nhật so sánh trạng thái, `contentRevision` và `groupId` đã đọc. Hai request xuất bản cùng câu chỉ một request thành công và ghi audit. Xuất bản lại sau khi ẩn phải đi qua toàn bộ kiểm tra.

Request và quyền ADMIN giữ nguyên; không tự sửa dữ liệu, xuất bản, seed, migrate hoặc đọc/ghi storage thật. Các câu đã xuất bản không bị thay đổi hồi tố. API trả lỗi có hướng dẫn qua bộ điều khiển quản trị hiện có.

## Bằng chứng và phạm vi nghiệm thu

Bốn kiểm thử đơn vị mới bao phủ nội dung, lựa chọn/đáp án, media và đoạn đọc. Sáu kiểm thử API/PostgreSQL mới bao phủ ADMIN/USER/REVIEWER, đầu vào, câu riêng tư, dữ liệu cũ sai, trạng thái/loại/quyền sở hữu asset, xuất bản đồng thời và kiểm tra lại sau archive. Fixture tạo UUID riêng và dọn dữ liệu sau lượt chạy; asset ở đây chỉ là metadata giả, không đại diện cho object R2 thật.

| Kiểm tra | Kết quả |
| --- | --- |
| Unit/regression | 207/207 đạt, không bỏ qua |
| PostgreSQL integration | 52/52 đạt, chín suite, không bỏ qua; 97,175 giây |
| TypeScript | Đạt |
| Lint | 0 lỗi, ba cảnh báo img đã có |
| Production build | Next.js 16.3.8 Webpack đạt, 41/41 trang tĩnh và build trace hoàn tất, exit 0 |
| Migration | Giữ nguyên 11 migration đã áp dụng trên fixture PostgreSQL 16 ở lượt trước; không thêm migration |

Log cục bộ: `Test/unit-publication-preflight.txt`, `Test/typecheck-publication-preflight.txt`, `Test/lint-publication-preflight.txt`, `Test/integration-publication-preflight.txt`, `Test/build-publication-preflight.txt`. Fixture dùng DB `toeic_release_test` chỉ bind `127.0.0.1:55433`, không dùng Neon/R2/provider thật; container đã dừng sau kiểm tra. Không khởi động container của dự án khác.

## Giới hạn và bước tiếp theo

Đây là cổng kiểm tra metadata/dữ liệu trước xuất bản câu cũ, không phải xác minh đáp án đúng theo nguồn, bản quyền, độ chính xác OCR, âm thanh/hình ảnh thật hoặc kiểm kê toàn bộ câu đã xuất bản. Chưa áp dụng yêu cầu đúng ba/bốn lựa chọn theo từng Part ngoài hợp đồng import hiện có; người kiểm duyệt vẫn phải đối chiếu định dạng đề. Không thực hiện HEAD/GET object trong transaction DB; cần nghiệm thu R2 riêng.

Chưa có API editor câu đã xuất bản. Khi bổ sung editor hoặc thay media chia sẻ, phải phối hợp cập nhật phiên bản/khóa cả câu, nhóm và asset, giữ đúng đề đang làm/lịch sử và cache lời giải. Không dùng kiểm tra snapshot ở đây làm bằng chứng chống mọi thay đổi media đồng thời trong một editor tương lai.

API live vẫn `ff80432`; bản sửa này chưa deploy. CI từ xa, Browser Use trên sản phẩm và nghiệm thu điện thoại vẫn chưa xác minh. Cần kiểm tra deployment được phép và ADMIN UI trước rollout; không đóng CONTENT-03, OPS hoặc beta từ kết quả local.

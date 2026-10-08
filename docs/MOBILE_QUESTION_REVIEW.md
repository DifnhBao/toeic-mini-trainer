# Mobile: sửa, duyệt câu hỏi và khôi phục tác vụ

Ngày triển khai source: 2026-10-01. Nhánh: `codex/mobile-question-review`.

**Lưu ý ngày 08/10/2026:** người dùng đã chọn ADMIN nhập đề/audio trên web, người học chọn bài sẵn. APK kho bài mới thay màn nhập mobile; tài liệu dưới đây giữ bằng chứng và ca kiểm thử của luồng cũ. Nghiệm thu hiện tại theo `ADMIN_LISTENING_WORKFLOW_2026-10-08.md`; không yêu cầu người học upload PDF/audio trên điện thoại. Dữ liệu cá nhân đã lưu vẫn được giữ.
Đây là bản thay đổi local, chưa commit/push/deploy và chưa xác nhận trên điện thoại thật.

## Phạm vi đã triển khai

- Màn Tài liệu trên mobile: duyệt từng câu, sửa Part, nội dung, phương án A–D và đáp án đúng; bỏ qua câu không dùng.
- Tất cả câu phải được duyệt hoặc bỏ qua; phải giữ ít nhất một câu hợp lệ. Sửa lại câu đã duyệt sẽ đưa về chưa duyệt.
- Lưu kho cá nhân và gửi đóng góp đều gửi các quyết định cùng nội dung đã sửa, không gửi nguyên kết quả AI.
- API dựng lại nhóm từ kết quả nguồn của chính chủ tác vụ; không cho client thay nhóm/media hay đưa PDF nguồn vào kho chung.
- Quyền chia sẻ phải được xác nhận lại trong phiên hiện tại, không được lưu trong bản nháp.
- Bản nháp tự lưu qua AsyncStorage, gồm chỉnh sửa, quyết định và vị trí câu đang xem. Phân vùng theo API + tài khoản + tác vụ.
- So khớp SHA-256 của kết quả AI trước khi khôi phục; bản nháp hỏng hoặc kết quả nguồn đổi thì yêu cầu duyệt lại.
- Ghi nháp theo thứ tự; lỗi bộ nhớ được báo rõ và có nút thử lưu lại. Chỉ đóng app khi báo đã lưu trên máy.
- Khôi phục dấu tác vụ hiện tại và danh sách tối đa 20 tác vụ gần nhất. Mở lại không tạo tác vụ hay gọi AI mới.
- Đổi tài khoản sẽ thay màn hình và dừng theo dõi tác vụ cũ; phản hồi polling muộn không cập nhật màn hình.
- Trạng thái đóng góp được lấy theo chính tác vụ, không phụ thuộc danh sách 30 đóng góp gần nhất.
- Sau khi đã lưu, muốn sửa tiếp cho đóng góp phải chọn “Duyệt / sửa riêng cho bản đóng góp”. Không thay đổi kho cá nhân đã lưu.

## API và tương thích

- `GET /api/v1/ingestions`: Bearer hoặc web session hợp lệ; chỉ metadata 20 tác vụ của chính user, không chứa kết quả AI/URL ký; không cache.
- `GET /api/v1/ingestions/:id`: bổ sung `job.reviewProtocol = 1` và trạng thái đóng góp của tác vụ.
- `POST /api/v1/ingestions/:id/import`: nhận `{ reviews }` cho mobile mới và web; kiểm tra đủ các vị trí, dữ liệu sửa hợp lệ và giới hạn body 512 KiB.
- `POST /api/v1/contributions`: nhận `{ jobId, reviews, rightsConfirmed: true }`; chỉ giữ câu duyệt, loại đường media legacy, xác minh audio thuộc tác vụ.
- APK cũ gửi import Bearer không body vẫn được hỗ trợ tạm thời. Body sai từ APK mới không được chuyển sang lưu thô. Web không được dùng đường không body.
- Payload đóng góp `{ jobId, data, rightsConfirmed }` cũ vẫn hoạt động cho web/APK cũ.
- Mobile mới chặn lưu/gửi nếu không có `reviewProtocol = 1`, đồng thời kiểm tra lại API/kết quả nguồn ngay trước thao tác ghi.
- Phải deploy API trước khi thử mobile mới. Nếu rollback API, phải tải lại tác vụ; không dựa vào tính năng mới với server cũ.

Không cần migration, database mới, secret mới hoặc dependency mới.

## Tiêu chí nghiệm thu

| Mã | Tình huống | Kết quả cần đạt |
| --- | --- | --- |
| MR-01 | Mở kết quả mới | Mọi câu chưa duyệt; nút lưu/gửi bị khoá |
| MR-02 | Sửa câu, phương án, chọn đáp án | Lưu đúng bản sửa; phương án trống không gửi; đáp án phải có nội dung |
| MR-03 | Bỏ qua một số câu | Chỉ câu duyệt được lưu/gửi, giữ nguyên ngữ cảnh nhóm |
| MR-04 | Có câu chưa duyệt, đáp án thiếu, hoặc bỏ qua tất cả | Không được lưu/gửi; có chỉ dẫn sửa lỗi |
| MR-05 | Sửa lại câu đã duyệt | Trở về chưa duyệt, phải duyệt lại |
| MR-06 | Đóng app sau báo “đã lưu bản nháp” rồi mở lại | Khôi phục nội dung sửa, các quyết định, vị trí câu và tác vụ |
| MR-07 | Bản nháp hỏng, sai vị trí hoặc hash nguồn đổi | Không khôi phục quyết định duyệt cũ; báo cần kiểm tra lại |
| MR-08 | Mất mạng khi lưu/gửi | Bản nháp còn nguyên; kiểm tra trạng thái server; thử lại không tạo bản trùng |
| MR-09 | Đổi tài khoản hoặc dùng ID tác vụ tài khoản khác | Không hiện bản nháp account trước; API không trả/import dữ liệu của chủ khác |
| MR-10 | Gửi đóng góp | Xác nhận quyền chia sẻ mới; đúng các câu duyệt; vào PENDING; PDF không công khai |
| MR-11 | Bộ câu hỏi đã import từ máy khác/APK cũ | Không import trùng; có thể bật chế độ duyệt riêng cho đóng góp |
| MR-12 | Storage đầy / không đọc được | Không báo đã lưu giả; không ghi đè bản nháp chưa đọc được; có cách thử lại |
| MR-13 | API cũ hoặc rollback | Mobile không chủ động gửi payload mới cho API chưa hỗ trợ review |
| MR-14 | Đoạn đọc dạng chữ thường | Không bị bộ lọc HTML xoá trắng; mã/nhúng nguy hiểm bị loại |

## Kiểm chứng và giới hạn

Kiểm tra tự động: schema/payload mobile → bộ dựng import thật; draft storage giả lập;
route import/list/contribution thật với JWT test và toàn bộ database giả lập;
lọc HTML; typecheck root/mobile; lint; build Next.js; export bundle Android offline.
Không gọi Gemini, không upload tài liệu, không ghi Neon/R2 trong kiểm thử này.

Những kiểm tra này không thay thế nghiệm thu trên APK thật. Chưa xác nhận thao tác bàn phím,
đóng app cưỡng bức, bộ nhớ native, upload/mạng điện thoại hoặc Google login của build mới.

Kết quả kiểm chứng local cuối cùng (2026-10-01):

| Kiểm tra | Kết quả |
| --- | --- |
| Toàn bộ test root, bao gồm kiểm thử mới | 68/68 đạt |
| Typecheck root và mobile | Đạt |
| Lint toàn repo | 0 lỗi; 3 cảnh báo ảnh có sẵn trên web |
| Build Next.js | Đạt |
| Expo export Android offline | Đạt; đây là bundle JavaScript, không phải APK đã cài |
| Nghiệm thu trên điện thoại / staging | Chưa thực hiện cho bản thay đổi này |

Giới hạn cần biết:

- Bản nháp nằm trên máy, không đồng bộ web/điện thoại khác. Xoá dữ liệu app hoặc gỡ app sẽ mất nháp.
- AsyncStorage không mã hoá. Không lưu token, secret, quyền chia sẻ, đoạn đọc nhóm hoặc URL ký vào bản nháp; nội dung câu hỏi sửa vẫn là dữ liệu local trên thiết bị.
- Giới hạn nháp local 1 MiB; payload ghi API 512 KiB. Dữ liệu quá lớn bị từ chối, không tự cắt mất câu.
- Danh sách gần đây chỉ có 20 tác vụ; chưa có tìm kiếm/phân trang đầy đủ.
- Đóng góp đã gửi/bị từ chối chưa có vòng sửa và gửi lại; đó là task tiếp theo, không phải lỗi đã được giải quyết trong bản này.
- Đoạn đọc đã bị xoá trong kết quả cũ không tự phục hồi. Không chạy backfill hoặc phân tích lại có tính phí.
- Đường tương thích APK cũ chưa bắt buộc duyệt. Cần chính sách phiên bản tối thiểu và bỏ đường này sau khi người dùng chuyển sang app mới.

## Đưa lên thử nghiệm

1. Chủ dự án duyệt diff, cho phép commit/push và mở PR riêng; chưa merge nếu chưa duyệt PR.
2. Sau khi CI đạt và được duyệt, deploy API lên staging. Không chạy migration cho bản này.
3. Xác minh detail tác vụ của chính chủ trả `reviewProtocol = 1`, GET-list owner-only và API không đăng nhập trả 401.
4. Dùng development APK hiện tại với Metro mới để thử trước (không thêm module native mới). Preview/standalone APK cần build mới để nhận JavaScript này nếu chưa có cơ chế cập nhật OTA.
5. Thử một PDF ngắn có quyền sử dụng: sửa câu 1, duyệt; bỏ qua câu 2; giữ câu 3 chưa duyệt để xác nhận nút lưu bị khoá.
6. Đợi báo nháp đã lưu, đóng/mở app, kiểm tra bản sửa và quyết định; sau đó duyệt phần còn lại và lưu. Kiểm tra bộ câu hỏi thực tế không chứa câu đã bỏ qua.
7. Tắt mạng lúc mở tác vụ và lúc lưu; bật lại, mở lại và kiểm tra không có câu trùng. Không bấm phân tích lại để khôi phục.
8. Nếu muốn thử đóng góp thật, xác nhận trước việc tạo dữ liệu staging; gửi bản duyệt, kiểm tra admin nhận đúng nội dung sửa và trạng thái PENDING.

Chỉ đánh dấu hoàn tất nghiệm thu thiết bị khi chủ dự án đã xác nhận các bước trên.

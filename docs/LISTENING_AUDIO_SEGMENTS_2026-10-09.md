# Chuẩn bị các đoạn audio Listening

**Cập nhật:** đã bổ sung bước nhận dạng lời nói miễn phí trên CPU và nạp mốc AI vào công cụ này. Xem [quy trình AI cục bộ](./LISTENING_AI_LOCAL_2026-10-09.md). Phần dưới mô tả cách nghe/chỉnh mốc và gắn clip vào nhóm; không cần tự tìm từ đầu nếu đã nạp đề xuất AI.

## Vấn đề và cách xử lý

File `TEST 1.mp3` do người dùng cung cấp dài **2762,867567 giây (~46 phút 03 giây)**, 44.275.491 byte. Trang nhập đề hiện gắn nguyên file nguồn cho nhóm nếu chưa thay bằng audio riêng. Chức năng gắn audio riêng đã có trên web/API; APK hiện tại phát được cùng định dạng MP3 qua `group.audioUrl`.

Bổ sung công cụ **cục bộ trên máy quản trị viên**, không phải worker tự cắt trên Vercel. Công cụ có trình nghe file gốc, nhập/tua vị trí, lấy vị trí hiện tại làm đầu/cuối, nghe thử đoạn, lưu mốc và xuất MP3 thật. Sau khi cắt, quản trị viên gắn MP3 vào nhóm bằng chức năng sẵn có. Không thay đổi DB, API hoặc APK; chưa triển khai thay đổi lên web production.

Theo cấu trúc đề TOEIC Listening 100 câu:

| Part | Câu | Đơn vị audio | Số đoạn |
|---|---|---|---:|
| 1 | 1–6 | Một câu, đủ lựa chọn A–D | 6 |
| 2 | 7–31 | Một câu hỏi và lựa chọn A–C | 25 |
| 3 | 32–70 | Hội thoại cùng ba câu hỏi | 13 |
| 4 | 71–100 | Bài nói cùng ba câu hỏi | 10 |

Tổng **54 đoạn**, không phải 100 đoạn rời. Luồng thủ công dùng mẫu đánh số này; luồng AI bổ sung nhận dạng lời đọc số câu/nhóm, không suy ra mốc chỉ từ khoảng im lặng. Quản trị viên cần đối chiếu PDF, nghe đầu/cuối và xác nhận. Giữ khoảng lặng ngắn ở hai đầu, không cắt mất lời đọc số câu/đáp án hoặc lẫn câu kế tiếp.

## Mở công cụ trên máy này

Trong PowerShell, tại thư mục repository:

```powershell
npm run audio:prepare -- "D:\ENG\Upload-test\TEST 1.mp3" "D:\code\Toeic\toeic-mini-trainer\output\audio\ets-2022-test-1"
```

Máy hiện có Node 22.19.0 và FFmpeg/ffprobe 9.0.2 trên PATH. Máy khác cần cài hai công cụ này trước. Mở liên kết `http://127.0.0.1:<port>/?key=...` được in trong terminal bằng Chrome/Edge. Chỉ dùng trên máy chạy công cụ; giữ terminal mở trong lúc nghe/cắt. Ctrl+C để đóng. Khởi động lại với cùng file nguồn và thư mục để tiếp tục mốc đã lưu.

1. Chọn nhóm, ví dụ **Part 1 · Câu 1**. Nghe file gốc, tìm đúng số câu.
2. Nhấn **Lấy vị trí hiện tại làm đầu/cuối** hoặc nhập `mm:ss.mmm`. Nhấn **Nghe thử đoạn đã chọn**, đối chiếu PDF và toàn bộ lựa chọn.
3. Có thể **Lưu mốc để làm tiếp** khi chưa kiểm tra xong. Để xuất, tích xác nhận đã nghe đúng nhóm rồi nhấn **Xuất MP3 cho nhóm này**.
4. Nghe MP3 vừa cắt bên dưới. File nằm trong thư mục xuất; cũng có liên kết tải file. Tên bao gồm Part, số câu và mốc, ví dụ `part3-q032-034-<đầu-ms>-<cuối-ms>.mp3`.
5. Trên `/admin/extract`, mở tác vụ tương ứng, chọn đúng câu/nhóm → **Gắn audio riêng cho nhóm** → chọn MP3 vừa xuất → **Nghe audio của nhóm**. Duyệt lại các câu trong nhóm. Không chọn **Dùng audio nguồn** nếu muốn giữ đoạn riêng.

Với bản nháp trang 1–4 hiện tại, làm hai đoạn cho **câu 1 và 2** trước. Part 1 cần gắn thêm ảnh, nhập đáp án Q1=B/Q2=C rồi duyệt. Đối chiếu số câu gốc PDF khi chuyển sang nhóm trang tiếp theo, vì chỉ số câu trên giao diện có thể bắt đầu lại từ 1.

## Giới hạn và bảo vệ dữ liệu

- Chỉ MP3/WAV/M4A cục bộ ≤100 MiB, dài ≤2 giờ; một đoạn ≤10 phút. Không tải file hoặc mốc lên cloud, không dùng dịch vụ transcription.
- Không đổi file nguồn. FFmpeg chỉ đọc giao thức file/pipe, chọn audio đầu tiên, loại ảnh bìa/metadata nguồn và mã hóa MP3 128 kbps. Dùng seek khi mã hóa để bỏ phần trước mốc chính xác; xem [tài liệu FFmpeg về `-ss`/accurate seek](https://ffmpeg.org/ffmpeg.html#Main-options).
- Kiểm tra thời lượng xuất lệch không quá 0,2 giây (có padding MP3). Kiểm tra này xác nhận kỹ thuật, **không xác nhận đúng câu bằng nội dung**.
- Từ chối mốc ngược, ngoài file, chồng lấn hoặc sai thứ tự câu. Không ghi đè file clip tồn tại. Nếu đã xuất cùng mốc, dùng file trong thư mục xuất; nghe lại qua trình phát của công cụ chỉ có trong phiên vừa xuất.
- `segments.json` giữ mốc, xác nhận nghe, tên file nguồn và SHA-256. Khi mở lại, từ chối manifest của nguồn khác. Clip và manifest trong `output/` được loại khỏi Git, EAS và Vercel.
- Server chỉ bind 127.0.0.1, kiểm tra Host/Origin và khóa phiên; không đọc đường dẫn file tùy ý qua HTTP. Không có CORS, không thực thi lệnh shell từ dữ liệu trình duyệt.

## Kiểm chứng

`tests/listening-segments.test.ts`: cấu trúc 54 nhóm/100 câu, nhóm ba câu, mốc/timestamp, cắt tín hiệu ba tần số và kiểm tra đoạn đúng âm bằng PCM, thời lượng, bảo toàn nguồn/clip tồn tại, dọn file tạm, HTTP Range, khóa/Host/Origin, lưu và mở lại mốc. Hai ca FFmpeg cần FFmpeg/ffprobe trên PATH, bỏ qua rõ ràng nếu thiếu trên máy CI.

Kết quả trên máy này: **5/5 ca đạt, không bỏ qua**; TypeScript toàn repo và ESLint các file thay đổi đạt; JavaScript của công cụ qua kiểm tra cú pháp. Công cụ đã khởi động với file ETS thật, đọc được thời lượng, không báo lỗi; working set lúc khởi động khoảng 28 MiB. Chưa có kiểm tra giao diện/phát tiếng bằng browser tự động hoặc xác nhận nghe từ người dùng.

Luồng AI đã tạo 54 mốc đề xuất cho ETS; xem biên bản AI ở liên kết trên. Chưa có xác nhận nghe nội dung từ người dùng, chưa gắn clip vào bản nháp thật và chưa nghe audio trên điện thoại. Browser Use vẫn có lỗi quyền đã ghi nhận; không dùng giao thức khác để tự thao tác website bị chặn. Người dùng có thể dùng công cụ và gắn clip bằng trình duyệt của mình ngay.

# Nhận dạng và chia audio Listening miễn phí trên máy

## Chi phí và phạm vi

Tính năng này dùng **faster-whisper 1.2.1**, mô hình tiếng Anh **base.en** chạy CPU/INT8 và FFmpeg. Không có phí API theo phút, tài khoản cloud hoặc khóa API. Chi phí sử dụng máy/điện/mạng có sẵn; dung lượng lưu file trên R2 và các dịch vụ web hiện tại vẫn theo gói của chúng, không nằm trong cam kết miễn phí của bước xử lý audio.

Mô hình có giấy phép MIT; tải một lần khoảng **148 MB** (147.769.510 byte cho bốn file). [Mô hình Systran](https://huggingface.co/Systran/faster-whisper-base.en), [faster-whisper trên PyPI](https://pypi.org/project/faster-whisper/), [INT8 trong CTranslate2](https://opennmt.net/CTranslate2/quantization.html).

Audio được đọc và nhận dạng tại máy. Chỉ script tải mô hình có truy cập mạng; script nhận dạng dùng đường dẫn mô hình cục bộ, `local_files_only=True`, tắt telemetry và bật chế độ offline Hugging Face. Không gửi MP3, PDF hoặc transcript lên dịch vụ AI. Mô hình được ghim revision `3d3d5dee26484f91867d81cb899cfcf72b96be6c`; bốn checksum SHA-256 được ghim trong downloader và kiểm tra trước khi dùng.

## Hành vi

- Nhận dạng từng cửa sổ 120 giây, chồng lấn 8 giây, tối đa hai luồng CPU mặc định. Lưu checkpoint theo cửa sổ; chạy lại dùng phần đã xử lý. Không giải mã toàn bộ 46 phút vào bộ nhớ cùng lúc.
- Đọc lời thông báo số câu, số viết bằng chữ/chữ số và dải `35–37`/`35 through 37`. Bỏ số được lặp trong lời hướng dẫn Part 1 và lời mở đầu Part 2; giới hạn số câu theo mốc chuyển Part.
- Part 1–2 chia từng câu; Part 3–4 giữ toàn bộ hội thoại/bài nói và ba câu hỏi. Mốc chuyển Part dùng để bỏ hướng dẫn của Part kế tiếp ra khỏi đoạn cuối Part trước.
- Phân tích các cửa sổ độc lập rồi gộp mốc để không phá thông báo nằm ngang ranh giới chunk. Mốc thiếu, nhiều cách nhận dạng hoặc chồng lấn được ghi vào `unresolved`; không suy diễn mốc chỉ từ thứ tự câu.
- Có thể nhận dạng lại cửa sổ quanh mốc bị thiếu bằng cùng mô hình, không tải mô hình khác hoặc dùng dịch vụ tính phí.
- Các đề xuất và MP3 AI tạo đều **chưa duyệt**. Công cụ web cục bộ có nút **Nạp mốc AI đề xuất**; không ghi đè mốc người dùng đã lưu. Nghe duyệt trước khi gắn/đưa vào Kho bài. Chưa gắn tự động lên website đang có lỗi Browser Use.

## Cách chạy trên máy này

Máy đã có Python 3.13, thư viện nhận dạng và FFmpeg. Máy khác có thể tạo virtualenv riêng rồi cài `scripts/requirements-listening-ai.txt`; không cần gói trả phí.

Tại thư mục repository, thực hiện lần lượt:

```powershell
python scripts/download-listening-model.py

python scripts/transcribe-listening-local.py "D:\ENG\Upload-test\TEST 1.mp3" --output output/audio/ets-2022-test-1/transcript.json

node --experimental-strip-types scripts/propose-listening-segments.mts output/audio/ets-2022-test-1/transcript.json output/audio/ets-2022-test-1/ai-proposals.json

# Nếu còn mốc chưa nhận dạng: thử lại các vùng đó, rồi chạy lại bước đề xuất.
python scripts/transcribe-listening-local.py "D:\ENG\Upload-test\TEST 1.mp3" --output output/audio/ets-2022-test-1/transcript.json --repair-proposals output/audio/ets-2022-test-1/ai-proposals.json

node --experimental-strip-types scripts/propose-listening-segments.mts output/audio/ets-2022-test-1/transcript.json output/audio/ets-2022-test-1/ai-proposals.json

# Tạo MP3 nháp để nghe đối chiếu. Dùng một thư mục mới, không ghi đè clip đã có.
node --experimental-strip-types scripts/export-listening-drafts.mts "D:\ENG\Upload-test\TEST 1.mp3" output/audio/ets-2022-test-1/ai-proposals.json output/audio/ets-2022-test-1/ai-drafts

npm run audio:prepare -- "D:\ENG\Upload-test\TEST 1.mp3" "D:\code\Toeic\toeic-mini-trainer\output\audio\ets-2022-test-1"
```

Mở liên kết công cụ được in trong terminal trên máy đó → **Nạp mốc AI đề xuất** → chọn nhóm → **Nghe thử đoạn đã chọn**. Nhóm có mốc thiếu cần sửa/nhận dạng lại; không coi độ tin cậy từ ASR là bằng chứng nội dung đúng. Khi đã nghe đối chiếu, có thể xác nhận và xuất clip đã duyệt hoặc dùng MP3 nháp đã nghe kiểm tra để gắn vào nhóm đúng trên web. `draft-manifest.json` giữ nguồn, thời gian, SHA-256 của từng clip và `needsHumanReview: true`.

`Test/ai-audio/` chứa mô hình; `output/audio/` chứa transcript, đề xuất và clip. Cả hai đều được loại khỏi Git, EAS và Vercel. Downloader không thay file mô hình tồn tại khác checksum; cutter không ghi đè audio đã xuất.

## Kiểm chứng và giới hạn

Đã chạy nhận dạng toàn bộ `TEST 1.mp3` bằng CPU offline trên máy này. Đây là triển khai **công cụ quản trị cục bộ**, chưa phải worker AI trên server production. APK và DB/API không cần thay đổi để phát các MP3 riêng đã gắn theo nhóm.

Kiểm thử bao gồm: 54 nhóm/100 câu trên dữ liệu giả lập, ba câu chung audio, bỏ số lặp trong hướng dẫn, số bằng chữ/dải có dấu nối, mốc thiếu/trùng, nối các chunk chồng lấn, không tự phê duyệt, import AI đúng nguồn và giữ mốc người dùng, cắt đúng tín hiệu/độ dài, không ghi đè file, HTTP Range và quyền của công cụ cục bộ.

### Kết quả với file ETS thật

- Đã nhận dạng đầy đủ 2762,867567 giây (~46 phút 03 giây) bằng CPU, tái sử dụng checkpoint sau pilot. Lượt toàn bộ sau pilot mất khoảng **429 giây** trên máy này; các lượt thử lại vùng còn thiếu chạy thêm khoảng 140 giây. Đây là thời gian quan sát, không phải cam kết cho máy/file khác.
- Sau nhận dạng lại theo vùng: **54/54 mốc đề xuất, 0 nhóm thiếu mốc**. Không sử dụng mô hình/dịch vụ trả phí và không nhập mốc câu ETS bằng tay.
- Đã xuất **54 MP3 nháp** vào `output/audio/ets-2022-test-1/ai-drafts`: Part 1 = 6, Part 2 = 25, Part 3 = 13, Part 4 = 10. Mỗi đoạn đã được ffprobe kiểm tra độ dài và ghi SHA-256 vào manifest.
- **9/9 kiểm thử cục bộ đạt, không bỏ qua**; TypeScript repo và ESLint các file thay đổi đạt; hai script Python qua kiểm tra cú pháp. Model downloader chạy lại xác minh checksum và không tải lại file đã có.
- “Đủ mốc” chỉ là kiểm chứng cấu trúc kỹ thuật. Các clip vẫn mang `draft-` và `needsHumanReview: true`; chưa xác nhận nghe đủ toàn bộ 100 câu/nhóm, chưa upload hoặc xuất bản ETS.

AI có thể bỏ sót hoặc đọc sai số câu. Kết quả ASR/timestamp và clip nháp chưa thay thế việc nghe duyệt; chưa xác nhận playback thực tế trên Samsung S23 FE hoặc gắn clip vào bản nháp ETS trên production.

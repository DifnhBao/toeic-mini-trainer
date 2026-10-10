# Bảo vệ tác vụ OCR khi worker cũ trả muộn

Ngày 08/10/2026. Phát hiện khi rà cổng OPS-04, sau phép đo HTTP local. Đây là sửa tính đúng đắn khi timeout/retry; chưa phải nghiệm thu cron hoặc phục hồi hạ tầng thật.

## Lỗi và hành vi sau sửa

Worker cũ nhận job PENDING, chuyển PROCESSING rồi đọc PDF/gọi trích xuất. Nếu tác vụ bị timeout và retry trong lúc worker đó còn chạy, lượt mới có thể hoàn tất trước. Trước sửa, lưu kết quả chỉ lọc theo ID: kết quả cũ có thể ghi đè draft mới, thậm chí đổi job IMPORTED về COMPLETED. Nhánh lỗi và AI_BUSY chỉ lọc PROCESSING nên có thể đánh dấu FAILED, trả về PENDING hoặc giảm attemptCount của lượt mới. Ngoài ra, hàm worker chưa tự chặn job đã đủ ba lần thử.

Hàm worker hiện claim bằng cập nhật nguyên tử có trả lại `startedAt` và `attemptCount`. Chỉ job PENDING có attemptCount <3 được nhận. Đọc job và mọi cập nhật kết quả/lỗi/AI_BUSY đều phải còn khớp ID, PROCESSING, thời điểm bắt đầu và số lượt đã nhận. Nếu claim đã thay đổi, worker cũ không ghi nữa. GET trạng thái cũng chỉ đánh dấu timeout cho đúng snapshot đã quan sát, tránh làm hỏng lượt retry bắt đầu giữa lúc đọc và cập nhật.

Không thêm migration, khóa chạy dài hoặc thay giới hạn ba lần thử. Không thay lịch cron, quota AI hoặc giao thức APK. Kết quả draft đã được quản trị viên sửa/gắn media hoặc gửi/import không bị worker cũ ghi đè chỉ vì nó trả muộn.

## Bằng chứng PostgreSQL cục bộ

`tests/integration/ingestion-worker.test.ts` dùng DB loopback `toeic_release_test`, tài khoản/asset/job UUID riêng. Đọc tài liệu và trích xuất được điều khiển bằng promise với nội dung giả; không gửi PDF, gọi model hoặc R2. Timeout/retry được mô phỏng bằng đúng chuyển trạng thái trong DB, không chờ nhiều phút hoặc thực sự kill process cloud.

Năm regression đầu tiên đều thất bại trước sửa và đạt sau sửa:

1. Kết quả worker cũ không ghi đè kết quả của lượt mới đã hoàn tất.
2. Worker cũ không đổi IMPORTED về COMPLETED hoặc ghi đè dữ liệu đã nhập.
3. Lỗi worker cũ không đánh dấu FAILED cho lượt mới đang PROCESSING.
4. AI_BUSY của worker cũ không requeue hoặc giảm lượt thử của worker mới.
5. Job đủ ba lượt không đọc tài liệu hoặc chạy trích xuất thêm.

Kiểm thử thứ sáu giữ lại một snapshot GET thật trên PostgreSQL, bắt đầu retry rồi mới cho GET tiếp tục; snapshot cũ không đánh dấu timeout lượt mới. Auth và cập nhật DB thật vẫn chạy, chỉ tạm giữ thời điểm trả về của lần đọc đầu để tái hiện cuộc đua xác định.

Source bản vá: `f7bb8c2`. Kiểm tra đầy đủ: 156/156 unit, 35/35 integration (gồm sáu trường hợp trên), TypeScript và production build Next.js 16.3.8 Webpack/41 trang đạt; lint 0 lỗi, ba cảnh báo `<img>` cũ. Lượt unit đầu trong sandbox không đầy đủ do lỗi đọc module `tsx` (EPERM/ERR_MODULE_NOT_FOUND); lượt chạy lại hoàn chỉnh ngoài sandbox mới được dùng làm bằng chứng đạt. Không bỏ qua kết quả thất bại.

Fixture đã được dọn theo UUID; kiểm tra độc lập còn 0 user/asset mang dấu worker-race. Container test đã dừng. Log tái hiện trước/sau và kiểm tra đầy đủ được giữ trong `Test/`, không đưa lên Git.

## Rollout

- Deployment `dpl_EHWv17jLwEHm3cvmkpsLJqTKpbfS`, source `f7bb8c2`, READY; URL riêng: `https://toeic-mini-trainer-busrwiq8j-le-dinh-bao-s-projects.vercel.app`.
- Đã promote sang `https://toeic-mini-trainer.vercel.app`; inspect domain chính xác nhận đúng deployment ID ở trên và READY. 21/21 HTTP smoke đạt trước và sau promote, gồm GET trạng thái job và POST worker không xác thực trả 401. Bundle ADMIN thực tế vẫn có policy PDF 50 MiB, cảnh báo thiếu key và UI gắn ảnh/audio nhóm.
- Manifest 149 tệp, đủ 125 tệp app/types/prisma; không có env, tài liệu ETS, ảnh local, test, backup hoặc APK. Không migrate/seed, ghi dữ liệu học hoặc gọi AI để smoke.
- Truy vấn `SET TRANSACTION READ ONLY` trước promote đếm được 0 job PROCESSING tại thời điểm đọc, không đọc nội dung hoặc định danh. Đây là snapshot, không chứng minh cron hoạt động hoặc không có job mới trong khoảng rollout.
- Bản runtime trước: `0c21f9f`, deployment `dpl_4Jjpy2Lak7ZcTwrp4aboKtmh6aKf`, URL `https://toeic-mini-trainer-nawna5g5a-le-dinh-bao-s-projects.vercel.app`; có thể phục hồi deployment nhưng mở lại lỗi worker, áp dụng lưu ý rollback bên dưới.

Bằng chứng local: `Test/worker-race-before.txt`, `Test/worker-race-after.txt`, `Test/integration-worker-fencing.txt`, `Test/unit-worker-fencing-verified.txt`, `Test/typecheck-worker-fencing.txt`, `Test/lint-worker-fencing.txt`, `Test/build-worker-fencing.txt`. Bằng chứng cloud: manifest/deploy/inspect/promote và hai smoke mang hậu tố `f7bb8c2`, cùng `Test/vercel-worker-protected-bundle.json` và `Test/vercel-worker-canonical-bundle.json`. Smoke không đăng nhập chưa kiểm chứng OCR provider hoặc toàn bộ luồng quản trị trên deployment thật.

## Giới hạn và nghiệm thu còn lại

Đây là bảo vệ ghi dữ liệu sau khi mất claim; không bảo đảm provider chỉ được gọi đúng một lần khi invocation bị ngắt hoặc mất phản hồi. Quota/giới hạn đồng thời hiện có vẫn quản lý các lần gọi; retry có thể tiếp tục tốn lượt/chi phí. Không thể thu hồi một lời gọi provider đã gửi chỉ bằng điều kiện ghi DB.

OPS-04 vẫn cần kiểm chứng cron/secret trên hạ tầng, ngắt worker thật trong staging cách ly, quan sát requeue/giới hạn thử và thời gian phục hồi. Sweep hiện chạy mỗi giờ và chọn một job; không coi sửa này là bằng chứng phục hồi trong 10 phút hoặc xử lý hết backlog. OCR ETS thật, upload/gắn ảnh/audio, duyệt đáp án và Android vẫn là các cổng riêng.

Rollback về runtime trước sửa mở lại rủi ro trên; dừng nhận/retry OCR trong lúc rollback và ưu tiên bản sửa tiến tới nếu có job đang PROCESSING. Không tự cập nhật hàng loạt trạng thái job trên DB thật để thử nghiệm.

# Kiểm chứng GitHub và cổng merge — 09/10/2026

## Bằng chứng từ GitHub

Kết nối hiện tại xác thực là `DifnhBao`, đọc được repository private `DifnhBao/toeic-mini-trainer`; metadata trả quyền admin/maintain/push/pull. Kết quả này thay thế tình trạng connector 404/Unknown tool ở các lượt trước, không suy ra từ tên tài khoản chủ dự án nhập trong hội thoại.

[Release quality checks, run 37875985993](https://github.com/DifnhBao/toeic-mini-trainer/actions/runs/37875985993) đã `completed/success` trên commit `6ff0597f561d04f594ff85637d42cda469055763`, nhánh `codex/release-readiness`, sự kiện push. Đối chiếu riêng check-runs và từng bước job:

| Job | GitHub job ID | Kết quả và phạm vi |
| --- | --- | --- |
| web | 113644588175 | success; install, Prisma, hai cổng dependency, lint, TypeScript, unit và production build |
| integration | 113644587968 | success; PostgreSQL service, migration, integration và cleanup container |
| mobile | 113644588229 | success; install, TypeScript, Expo dependency check, dependency policy, Android export và bundle guard |

Cả ba check do GitHub Actions cung cấp, App ID `15368`. Đây là CI thật trên runner GitHub, độc lập với 209 unit/68 integration local. Export Android không chứng minh APK chạy trên điện thoại; provider dùng fixture không chứng minh AI/media thật.

Đã tạo [PR nháp #4](https://github.com/DifnhBao/toeic-mini-trainer/pull/4), head `codex/release-readiness`, base `master`; không yêu cầu reviewer, bật auto-merge hoặc merge. Lần đọc sau tạo xác nhận `draft=true`, `mergeable=true`; trạng thái tổng hợp vẫn phụ thuộc check/deployment của PR. Tạo PR kích hoạt một lượt CI riêng; kết quả push trên không thay thế kết quả PR mới.

Ở lượt kiểm tra tiếp theo, GitHub connector không còn trong danh sách công cụ. Công cụ CI của PR trả yêu cầu kết nối GitHub; tra cứu Plugin Management xác nhận plugin GitHub `installed=false`. Vì vậy chưa đọc được kết quả lượt riêng của PR. Kết quả push run phía trên vẫn là bằng chứng đã quan sát, không mở rộng sang commit mới hoặc lần chạy chưa đọc. Cần cài/kết nối lại plugin trước khi xác minh tiếp; không dùng CLI/browser khác để vượt quyết định Browser Use từ chối.

## Cron và readiness: bằng chứng có giới hạn

[Run schedule 37873245577](https://github.com/DifnhBao/toeic-mini-trainer/actions/runs/37873245577), tạo 02:09:46 UTC ngày 09/10, đã success. Job drain `113635848039` và bước `Call authenticated staging worker` đạt. Workflow thực trên master đọc secret, gọi GET readiness và POST worker; chỉ thành công khi hai HTTP response có trạng thái 2xx.

Điều này xác nhận một lượt gọi bằng secret cấu hình đã thành công. Secret URL không được đọc/hiển thị, nên chưa gắn bằng chứng đó với domain production hoặc deployment cụ thể. Script không ghi kết quả job sau OCR; success không chứng minh hoàn thành một job, provider thật hoặc xử lý hết backlog. Các run gần đây không chứng minh lịch đều mỗi giờ; cần đo thời gian phục hồi trên staging. Không đổi secret hoặc trigger thêm để thử trên DB thật.

## Bảo vệ master chưa được bật

Lần đọc metadata nhánh master trả `protected=false`, `protection.enabled=false`, required checks rỗng. Endpoint rulesets trả danh sách rỗng. Vì vậy CI xanh hiện chưa ngăn push/merge khi kiểm tra thất bại. Không đánh dấu cổng CI/vận hành đã đóng hoàn toàn.

Đã chuẩn bị payload [branch-protection-master.json](../.github/branch-protection-master.json), **chưa áp dụng**. Cấu hình yêu cầu PR, ba check web/integration/mobile từ GitHub Actions đạt, nhánh cập nhật với master, giải quyết hội thoại, áp dụng cả admin, chặn force push và xóa nhánh. Không yêu cầu người duyệt thứ hai trong payload ban đầu vì chưa có reviewer được chỉ định; cần chốt chính sách review khi bổ sung người phụ trách. Đây không phải chứng nhận đã được review độc lập.

Connector hiện có chức năng đọc bảo vệ nhánh nhưng không có thao tác ghi cấu hình này. Browser Use cho GitHub vẫn có quyết định từ chối trước đó; cần quyền mới hợp lệ hoặc chủ tài khoản tự áp dụng trong Settings → Branches → branch protection cho `master`. Khi dùng UI, chọn nguồn GitHub Actions cho từng check, bật Require pull request/Require status checks/Require branches up to date/Require conversation resolution/Do not allow bypassing; tắt force push/deletion. Nếu UI yêu cầu nâng gói, dừng để chủ tài khoản quyết định; không mua hoặc đổi visibility.

Theo [tài liệu bảo vệ nhánh GitHub](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/managing-a-branch-protection-rule), repository private cần gói hỗ trợ; không suy ra gói thanh toán từ quyền admin. Payload dùng [REST Update branch protection](https://docs.github.com/en/rest/branches/branch-protection#update-branch-protection); không chứa token và không phải script tự gửi request.

Sau áp dụng, đọc lại protection qua connector, đối chiếu checks/App ID/enforce_admins/force push/deletion và ghi bằng chứng. Chỉ khi đó mới đóng phần cấu hình bảo vệ nhánh; không tạo commit lỗi hoặc merge để thử vào master thật.

## Điều kiện tiếp theo

1. Đợi và kiểm tra CI của PR theo đúng head sau các commit tài liệu tiếp theo; giữ PR nháp khi nghiệm thu còn thiếu.
2. Bật/xác minh bảo vệ nhánh bằng quyền được phép; không dùng SSH push thành công thay bằng chứng.
3. Hoàn tất quyền Browser Use cho nghiệm thu web hoặc nhận biên bản thao tác từ chủ dự án. API live được xác minh gần nhất vẫn `ff80432`; chưa promote các sửa mới.
4. Nghiệm thu web ADMIN/người học, media có quyền sử dụng, APK `3cbde63` trên S23 FE và Android thứ hai; cấu hình cảnh báo/backup/ngân sách, rồi mới mở beta theo runbook.

## Cập nhật sau khi khôi phục kết nối

GitHub đã được cài/kết nối lại; đọc profile và repo xác nhận `DifnhBao` có quyền hợp lệ. Các mô tả mất kết nối ở trên là lịch sử, không còn là điều kiện chặn tại thời điểm cập nhật này.

Commit được đối chiếu là `f5fed440429163e4dbcf4401ab55693c44cbfb02` (head PR #4 tại thời điểm đọc). Hai run đều `completed/success` và từng bước job đã kiểm tra:

| Run | Sự kiện | web | integration | mobile |
| --- | --- | --- | --- | --- |
| [37877046329](https://github.com/DifnhBao/toeic-mini-trainer/actions/runs/37877046329) | pull_request | 113647919055 success | 113647918831 success | 113647919116 success |
| [37877041742](https://github.com/DifnhBao/toeic-mini-trainer/actions/runs/37877041742) | push | 113647905760 success | 113647905608 success | 113647905481 success |

PR vẫn `draft=true`, `merged=false`, `mergeable=true`; không merge, yêu cầu reviewer hoặc promote. Đọc lại master vẫn `protected=false`, required checks rỗng và rulesets rỗng. Cấu hình đề xuất vẫn chưa được áp dụng; Browser Use chưa có quyền mới để làm bước quản trị đó.

Đã đọc metadata bằng Vercel CLI (không HTTP smoke vào website hoặc chạy luồng quản trị): inventory gắn SHA `f5fed44` với URL `toeic-mini-trainer-laagf926a-le-dinh-bao-s-projects.vercel.app`; inspect URL xác nhận deployment `dpl_FBqNuqK4ioFJZTXKrQmkp3V7iHaT`, target preview, READY. Đây là preview được tích hợp GitHub tạo tự động từ lần push, không phải deploy/promote mới trong lượt kiểm tra này. Build READY không chứng minh cấu hình DB/secret preview độc lập, OAuth, UI, nội dung hoặc media đạt.

Inspect alias `toeic-mini-trainer.vercel.app` vẫn trả deployment `dpl_AByFEsgTytEtXqdCk63cXsQFUwA7`, target production, READY; inventory cùng URL deployment gắn SHA `ff804320de3b0c0e19a978e5442cc9f496edc6ef`. Chỉ đọc trạng thái Vercel, không thay alias/config/secret hoặc ghi DB/storage. Các cổng Browser Use, thiết bị và vận hành vẫn mở.

Log metadata giữ local trong `Test/vercel-current-release-state.txt`, `Test/vercel-inspect-preview-f5fed44.txt`, `Test/vercel-inspect-current-canonical.txt`; không commit log. Các kết quả CI trên chỉ chứng minh đúng SHA đã đọc; commit tài liệu tiếp theo có lượt CI riêng cần đối chiếu riêng trước merge.

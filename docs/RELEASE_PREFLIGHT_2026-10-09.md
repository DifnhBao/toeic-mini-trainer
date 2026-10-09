# Kiểm tra chỉ đọc trước nghiệm thu tài khoản thật

Ngày 09/10/2026. Source hai bản kiểm tra production vẫn pin `ffe179e`; source bổ sung nhãn ADMIN `28edcef` đã qua CI nhưng chưa chuyển domain hoặc tạo APK mới. Không đổi auth/Google config, domain, DB hoặc secret trong đợt kiểm tra này.

## Migration của Neon đang cấu hình trên máy — 22h30

Đọc `.env`/`.env.local` trong bộ nhớ để lấy DATABASE_URL đang cấu hình, chỉ chấp nhận Neon/TLS bắt buộc. Transaction `REPEATABLE READ READ ONLY`, query ledger `_prisma_migrations` và tổng số job theo trạng thái, rồi ROLLBACK/đóng kết nối; không migrate/seed hoặc in URL/credential.

Đối chiếu 11 migration trong Git source pin: **11/11 finished**, mỗi migration đúng một record active, checksum SHA-256 khớp chính xác Git bytes; không có migration ngoài source, unfinished hoặc lệch checksum. Có hỗ trợ nhận diện CRLF tương đương nhưng lượt này không cần nhánh đó. Proof `Test/release-db-preflight-20261009-proof.json`, lúc `2026-10-09T15:30:02.360Z`.

Aggregate ingestion: 6 COMPLETED, 7 FAILED, 5 IMPORTED; không có PENDING/PROCESSING ở snapshot này. Không suy ra invocation/AI cũ đã kết thúc hoặc worker được tạm dừng từ một snapshot DB. Ledger đạt không chứng minh từng object/schema chưa bị chỉnh ngoài migration. URL DB trên máy chưa được đối chiếu byte với biến Secret của deployment; readiness DB/R2 từ deployment là bằng chứng riêng. Driver hiện dùng kiểm chứng TLS chặt theo phiên bản pg đang cài; không làm yếu TLS để xử lý cảnh báo thay đổi ngữ nghĩa ở phiên bản tương lai.

## Google provider discovery — 22h30

GET `/api/auth/providers` qua Vercel CLI ở hai URL, không dùng session/token người học, không mở authorization flow hoặc import cookie:

| URL | HTTP/Google provider | Origin signin và callback |
| --- | --- | --- |
| Bản kiểm tra khóa riêng `toeic-mini-trainer-r36raf45w-le-dinh-bao-s-projects.vercel.app` | 200, có Google | `https://toeic-mini-trainer.vercel.app` |
| Domain chính `toeic-mini-trainer.vercel.app` | 200, có Google | Cùng domain chính |

Proof `Test/release-oauth-preflight-20261009-proof.json` chỉ lưu origin/kết quả, không raw header, cookie, client secret hoặc OAuth token. **Đăng nhập từ URL bản kiểm tra chưa chứng minh nghiệm thu runtime mới**: provider URLs đang trỏ domain chính bản cũ. Chưa chứng minh Google chấp nhận redirect của một URL staging mới hoặc login thành công. Cấu hình production dùng canonical không tự là lỗi; cần nghiệm thu bằng domain phù hợp/runtime được phép trước kết luận.

Hai hướng còn cần quyền riêng trước thực hiện: thiết lập địa chỉ staging/OAuth redirect hợp lệ và cấu hình URL auth của staging; hoặc rollout canonical có kiểm soát sau quiesce writer cũ rồi nghiệm thu tại canonical. Chưa tự đăng ký redirect Google, thêm alias, sửa Secret hoặc chuyển domain.

## Chuẩn bị kiểm tra worker với khóa đang lưu trong GitHub

Workflow existing `Drain pending ingestion jobs` trên nhánh release-readiness đã bổ sung chế độ **readiness-only**. Chạy thủ công mặc định chỉ GET readiness; script dừng trước POST worker. Chạy schedule vẫn drain như lịch cũ; lựa chọn drain thủ công là thao tác riêng có thể ghi trạng thái/counter và gọi provider. Master chưa nhận thay đổi này, không giả định Run workflow trên master là chỉ đọc.

Runner chỉ chấp nhận domain canonical hoặc deployment cùng project/team, đúng path drain, HTTPS và không có credentials/query/hash trong URL; khóa đủ 32 ký tự/không khoảng trắng. Readiness phải HTTP ok **và JSON ready=true**, không nhận trang HTML 200 làm chứng cứ. Từ response chỉ xuất mode, boolean target canonical, status, UUID request hợp lệ nếu có; không xuất URL bí mật/header/key/body thô. Drain được gọi tường minh mới xuất queued/paused, không in job/PDF/transcript. Giới hạn response 64 KiB, timeout, không redirect/retry. Không cài dependency hoặc tải khóa cloud về máy.

Local năm test qua fetch giả lập đã đạt: readiness-only đúng một GET/không POST; từ chối target/mode/key sai trước network; chặn body không-ready/HTML/lớn/401 trước drain; drain kiểm queued/paused/lọc dữ liệu; lỗi không lộ transport/parser và không retry. Không dùng Gemini/R2/DB thật trong các test. TypeScript/lint/CI cần đối chiếu kết quả riêng trước hướng dẫn chạy thật.

Khi source workflow đã qua CI và chủ dự án sẵn sàng: mở GitHub Actions → **Drain pending ingestion jobs** → Run workflow, **Branch = codex/release-readiness**, chọn **readiness-only** nếu hiện ô mode; nếu chỉ hiện Branch, code nhánh này vẫn mặc định readiness-only cho workflow_dispatch. Không chọn master vì code master vẫn POST worker. Kiểm tra đúng branch/SHA trong run mới, rồi gửi link run để đọc receipt. Chưa dispatch/rerun hoặc kiểm chứng chế độ này trên GitHub thật; chưa biết URL GitHub secret hiện trỏ canonical hay deployment khác.

## Điều kiện còn thiếu trước phát hành

- Readiness chỉ đọc với khóa GitHub hiện có và đối chiếu target; việc không còn file khóa trên máy chưa chứng minh khóa cloud hỏng hoặc cần xoay.
- Quiesce writer cũ/công tắc AI theo runbook; auth/session/đổi tài khoản/không lộ lời giải, scoring và nộp trùng bằng tài khoản thật trên runtime mới.
- Sau API được phát hành đúng phạm vi, tạo APK đúng source/API và nghiệm thu S23 FE/Android thứ hai. Chưa build APK chỉ vì bundle xanh.
- Nội dung có quyền chia sẻ, nhãn thật đủ độ phủ, backup định kỳ/ngoài máy/khóa, cảnh báo/ngân sách/người xử lý và beta vẫn mở. Audio tự chia vẫn tạm gác.

# Đánh giá tiến độ và kế hoạch đưa TOEIC Mini Trainer vào sử dụng

Ngày đánh giá: 08/10/2026. Phạm vi: mã nguồn và tài liệu trong workspace hiện tại, gồm cả thay đổi chưa commit. Hướng bàn giao đầu tiên: Android cho người học, web cho học và quản trị. Đây không phải biên bản nghiệm thu production.

## 1. Kết luận về tiến độ

Sản phẩm đã có vòng học chính: đăng nhập → tạo mini test → làm bài → chấm điểm → xem kết quả/lịch sử → chữa lỗi bằng AI. Đã mở rộng sang nhập tài liệu cá nhân, chia sẻ nội dung qua kiểm duyệt, phân quyền và quản trị.

- Nếu chỉ xét chức năng của MVP đầu tiên, ước lượng đã triển khai khoảng **75–85%**.
- Nếu xét điều kiện đưa ra sử dụng rộng rãi, ước lượng mức sẵn sàng khoảng **50–60%**. Phần còn lại tập trung vào nghiệm thu thiết bị, kiểm thử tích hợp, chất lượng dữ liệu, độ tin cậy, chi phí và vận hành.
- Đây là ước lượng kỹ thuật theo các nhóm yêu cầu, không phải phần trăm hoàn thành được tính từ backlog có trọng số. Repo chưa có tổng khối lượng và trạng thái nghiệm thu cập nhật đủ để tính một con số chính xác.
- Roadmap mobile có bảy nhóm; năm nhóm đầu đã có phần triển khai chính trong source. Nhóm offline/reliability mới có một phần; nhóm release readiness chưa có đủ bằng chứng hoàn tất. Có source không đồng nghĩa đã nghiệm thu.

Trạng thái phù hợp nhất: **MVP có chức năng khá đầy đủ, đang chuẩn bị hoàn thiện và nghiệm thu cho beta có kiểm soát**. Chưa đủ bằng chứng để khẳng định bản hiện tại sẵn sàng mở rộng công khai.

## 2. Các chức năng hiện có

| Nhóm | Đã có trong source | Giới hạn/cần xác minh |
| --- | --- | --- |
| Tài khoản | Google trên web; Google native trên Android; API Google/Apple; JWT ngắn hạn, refresh token xoay vòng, lưu token bằng SecureStore; khóa tài khoản | Chưa nghiệm thu APK mới và iPhone trong lượt đánh giá; chính sách liên kết Google/Apple cần test riêng |
| Tạo bài | 5–50 câu; tổng hợp, Listening, Reading, Part 1–7; dùng câu riêng của người học và câu chung phù hợp | Cách lấy câu còn nạp toàn bộ tập ứng viên; web và mobile chưa đồng nhất validation và thuật toán chọn câu |
| Làm bài | Timer, điều hướng từng câu, audio, ảnh, đoạn đọc, bản nháp trên thiết bị | Chưa có offline đầy đủ, cache media và hàng đợi đồng bộ; lưu nháp không đồng nghĩa làm bài hoàn toàn không cần mạng |
| Chấm/chữa bài | Chấm trên server, kết quả từng câu, lịch sử, tỷ lệ đúng theo Part | Mobile có chống nộp trùng bằng clientSubmissionId; API web chưa có cơ chế tương đương |
| AI | AI Coach; giải thích câu sai; cache chung theo câu/phiên bản; API ẩn lời giải; quota ngày lưu trong DB | Quota số lượt chưa phải trần ngân sách toàn hệ thống; cần nghiệm thu chất lượng lời giải và hành vi khi lỗi provider |
| Học thử | Luồng guest trên mobile/API; chỉ dùng câu PUBLISHED; tối đa ba bài/ngày; không lưu lịch sử, không phát sinh lời gọi AI mới | Cần kho câu đã xuất bản đủ dùng và kiểm thử hạn mức qua proxy thật |
| Tài liệu | Upload PDF/audio riêng tư trên S3-compatible storage; xác minh file; signed URL; job có trạng thái, retry, chống import trùng; import JSON | Có bằng chứng E2E local cũ; chưa nghiệm thu toàn bộ phiên bản hiện tại trên staging/APK |
| PDF scan/dài | Chọn khoảng tối đa bốn trang; PDF không có text được chuyển sang đọc ảnh bằng Gemini; lỗi vượt giới hạn được báo rõ | Đã có xử lý scan trong source, chưa xác minh chất lượng OCR thật của bản mới; chưa xử lý tự động cả tài liệu dài; chưa tách audio/timestamp |
| Duyệt câu hỏi | Web sửa Part, câu, lựa chọn và đáp án; duyệt/bỏ từng câu trước khi nhập; mobile có cùng luồng và tự lưu nháp/khôi phục tác vụ | Phần mobile ngày 01/10 còn nằm trong working tree, chưa commit và chưa nghiệm thu thiết bị; nháp không đồng bộ giữa các máy |
| Kho chung | Gửi bộ câu hỏi có xác nhận quyền chia sẻ; reviewer/admin duyệt hoặc từ chối; tách PRIVATE/LEGACY/PUBLISHED/ARCHIVED; chia sẻ audio | Chưa có vòng sửa/gửi lại đóng góp bị từ chối, editor sửa câu đã xuất bản hoặc dọn đầy đủ media mồ côi |
| Quản trị | Dashboard web, user, vai trò/trạng thái, đóng góp, nguồn PDF/audio, job, câu hỏi và audit có lý do | Các trang web quản trị yêu cầu ADMIN; REVIEWER có API/quyền duyệt và luồng mobile. Chưa có quản trị hàng loạt hoàn chỉnh |
| Vận hành | Readiness endpoint kiểm tra DB/storage; worker có secret, cron GitHub Actions; migration và profile EAS | Workflow hiện có là worker, chưa thấy CI kiểm tra chất lượng PR; chưa xác minh hoạt động cron, backup, cảnh báo, deployment và ngân sách hiện tại |

## 3. Bằng chứng và độ tin cậy

### Kiểm tra chạy lại ngày 08/10/2026

- `npm test`: **68/68 đạt**, không skip.
- `npx tsc --noEmit`: root đạt.
- `npx tsc --noEmit -p mobile`: mobile đạt.
- `npm run lint`: đạt, không có lỗi; ba cảnh báo `<img>` trên web.
- `npm run build`: **không đạt trong lượt kiểm tra hiện tại**, lặp lại cùng lỗi cả trong và ngoài sandbox. Turbopack dừng ở xử lý `app/globals.css`: tiến trình Node con thoát trước khi kết nối được. Chưa xác định nguyên nhân gốc; không kết luận là lỗi ứng dụng hay chỉ do sandbox. Cần giải quyết và build lại trước rollout.

Các test bao phủ policy quyền/guest, upload/import, review từng câu, nháp mobile, chống import trùng, hồi phục poll, PDF page selection, HTML và seed guard. Test route review dùng database giả lập. **68 test đạt không chứng minh toàn bộ phân quyền, scoring, token rotation, Neon/R2 và APK đã được kiểm thử đầu cuối.**

### Bằng chứng cũ có thể tham khảo

- `PROGRESS_LOG.md` ghi E2E ngày 26/09: PDF/audio → R2 → AI → import → tạo/nộp bài, bao gồm import lặp không nhân đôi và kiểm tra media.
- `STAGING_QA_2026-09-28.md` ghi staging từng trả 200 ở trang chủ và 401 ở một số API khi chưa đăng nhập. Đây là smoke test cũ, không xác nhận deployment đang chạy source hiện tại.
- `MOBILE_QUESTION_REVIEW.md` ghi kiểm chứng local ngày 01/10 và nói rõ chưa nghiệm thu điện thoại/staging.
- HEAD hiện tại: `5e0ebc8`, merge quản trị ngày 29/09; working tree có thay đổi mobile review/API liên quan chưa commit.
- `mobile/eas.json` đã có API HTTPS cho profile preview. Không nên tiếp tục dùng kết luận cũ rằng dự án chưa có remote hoặc chưa cấu hình URL preview.

Lượt này không truy cập dashboard cloud, database thật, thiết bị hay build EAS. Chưa xác nhận số user/câu/attempt hiện tại, migration đã áp dụng trên môi trường đích, APK đã phân phối, cron đang chạy hoặc chi phí thực tế. Không dùng số dữ liệu ngày 27/09 làm số hiện tại.

## 4. Những việc còn thiếu để sử dụng thực tế

### Bắt buộc trước beta có người ngoài nhóm phát triển

0. Khôi phục production build tái lập. Build cũ đạt ngày 01/10 không thay thế kết quả hiện tại.
1. Chốt phiên bản API và APK, đưa bản mobile review lên staging theo thứ tự API trước mobile; kiểm tra `reviewProtocol = 1`.
2. Nghiệm thu Google native và vòng học trên Android thật qua 4G khi máy tính/Metro tắt.
3. Test hai tài khoản với database/storage test thật: bài, kết quả, lời giải cache, tài liệu, job, import và quyền quản trị.
4. Kiểm thử mất mạng khi refresh, polling và nộp bài; đóng/mở hoặc cưỡng bức dừng app lúc lưu nháp; thử lại không tạo dữ liệu trùng.
5. Có bộ câu hỏi đã kiểm duyệt đủ trải nghiệm; guest không phụ thuộc LEGACY chưa duyệt.
6. Có backup và restore đã thực hành, người chịu trách nhiệm, giám sát tối thiểu, hạn mức AI và cách tắt nhanh tác vụ có phí.

### Bắt buộc trước phát hành rộng

1. Rate limit dùng kho chung giữa nhiều instance, khóa theo user không bị nhân hạn mức bằng đổi header IP; bảo vệ guest qua proxy thật.
2. Trần ngân sách AI toàn hệ thống, giới hạn đồng thời, theo dõi usage/chi phí và cảnh báo; quota ngày hiện có tiếp tục được giữ.
3. CI cho root/mobile, test tích hợp auth/scoring/ownership, build và migration; xử lý hoặc ghi quyết định đối với dependency audit hiện hành.
4. Đồng nhất nộp bài web/mobile, chống nộp trùng và từ chối câu ngoài bài; tối ưu sinh bài/thống kê và đo tải.
5. Quy trình phục hồi job và rollout/rollback; worker bền vững trước mở rộng nếu đo thực tế cho thấy timeout/recovery không đạt yêu cầu. `after()` vẫn chịu giới hạn thời gian route.
6. Quản lý chất lượng câu hỏi, quyền dùng nội dung, chỉnh sửa có version, thu hồi nội dung và dọn file không còn tham chiếu.
7. Quy trình xóa tài khoản/dữ liệu, thời hạn lưu, quyền riêng tư, hỗ trợ và quản lý phiên bản APK tối thiểu. Loại bỏ đường APK cũ import không body sau thời gian chuyển đổi.

### Có thể làm sau bản đầu tiên

- Skill tags thành luồng sản phẩm hoàn chỉnh; hiện mới có mô hình dữ liệu, chưa có dashboard điểm yếu theo chủ điểm.
- Luyện lại câu sai theo lịch, mục tiêu tuần, streak và nhắc học.
- Offline cả bài/media và đồng bộ nhiều thiết bị.
- iOS nghiệm thu riêng, tách audio/transcript có timestamp, xử lý hàng loạt tài liệu dài.
- Bài thi 200 câu/điểm quy đổi, thanh toán/subscription nếu định hướng sản phẩm cần. Chưa có các chức năng này; điểm hiện tại là số câu đúng/tỷ lệ đúng.

## 5. Kế hoạch triển khai theo giai đoạn

Giả định một lập trình viên làm tập trung, chủ dự án cung cấp thiết bị/tài khoản hạ tầng và cùng nghiệm thu; có người kiểm duyệt nội dung. Mốc thời gian tính từ lúc bắt đầu thực hiện, chưa phải lịch cam kết. Tổng khoảng **6–8 tuần**, có thể kéo dài nếu thiếu thiết bị, nội dung, quyền cloud hoặc phát sinh lỗi nền tảng. Công việc kiểm duyệt nội dung có thể chạy song song từ tuần đầu.

### Giai đoạn 0 — Chốt baseline và backlog (2–3 ngày)

| Mã | Công việc | Phụ trách | Đầu ra/điều kiện đạt |
| --- | --- | --- | --- |
| BUILD-01 | Chẩn đoán lỗi Turbopack/CSS/tiến trình Node của build ngày 08/10; sửa nguyên nhân hoặc chọn cấu hình build được kiểm chứng | Dev | Production build chuẩn chạy thành công từ checkout sạch; smoke test artifact tạo ra. Đây là điều kiện chặn deploy |
| BASE-01 | Rà diff mobile review và API; tách commit/PR; ghi phiên bản và kết quả kiểm chứng | Dev | Bản thay đổi tái lập từ Git, không chứa secret/tài liệu cá nhân |
| BASE-02 | Kiểm kê staging deployment SHA, migration, EAS build, OAuth signing/package, bucket/cron | Dev + chủ dự án | Một bảng version của API/APK/schema và kết quả kiểm tra dịch vụ |
| BASE-03 | Hợp nhất trạng thái task từ tài liệu cũ; chốt Android + web và nhóm beta | Chủ dự án + Dev | Backlog có người phụ trách, ưu tiên, trạng thái và tiêu chí nghiệm thu |

**Ra mốc:** biết chính xác source nào sẽ phát hành và khác deployment hiện tại ở đâu; không đánh dấu task đã xong chỉ vì có source.

### Giai đoạn 1 — Tích hợp và nghiệm thu bản Android độc lập (tuần 1)

| Mã | Công việc | Phụ trách | Đầu ra/điều kiện đạt |
| --- | --- | --- | --- |
| E2E-01 | Đối chiếu schema/backup trước rollout; deploy API review trước app | Dev | API trả protocol mới, lỗi không đăng nhập đúng; chỉ áp dụng migration còn thiếu đã review. Bản mobile review tự nó không cần migration mới |
| E2E-02 | Build APK preview từ commit chốt; xác minh OAuth theo đúng chứng chỉ APK | Dev + chủ dự án | Cài và Google Login được trên ít nhất hai thiết bị Android |
| E2E-03 | Làm bài, audio/ảnh/passage, nộp, kết quả, lịch sử, AI, logout/relogin | QA/chủ dự án | Luồng hoàn chỉnh chạy qua Wi-Fi/4G khi Metro tắt; không mất phiên hoặc kết quả |
| E2E-04 | PDF chữ/scan, trang 1–4 và khoảng tiếp theo, sửa/bỏ câu, import riêng/đóng góp | Dev + QA | Lưu đúng câu đã duyệt, không lặp; PDF nguồn không công khai; bản đóng góp đúng nội dung đã sửa |
| E2E-05 | MR-01…MR-14, mất mạng/đóng app/storage đầy và hai tài khoản | QA/chủ dự án | Có biên bản theo build SHA; không nhầm nháp/tài liệu giữa tài khoản; không lưu thô khi API cũ |

**Ra mốc:** APK dùng độc lập được, không còn lỗi chặn đăng nhập/làm/nộp/khôi phục/dữ liệu riêng tư. Chưa mở công khai.

### Giai đoạn 2 — Độ tin cậy, bảo mật và vận hành (tuần 2–3)

| Mã | Công việc | Phụ trách | Đầu ra/điều kiện đạt |
| --- | --- | --- | --- |
| SAFE-01 | Test tích hợp bằng PostgreSQL test: scoring, câu lạ, không lộ đáp án, hai user, token hết hạn/reuse/logout, linking provider | Dev | Test chạy với dữ liệu cách ly; không tác động DB thật; thất bại khi cố truy dữ liệu người khác |
| SAFE-02 | Đưa web submit về cơ chế chống trùng tương đương mobile; validation sinh bài/nộp bài thống nhất | Dev | Retry cùng lần nộp chỉ tạo một attempt; câu ngoài bài bị từ chối trên cả hai client |
| SAFE-03 | Kho rate limit chung; trần lượt/đồng thời/ngân sách AI toàn app; kiểm thử concurrency cache | Dev + chủ dự án | Hai instance dùng một hạn mức; lỗi limiter/quota có hành vi xác định; vượt trần không gọi model |
| OPS-01 | CI test/typecheck/lint/build root và mobile; kiểm tra dependency audit mới | Dev | PR làm hỏng test/build bị chặn; cảnh báo mức cao có xử lý hoặc quyết định có căn cứ |
| OPS-02 | Backup DB/media, thử restore; lifecycle pending; dọn object mồ côi | Dev + vận hành | Restore thành công trên môi trường cách ly; mục tiêu đề xuất RPO ≤24 giờ, RTO ≤4 giờ |
| OPS-03 | Metric/cảnh báo API 5xx, job quá hạn, upload/AI lỗi, usage; runbook tắt AI, retry, rollback | Dev + vận hành | Thử gây lỗi staging và nhận cảnh báo; có người nhận và thực hiện phục hồi |
| OPS-04 | Đo job/cron/timeout; hoàn thiện cơ chế recovery hoặc tách queue/worker nếu cần | Dev | Job bị ngắt phục hồi được trong thời gian đã thống nhất; không import/thu phí lặp ngoài dự kiến |

**Ra mốc:** không còn lỗi nghiêm trọng về dữ liệu/phân quyền; có giới hạn chi phí, CI, phục hồi và người vận hành. Có thể bắt đầu beta được mời sau khi dữ liệu giai đoạn 3 sẵn sàng.

### Giai đoạn 3 — Chất lượng bộ đề và trải nghiệm (tuần 4)

| Mã | Công việc | Phụ trách | Đầu ra/điều kiện đạt |
| --- | --- | --- | --- |
| CONTENT-01 | Chuẩn bị kho chung có quyền dùng, review đáp án/media/group; kiểm kê theo Part | Người kiểm duyệt + chủ dự án | Mục tiêu beta đề xuất 300–500 câu đã duyệt; mỗi Part được bật có đủ câu và media. Nếu thiếu, giới hạn phạm vi rõ trong UI |
| CONTENT-02 | Test bộ mẫu PDF chữ/scan đa dạng; thống kê lỗi trích xuất, đáp án thiếu/trùng | Dev + reviewer | Có báo cáo độ chính xác; mọi câu chưa duyệt bị chặn; không tuyên bố độ chính xác OCR chưa đo |
| CONTENT-03 | Vòng sửa/gửi lại đóng góp bị từ chối; chuẩn bị editor/version câu chung và thu hồi media | Dev + reviewer | Không buộc upload/AI lại chỉ vì cần sửa câu; chỉnh câu đã xuất bản tăng contentRevision và xử lý cache cũ |
| UX-01 | Rà lỗi/loading/rỗng, bàn phím native, audio nền/URL hết hạn, tiếp tục nháp, kho không đủ câu | Dev + QA | Hành động tiếp tục/thử lại rõ; dữ liệu không mất; ít nhất hai thiết bị đạt |
| PERF-01 | Giới hạn truy vấn, phân trang/thống kê DB, chọn câu công bằng; chốt quy tắc giữ nhóm và thứ tự câu | Dev | Bài không lặp câu hoặc mất ngữ cảnh; báo cáo tải với 10.000 câu/1.000 attempt mỗi user/20 user đồng thời; p95 API đọc đề xuất <2 giây |

**Ra mốc:** trải nghiệm học có dữ liệu đủ chất lượng, thao tác được trên điện thoại và đáp ứng tải beta đã thống nhất.

### Giai đoạn 4 — Beta với 10–20 người học (tuần 5–6)

1. Mời nhóm nhỏ; cung cấp bản APK cố định, hướng dẫn và một kênh phản hồi.
2. Theo dõi hai tuần: tạo → nộp bài, lỗi đăng nhập/audio/upload, nháp phục hồi, số phiên hoàn thành, sử dụng AI và chi phí.
3. Phân loại lỗi: P0 mất/lộ dữ liệu hoặc không thể học; P1 luồng chính không ổn định; P2 tiện ích/hiển thị. Sửa và kiểm thử lại trước mở thêm user.
4. Mỗi tuần đối chiếu số liệu server với biên bản người thử; cập nhật backlog và quyết định phạm vi bản phát hành.

**Ngưỡng ra mốc đề xuất, cần chốt trước beta:** không còn P0/P1; không mất/lộ dữ liệu; không nộp/import trùng trong kịch bản retry; ≥95% hành trình kiểm thử chính thành công; số phiên app không crash ≥99% nếu đã có đo; chi phí nằm trong trần. Theo dõi tỷ lệ tự nguyện hoàn thành bài và quay lại học, chưa coi các tỷ lệ đó là SLA khi mẫu nhỏ.

### Giai đoạn 5 — Phát hành bản đầu tiên (tuần 7, dự phòng tuần 8)

1. Chốt xóa tài khoản/dữ liệu, quyền riêng tư, quyền dùng bộ đề, hỗ trợ, signing và version tối thiểu; kiểm chứng OAuth của bản phát hành.
2. Chọn kênh phân phối phù hợp: web/Android có kiểm soát trước; hồ sơ Google Play và kiểm thử App Signing là bước riêng nếu đưa lên store.
3. Deploy từ bản đã qua beta, có backup và rollback; mở user theo đợt thay vì tăng đột ngột.
4. Theo dõi hằng ngày tuần đầu: uptime, 5xx, job pending/failed, quota, chi phí, phản hồi và tỷ lệ hoàn thành.

**Ra mốc:** người mới tự vào học được; có nội dung, hỗ trợ, đo lỗi, backup và ngân sách; đội vận hành xử lý sự cố được. Phát hành rộng chỉ diễn ra sau khi các điều kiện trên đạt.

## 6. Thứ tự công việc nên bắt đầu ngay

1. **BUILD-01 + BASE-01/02:** giải quyết build hiện tại, chốt mobile review đang chưa commit và đối chiếu API/APK/schema hiện tại.
2. **E2E-01…05:** cập nhật staging, APK và nghiệm thu MR-01…MR-14 cùng vòng học 4G.
3. **SAFE-01/02:** test tích hợp phân quyền/scoring/auth và chống nộp trùng web.
4. **SAFE-03, OPS-01…03:** giới hạn chung/chi phí, CI, backup/restore, cảnh báo.
5. **CONTENT-01:** chuẩn bị nội dung beta song song; sau đó beta 10–20 người rồi mới phát hành rộng.

Không ưu tiên thêm iOS, thanh toán hoặc nhiều tính năng AI trước khi vòng học hiện tại được nghiệm thu và vận hành ổn định. iOS có source nền, nhưng cần nhánh cấu hình/thiết bị/phát hành riêng; không tính là đã hoàn tất vì Android chạy được.

## 7. Nguồn đối chiếu trong repo

- `README.md`, `docs/PRODUCT_BLUEPRINT.md`, `docs/MOBILE_ROADMAP.md`.
- `docs/PROGRESS_LOG.md`, `docs/IMPLEMENTATION_STATUS_2026-09-27.md`, `docs/STAGING_QA_2026-09-28.md`.
- `docs/SHARED_CONTRIBUTIONS.md`, `docs/PDF_INGESTION_RELIABILITY.md`, `docs/MOBILE_QUESTION_REVIEW.md`.
- `docs/RELEASE_READINESS_PLAN.md`: giữ làm tham chiếu task và tiêu chí cũ; không coi mọi checkbox chưa đánh dấu là chức năng chưa có.
- `prisma/schema.prisma`, migrations, API web/v1, thư viện auth/storage/review/rate-limit/AI, giao diện web/mobile, `tests/`, `mobile/eas.json`, `.github/workflows/ingestion-worker.yml`.
- Tài liệu Next.js cài tại `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md`: xử lý sau response vẫn nằm trong giới hạn thời gian của route/platform.

## 8. Ghi chú kiểm chứng cuối

Production build thử hai lần (trong sandbox và ngoài sandbox) đều không đạt với cùng lỗi nội bộ Turbopack/Node khi xử lý CSS. Chưa sửa source hay đổi bundler trong lượt đánh giá; BUILD-01 được đưa vào đầu backlog. Test 68/68, typecheck hai ứng dụng và lint đạt như mục 3. Chưa chạy lại Expo export hoặc dependency audit trong lượt này; kết quả cũ chỉ là tham chiếu.

Chỉ thêm tài liệu đánh giá này; không thực hiện commit/push, migration, seed, cloud deployment hoặc gọi AI có phí trong lượt đánh giá này.

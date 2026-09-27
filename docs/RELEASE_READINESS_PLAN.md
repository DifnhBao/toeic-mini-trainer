# Kế hoạch khắc phục và đưa TOEIC Mini Trainer vào sử dụng

Trạng thái: bản thiết kế triển khai, lập ngày 27/09/2026. Phạm vi đầu tiên là Android. Tài liệu này mô tả công việc cần làm và cách nghiệm thu; chưa thay đổi hành vi của ứng dụng.

> **Quy ước đánh dấu nguồn (ZCode, 27/09/2026):** nội dung gốc do Codex soạn. Sau buổi xác minh độc lập cùng ngày, ZCode bổ sung và đánh dấu như sau: bốn task mới có nhãn "[ZCode bổ sung]" ở tiêu đề (DATA-02, SEC-05, ING-04, PERF-02); các khối trích dẫn "Ghi chú xác minh (ZCode, 27/09/2026)" chèn vào task cũ; đoạn bổ sung điều kiện mốc ở mục 3; phụ lục mục 7. Mọi khối `>` có chữ ZCode là của ZCode. Phần còn lại — kể cả những câu ZCode thấy mô tả hiện trạng chưa chính xác — giữ nguyên văn của Codex, chỉ kèm ghi chú sửa sai bên dưới, không sửa trực tiếp.

## 1. Mục tiêu và ranh giới

- Mục tiêu G1: cài Development Build trên Android thật, đăng nhập Google, làm và nộp một bài, mở lại kết quả bằng backend thử nghiệm.
- Mục tiêu G2: cài APK preview và dùng trên 4G khi máy tính/Metro đã tắt, với API HTTPS và dữ liệu tách theo tài khoản. Nhóm thử nghiệm có thể nhập và kiểm duyệt tài liệu.
- Mục tiêu G3: phát hành cho người dùng rộng hơn sau khi có giới hạn chi phí, giám sát, khôi phục dữ liệu, kiểm thử tự động và kiểm thử tải.
- iOS, OCR PDF scan, luyện lặp lại câu sai và phát hành lên store là các nhánh riêng. Không dùng việc hoàn tất G1 Android để tuyên bố iOS hoặc bản store đã sẵn sàng.

Kiến trúc giữ lại Next.js API, PostgreSQL/Prisma và bucket private. Luồng đăng nhập Android mục tiêu:

    Google Sign-In native trên Android
      -> ID token có audience là Web OAuth Client của ứng dụng mobile
      -> POST /api/v1/auth/google
      -> xác minh chữ ký, issuer, expiry, audience, sub, email
      -> tài khoản + phiên mobile trong PostgreSQL
      -> access token ngắn hạn và refresh token xoay vòng

Lỗi quan sát được là trang Google trên điện thoại trả `400: invalid_request`. Mã Android hiện dùng `expo-auth-session/providers/google`; việc thư viện tạo redirect bằng custom URI scheme là nguyên nhân phù hợp nhất với lỗi và với chính sách Google hiện hành, nhưng chưa có bản ghi URL OAuth thực tế từ APK để khẳng định tuyệt đối. AUTH-01 phải xác nhận redirect trong yêu cầu lỗi. Lỗi xảy ra trước khi backend cấp phiên; chỉ thêm Client ID vào `.env` mà giữ nguyên luồng redirect không đủ để khắc phục. Bản production cũng không thể dùng API `http://<IP-LAN>` hiện tại, nên phải tách mốc sửa đăng nhập trên Development Build (G1) và mốc APK độc lập với HTTPS (G2).

Thư viện ưu tiên cho Android là react-native-nitro-google-signin qua Credential Manager. AUTH-02 phải xác nhận phiên bản cụ thể tương thích Expo SDK 57/React Native 0.86 trước khi tích hợp. Nếu kiểm thử tương thích thất bại, chọn thư viện native khác được Expo hỗ trợ và ghi rõ lý do. Việc thêm native module bắt buộc tạo APK mới.

## 2. Điểm xuất phát đã xác minh

| Hạng mục | Hiện trạng | Giới hạn của bằng chứng |
| --- | --- | --- |
| Backend | npm run build và TypeScript đạt | Build không chứng minh API hoạt động trên điện thoại |
| Mobile | TypeScript và xuất bundle Android đạt | Chưa chứng minh APK/native Google Login hoạt động |
| Database | Kết nối được, 6 migration đã áp dụng; 2 user, 72 question, 7 attempt | Không phải kiểm thử backup hoặc hiệu năng |
| Object storage | HeadBucket thành công | Chưa kiểm thử upload/đọc file từ preview APK |
| Tác vụ tài liệu | 7 job: 3 thất bại, 3 imported, 1 completed | 3 lỗi có thể đến từ tài liệu thử nghiệm |
| Test/lint | 11/11 test đạt; root lint còn 11 lỗi | Test mới bao phủ import schema và upload policy |
| Cấu hình | Android OAuth ID của mobile/backend khớp; mobile Web ID trống; API mobile là HTTP LAN | Chưa xác minh Google Cloud, EAS environment từ xa hoặc chứng chỉ APK đang cài |
| Git | Có thay đổi chưa commit, gồm mobile/eas.json chưa được theo dõi | Phải review và đưa cấu hình cần thiết vào commit trước build tái lập |

Không chạy prisma/seed.ts trên database hiện tại: script đang xóa đề/câu hỏi và quan hệ có thể xóa dây chuyền lịch sử học.

## 3. Mốc bàn giao và thứ tự phụ thuộc

| Mốc | Task bắt buộc | Điều kiện ra mốc |
| --- | --- | --- |
| G0 — an toàn dữ liệu | SEC-01, SEC-02, DATA-01 và các test tương ứng trong QA-01 | Hai tài khoản không xem được dữ liệu của nhau; HTML tài liệu không chạy script; seed không thể xóa dữ liệu thật |
| G1 — Android Development Build | AUTH-01 → AUTH-02 + AUTH-03 → AUTH-04; G0; hoàn tất QA-01 | Đăng nhập, làm bài, nộp, xem lịch sử, logout/relogin trên điện thoại thật |
| G2 — APK preview dùng độc lập | G1; DEP-01 → DEP-02 → QA-02; MOB-01, MOB-02, ING-01 → ING-02 → ING-03; OPS-01 | APK chạy trên 4G, không cần Metro; upload/nhập tài liệu và khôi phục lỗi đã được kiểm chứng |
| G3 — mở rộng người dùng | G2; SEC-03, SEC-04, QA-03, OPS-02, PERF-01, REL-01 | CI xanh, chi phí có trần, có cảnh báo/backup, tải dự kiến đạt mục tiêu, chính sách phát hành hoàn tất |

G0 và AUTH-01 có thể làm song song. AUTH-02 và AUTH-03 phải phát hành cùng nhau vì audience của ID token thay đổi. Nếu nhóm thử nghiệm G1 chưa dùng chức năng nhập PDF, ING-01 đến ING-03 có thể làm sau G1 nhưng phải xong trước G2.
Trước khi hoàn tất SEC-03, G1/G2 chỉ dành cho nhóm thử nghiệm được mời; đặt giới hạn chi phí tạm thời tại nhà cung cấp AI và giám sát thủ công. Không mở đăng ký công khai chỉ vì APK preview đã chạy.

> **[ZCode bổ sung 27/09/2026]** Điều kiện mốc bổ sung cho các task mới ở mục 4: DATA-02 và ING-04 chặn G2; SEC-05 và PERF-02 chặn G3 (làm cùng PERF-01).

## 4. Backlog chi tiết

### AUTH-01 — Chốt danh tính Android và OAuth Client

Ưu tiên P0. Phụ thuộc: không. Liên quan mobile/app.json, mobile/eas.json và cấu hình Google Cloud.

Thực hiện:

- Ghi lại package thực tế của APK đang cài và SHA-1 của đúng chứng chỉ ký APK đó. Không dùng lại một SHA-1 từ hội thoại nếu chưa đối chiếu với build.
- Ghi lại `client_id`, loại client và `redirect_uri` của yêu cầu đang trả `invalid_request` (không ghi token); xác định lỗi custom scheme hay một sai lệch cấu hình khác trước khi kết luận nguyên nhân cuối cùng.
- Trong cùng Google Cloud project, xác nhận Android OAuth Client khớp package + SHA-1 và có Web OAuth Client dành cho ID token mobile. Có thể tái dùng Web Client hiện tại chỉ sau khi xác nhận đúng loại và đúng project; nếu không, tạo Client riêng.
- Cấu hình màn hình đồng ý OAuth và tài khoản Test users. Ghi lại ID cấu hình, build profile và môi trường; không ghi client secret vào mobile.

Tiêu chí nghiệm thu:

- [ ] Bảng cấu hình nội bộ có package, build ID, SHA-1, Android Client ID, Web Client ID và Google Cloud project; các giá trị khớp build đang thử.
- [ ] Có bằng chứng về `redirect_uri`/mã lỗi của luồng cũ; nguyên nhân 400 được xác nhận hoặc cập nhật thành giả thuyết khác có căn cứ.
- [ ] Tài khoản thử nghiệm nằm trong Test users khi ứng dụng ở chế độ Testing.
- [ ] Web Client ID là loại Web application; Android Client là loại Android, cùng Google Cloud project.
- [ ] Không có client secret hoặc khóa riêng trong mobile/.env.example, app.json hay bundle.

### AUTH-02 — Thay luồng đăng nhập bằng Google Sign-In native

Ưu tiên P0. Phụ thuộc: AUTH-01. Liên quan mobile/src/app/sign-in.tsx, mobile/package.json, mobile/app.json.

Thực hiện:

- Xác nhận thư viện native tương thích SDK 57 và thêm config plugin. Loại bỏ việc dùng expo-auth-session/providers/google trên Android.
- Cấu hình thư viện bằng EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID, lấy ID token và truyền cho signInWithGoogle() hiện có; giữ logic phiên mobile phía AuthProvider.
- Hiển thị riêng trạng thái tải, người dùng hủy, thiếu Play Services/cấu hình và lỗi kết nối. Không ghi token vào log.

Tiêu chí nghiệm thu:

- [ ] Nút đăng nhập mở giao diện tài khoản native; không dẫn sang URL OAuth với custom redirect của app.
- [ ] Chọn tài khoản trả ID token cho backend; hủy chọn không tạo phiên và không hiện lỗi sai.
- [ ] Bấm nút nhiều lần không tạo các yêu cầu đăng nhập đồng thời.
- [ ] Expo Go được chỉ dẫn dùng Development Build; bản Development Build không thiếu native module.
- [ ] TypeScript và xuất bundle Android đạt sau thay đổi.

### AUTH-03 — Xác minh đúng ID token và phân loại lỗi ở backend

Ưu tiên P0. Phụ thuộc: AUTH-01; triển khai cùng AUTH-02. Liên quan app/lib/mobile-auth.ts, app/api/v1/auth/google/route.ts, .env.example.

Thực hiện:

- Thêm cấu hình backend rõ nghĩa cho Web Client của mobile, ví dụ GOOGLE_MOBILE_WEB_CLIENT_ID. Chỉ chấp nhận audience được cấu hình cho luồng native; không chấp nhận mọi Client ID trong Google Cloud project.
- Giữ xác minh chữ ký Google, issuer, hạn token, sub và email hợp lệ. Không dùng email làm định danh nhà cung cấp; tiếp tục dùng sub.
- Tách lỗi token không hợp lệ (401), thiếu cấu hình (503) và lỗi database/phiên (5xx + log nội bộ). Không trả token hay dữ liệu nhạy cảm trong lỗi.

Tiêu chí nghiệm thu:

- [ ] ID token native hợp lệ tạo đúng một tài khoản/phiên và trả đúng contract API hiện tại.
- [ ] Token sai audience, issuer, chữ ký, đã hết hạn hoặc thiếu sub/email hợp lệ bị từ chối; không tạo user/session.
- [ ] Thiếu Web Client ID trả lỗi cấu hình 503; database không sẵn sàng không bị báo nhầm là “tài khoản Google không hợp lệ”.
- [ ] Test tự động kiểm tra cả trường hợp thành công và các trường hợp từ chối; log không chứa ID token.

### AUTH-04 — Kiểm thử đăng nhập đầu cuối trên Android thật

Ưu tiên P0. Phụ thuộc: AUTH-01–03, SEC-01. Liên quan APK Development Build và API thử nghiệm.

Tiêu chí nghiệm thu:

- [ ] Build lại, cài lại APK sau khi thêm native module; ghi build ID, package, SHA-1, bản mobile và backend đang chạy.
- [ ] Trên điện thoại thật: đăng nhập → vào tab học → tạo bài → nộp bài → xem kết quả/lịch sử → đóng/mở app vẫn có phiên → đăng xuất → đăng nhập lại.
- [ ] Thử hủy chọn tài khoản, chọn Gmail không có quyền Testing, sai cấu hình OAuth và mất mạng; mỗi tình huống có lỗi có thể hiểu, không treo màn hình.
- [ ] Dùng tài khoản thứ hai xác nhận không truy cập được bài, kết quả và lời giải của tài khoản thứ nhất.
- [ ] Có biên bản thử nghiệm với kết quả và ảnh màn hình, không lưu token hoặc mật khẩu.

### SEC-01 — Sửa kiểm tra quyền với lời giải AI đã cache

Ưu tiên P0. Phụ thuộc: không. Liên quan app/api/v1/ai/explain/route.ts và app/api/ai/explain/route.ts.

Thực hiện: xác thực người gọi, kiểm tra định dạng userAnswerId, truy vấn UserAnswer thuộc tài khoản trước; sau đó mới đọc AiExplanation/cache hoặc gọi Gemini. Giữ contract cho client web/mobile, chuẩn hóa mã lỗi khi cần.

> Ghi chú xác minh (ZCode, 27/09/2026): lỗi IDOR có thật ở cả hai route — đọc cache theo userAnswerId bất kỳ trước khi kiểm tra ownership (app/api/v1/ai/explain/route.ts:33-42 và app/api/ai/explain/route.ts:20-25); cả hai route đã kiểm tra ownership và loại câu đúng trước khi gọi Gemini nên phạm vi sửa chỉ cần đổi thứ tự kiểm tra. Bổ sung phạm vi: route web /api/ai/explain còn trả về row Prisma thô (kèm id nội bộ) và trả 500 cho body sai định dạng vì thiếu validation như bản v1.

Tiêu chí nghiệm thu:

- [ ] Không đăng nhập trả 401; ID sai định dạng trả 400.
- [ ] ID của người khác trả 404 ở cả nhánh đã cache và chưa cache; không gọi Gemini và không trả nội dung/đáp án.
- [ ] Câu đúng của chính mình không sinh lời giải; câu sai đã cache trả 200 mà không gọi Gemini.
- [ ] Câu sai chưa cache chỉ sinh một lời giải; test tích hợp hai tài khoản chạy với Gemini giả lập.

### SEC-02 — Loại bỏ đường thực thi HTML không tin cậy

Ưu tiên P0. Phụ thuộc: không. Liên quan app/lib/question-import.ts, app/(pages)/tests/[id]/page.tsx và app/(pages)/attempts/[attemptId]/page.tsx.

Thực hiện: chọn một bộ hiển thị passage dùng chung. Nếu cần giữ định dạng, chỉ cho phép các thẻ trình bày cơ bản và lọc thuộc tính/URL; áp dụng khi hiển thị cả bản ghi cũ lẫn bản nhập mới. Bổ sung CSP như lớp phòng vệ thứ hai sau khi nội dung đã an toàn.

Tiêu chí nghiệm thu:

- [ ] Nội dung đã lưu chứa script, onerror, onclick hoặc javascript: không thực thi trên trang làm bài/kết quả.
- [ ] Đoạn đọc hợp lệ vẫn giữ xuống dòng, in đậm và danh sách cần thiết.
- [ ] Không còn đường dùng raw dangerouslySetInnerHTML với passageText chưa lọc.
- [ ] Test hồi quy gồm nội dung độc hại nhập mới và bản ghi độc hại đã tồn tại.

### DATA-01 — Làm seed an toàn trước mọi thao tác triển khai

Ưu tiên P0. Phụ thuộc: không. Liên quan prisma/seed.ts, package.json và hướng dẫn vận hành.

Thực hiện: chuyển seed mẫu thành thao tác chỉ chạy trên database thử nghiệm, có chặn production trước mọi truy vấn ghi; dùng upsert/ID cố định thay cho xóa hàng loạt. Migrations là quy trình riêng, không gọi seed như một bước deploy.

Tiêu chí nghiệm thu:

- [ ] Trên database thử nghiệm có sẵn user, question, test, attempt: chạy seed hai lần không xóa hoặc nhân đôi dữ liệu cũ.
- [ ] Ở môi trường mô phỏng production, lệnh seed thoát lỗi trước mọi ghi; tổng số bản ghi trước/sau bằng nhau.
- [ ] Hướng dẫn deploy chỉ dùng migration đã review, không dùng seed trên database hiện tại.
- [ ] Lệnh seed thực sự chạy được trong môi trường phát triển với dependencies được khai báo đầy đủ.

### DATA-02 — Bổ sung index cho các cột khóa ngoại đang thiếu [ZCode bổ sung]

Ưu tiên P1, chặn G2. Phụ thuộc: không; nên gộp vào bước migration của DEP-01. Liên quan prisma/schema.prisma.

> Ghi chú xác minh (ZCode, 27/09/2026): PostgreSQL không tự đánh index cho cột FK. Hiện có 10 cột không index: TestAttempt.testId, UserAnswer.attemptId, UserAnswer.questionId, Question.groupId, MiniTestQuestion.questionId, QuestionSkillTag.skillTagId, Account.userId, Session.userId, IngestionJob.documentAssetId, IngestionJob.audioAssetId. Audit 2026-09-22 xếp mức High nhưng plan gốc chỉ đề cập chung chung trong PERF-01 (P2); ba cột đầu bị quét ở hầu hết truy vấn progress/attempts nên tách task riêng và ưu tiên sớm hơn.

Thực hiện: thêm @@index qua migration riêng, ưu tiên UserAnswer.attemptId, TestAttempt.testId, Question.groupId; đo trước/sau bằng EXPLAIN (ANALYZE) trên staging với dữ liệu fixture.

Tiêu chí nghiệm thu:

- [ ] Migration tạo index chạy được trên staging và chạy lại không sinh thay đổi.
- [ ] EXPLAIN các truy vấn progress/attempts/history cho thấy dùng index trên fixture lớn thay vì quét tuần tự.
- [ ] Không thay đổi hành vi ứng dụng; thời gian ghi không tăng đáng kể sau khi thêm index.

### DEP-01 — Triển khai API staging qua HTTPS

Ưu tiên P1, chặn G2. Phụ thuộc: DATA-01. Liên quan Next.js backend, .env.example, prisma/migrations và README.md.

Thực hiện: chọn môi trường chạy Next.js Node runtime, domain staging và TLS; cấu hình server-only secrets (database, Google, JWT, Gemini, storage), migration step, rollback và endpoint kiểm tra trạng thái không lộ bí mật. Dùng database/bucket staging riêng nếu có thể; không dùng seed hiện tại.

Tiêu chí nghiệm thu:

- [ ] API staging có HTTPS hợp lệ và truy cập được từ điện thoại qua 4G, không dựa vào IP LAN.
- [ ] Migration chạy trên database staging mới và chạy lại không sinh thay đổi ngoài dự kiến.
- [ ] Kiểm tra readiness phát hiện database/storage không sẵn sàng nhưng không trả credentials ra ngoài.
- [ ] Có bản ghi phiên bản deploy và cách quay lại bản trước; backend không cần máy phát triển chạy.
- [ ] URL/API server và secret được tách khỏi các biến EXPO_PUBLIC_*.

### DEP-02 — Cấu hình EAS và tạo APK preview độc lập

Ưu tiên P1, chặn G2. Phụ thuộc: AUTH-04, DEP-01. Liên quan mobile/eas.json, mobile/app.json và EAS environments.

Thực hiện: ràng buộc rõ development/preview/production với EAS environment tương ứng. Đặt EXPO_PUBLIC_API_URL HTTPS và Web Client ID cho từng môi trường; server tương ứng xác minh đúng audience. Đưa eas.json và app config đã review vào Git. Preview APK nhúng bundle; Development Build vẫn dùng Metro.

Tiêu chí nghiệm thu:

- [ ] APK preview cài/mở được khi Metro và máy tính tắt; trên 4G đăng nhập, tạo/nộp bài và xem kết quả.
- [ ] Bundle preview trỏ đúng API staging HTTPS; không chứa localhost, IP LAN, JWT secret, Gemini key hay Google client secret.
- [ ] Build ID, profile, package, SHA-1 và URL backend được lưu trong biên bản release.
- [ ] Dùng đúng SHA-1 của bản APK phát hành; khi dùng Google Play App Signing phải cấu hình thêm chứng chỉ ký của bản do Play phân phối.

### MOB-01 — Giữ phiên khi mất mạng

Ưu tiên P1. Phụ thuộc: AUTH-03. Liên quan mobile/src/providers/auth-provider.tsx.

Thực hiện: phân biệt refresh token bị từ chối thật với timeout, offline hoặc lỗi 5xx; giữ token an toàn cho lỗi tạm thời và hiển thị trạng thái thử lại. Chỉ logout/xóa token khi phiên bị thu hồi hoặc người dùng chọn đăng xuất.

> Ghi chú xác minh (ZCode, 27/09/2026): logic refresh ĐÃ phân biệt 401 (chỉ xóa phiên khi 401, mobile/src/providers/auth-provider.tsx:119-121) và đã có guard chống refresh đồng thời (refreshPromiseRef). Lỗi thật nằm ở effect khởi động app: clearLocalSession() chạy với mọi lỗi, kể cả offline/timeout/5xx (auth-provider.tsx:217-218) — mở app khi mất mạng là bị đăng xuất vĩnh viễn. Ưu tiên sửa vị trí này; tiêu chí nghiệm thu giữ nguyên.

Tiêu chí nghiệm thu:

- [ ] Bật chế độ máy bay khi mở app không xóa refresh token hoặc ép đăng nhập lại.
- [ ] Tắt chế độ máy bay, bấm thử lại thì phiên được phục hồi; không có hai lần refresh đồng thời.
- [ ] Refresh token bị thu hồi trả 401 thì xóa phiên và đưa về màn đăng nhập.
- [ ] Logout xóa dữ liệu phiên trên thiết bị; token vẫn chỉ lưu trong SecureStore.

### MOB-02 — Phục hồi bài đang làm và lỗi mạng

Ưu tiên P1. Phụ thuộc: MOB-01. Liên quan mobile/src/app/test/[id].tsx, mobile/src/app/(tabs)/index.tsx, mobile/src/app/(tabs)/practice.tsx.

Thực hiện: gắn bản nháp theo userId + testId; giữ clientSubmissionId ổn định đến khi server xác nhận nộp. Quyết định rõ có hỗ trợ mở lại bài hoàn toàn offline hay chỉ giữ đáp án và yêu cầu mạng để tải đề; hiển thị trạng thái đó cho người dùng. Không biến lỗi tải tiến độ thành số 0.

> Ghi chú xác minh (ZCode, 27/09/2026): bản nháp ĐÃ được lưu vào AsyncStorage theo testId (mobile/src/app/test/[id].tsx:93, 142-151) và clientSubmissionId ĐÃ ổn định + idempotent ba lớp (ràng buộc unique, pre-check, xử lý P2002 ở submit) — không cần làm lại hai việc này. Khoảng thật: draftKey chưa có userId (tài khoản B trên cùng máy ăn nháp của A, có thể kẹt 409 SUBMISSION_CONFLICT không thể nộp), và (tabs)/index.tsx:18-20 đang nuốt lỗi tải tiến độ rồi hiển thị 0.

Tiêu chí nghiệm thu:

- [ ] Trả lời 10 câu, tắt app rồi mở lại bằng cùng tài khoản: đáp án và thời gian/bản nháp còn đúng theo phạm vi đã công bố.
- [ ] Tài khoản B trên cùng thiết bị không nhìn thấy bản nháp của A.
- [ ] Mất phản hồi sau khi nộp rồi thử lại chỉ tạo một TestAttempt; bản nháp chỉ bị xóa khi đã xác nhận kết quả.
- [ ] Lỗi tải tiến độ hiển thị trạng thái lỗi + thử lại; nút tạo bài không bị kẹt sau khi điều hướng về màn cũ.

### ING-01 — Tác vụ nhập PDF có cơ chế xử lý bền vững

Ưu tiên P1, chặn G2 nếu cho phép người thử nghiệm nhập tài liệu. Phụ thuộc: DEP-01. Liên quan app/api/v1/ingestions/route.ts, app/api/v1/ingestions/[id]/retry/route.ts, app/lib/toeic-ingestion.ts và prisma/schema.prisma.

Thực hiện: dùng bảng job hiện có làm hàng đợi; worker/scheduler độc lập quét PENDING, claim nguyên tử, lease/heartbeat, thu hồi lease quá hạn, retry có giới hạn. after() có thể dùng để đánh thức nhanh nhưng không là cơ chế duy nhất. Phân loại lỗi PDF không đọc được, PDF ảnh không có text, lỗi AI tạm thời và lỗi hạ tầng.

> Ghi chú xác minh (ZCode, 27/09/2026): claim nguyên tử, giới hạn retry 3 lần và thu hồi quá hạn (dạng lazy khi client poll GET [id], WORKER_TIMEOUT 6 phút) ĐÃ tồn tại — app/lib/toeic-ingestion.ts:124-128, app/api/v1/ingestions/[id]/retry/route.ts:27-31, app/api/v1/ingestions/[id]/route.ts:37-52. Còn thiếu thật: worker bền vững quét lại PENDING (job PENDING mồ côi vĩnh viễn nếu after() không chạy, vì retry chỉ nhận status FAILED) và lease/heartbeat. Tiêu chí "retry tối đa ba lần" đã đạt sẵn; phân loại lỗi đã có một phần (DOCUMENT_PARSE_FAILED, DOCUMENT_TEXT_EMPTY) nhưng AI_EXTRACTION_FAILED đang gộp lỗi AI tạm thời và vĩnh viễn.

Tiêu chí nghiệm thu:

- [ ] Dừng worker ngay sau khi tạo job, khởi động lại: job PENDING vẫn được xử lý mà không cần người dùng tạo lại.
- [ ] Dừng worker giữa chừng: job quá lease được xử lý lại hoặc chuyển FAILED trong thời hạn cấu hình; không mắc kẹt vô hạn.
- [ ] Hai worker cùng chạy không xử lý một job đồng thời; retry tối đa ba lần và import không nhân đôi câu hỏi.
- [ ] Job ghi jobId, trạng thái, số lần thử và errorCode; log không chứa nội dung PDF, signed URL hay token.

### ING-02 — Danh sách tác vụ và tiếp tục sau khi đóng app

Ưu tiên P1. Phụ thuộc: ING-01. Liên quan app/api/v1/ingestions, mobile/src/app/(tabs)/library.tsx và trang nhập web.

Thực hiện: thêm API danh sách job phân trang, chỉ trả dữ liệu của chủ sở hữu; mobile/web mở lại job đang chạy, đã hoàn thành hoặc thất bại. Polling có giới hạn thời gian nhưng không làm mất job.

Tiêu chí nghiệm thu:

- [ ] Tạo job rồi đóng app/tải lại trang: mở lại thấy job với trạng thái mới và có thể tiếp tục.
- [ ] Danh sách chỉ trả job của tài khoản hiện tại; ID của tài khoản khác trả 404.
- [ ] Job FAILED hiển thị nguyên nhân có thể hiểu và nút thử lại khi còn lượt; PDF scan được báo rõ chưa được hỗ trợ nếu chưa có OCR.
- [ ] Không có trạng thái PENDING/PROCESSING quá hạn mà giao diện chỉ quay mãi không có hướng xử lý.

### ING-03 — Kiểm duyệt và sửa toàn bộ câu hỏi trước khi nhập

Ưu tiên P1. Phụ thuộc: ING-02. Liên quan schema app/lib/question-import.ts, API import và giao diện library/admin.

Thực hiện: hiển thị toàn bộ câu, nhóm câu và media; cho sửa Part, nội dung, bốn lựa chọn, đáp án, passage và bỏ câu lỗi. Lưu bản duyệt có revision/ownership, kiểm tra lại ở server trước import; giữ thao tác import idempotent.

Tiêu chí nghiệm thu:

- [ ] Có thể xem và sửa cả câu thứ 21 trở đi, lưu và mở lại bản duyệt.
- [ ] Part ngoài 1–7, đáp án không nằm trong lựa chọn hoặc dữ liệu thiếu bị từ chối với lỗi tại đúng câu.
- [ ] Người dùng phải xác nhận rõ trước khi nhập; nhấn hai lần hoặc hai thiết bị đồng thời không tạo bản sao câu hỏi.
- [ ] Tài khoản khác không đọc/sửa/nhập job; bài luyện mới phản ánh đúng câu đã sửa.

### ING-04 — Trạng thái job kẹt và luồng poll ở client [ZCode bổ sung]

Ưu tiên P1, chặn G2. Phụ thuộc: ING-01 (làm cùng worker bền vững). Liên quan app/api/v1/ingestions/[id]/route.ts, mobile/src/app/(tabs)/library.tsx.

> Ghi chú xác minh (ZCode, 27/09/2026): GET [id] tự chuyển job IMPORTING kẹt hơn 2 phút thành COMPLETED ([id]/route.ts:42-45) — thao tác import "biến mất" âm thầm, route import chỉ chặn trường hợp đã IMPORTED. Ở client, một lỗi mạng trong vòng poll 150 lần làm đổ cả luồng UI dù job vẫn chạy phía server (library.tsx:63-76).

Thực hiện: IMPORTING quá hạn phải chuyển sang trạng thái lỗi/cần thử lại rõ ràng thay vì COMPLETED; vòng poll chịu lỗi mạng tạm thời (thử lại/backoff), không làm mất jobId khi có lỗi thoáng qua.

Tiêu chí nghiệm thu:

- [ ] Job IMPORTING quá hạn không tự thành COMPLETED; giao diện chỉ dẫn người dùng thử lại thay vì báo thành công.
- [ ] Mất mạng thoáng qua trong lúc poll không văng khỏi luồng; poll tiếp tục khi có mạng lại trong giới hạn thời gian đã công bố.
- [ ] Có test hồi quy cho cả hai kịch bản (đổi trạng thái sai và poll gặp lỗi mạng).

### SEC-03 — Giới hạn truy cập dùng chung và ngân sách AI

Ưu tiên P1, chặn G3. Phụ thuộc: DEP-01. Liên quan app/lib/rate-limit.ts, AI web/mobile và pipeline tài liệu.

Thực hiện: chuyển bộ đếm từ Map trong tiến trình sang kho chung có tăng nguyên tử + TTL; khóa theo user cho API đã đăng nhập, chỉ lấy IP từ proxy đáng tin cho trường hợp chưa đăng nhập. Áp dụng giới hạn cho AI web lẫn mobile, số lần nhập tài liệu, ngân sách AI hằng ngày/toàn hệ thống; giới hạn input/output và chống gọi Gemini hai lần cho cùng một lời giải.

> Ghi chú xác minh (ZCode, 27/09/2026): khóa hiện có dạng scope:user.id:IP và lấy IP từ header client tự gửi được (app/lib/rate-limit.ts:17-31) — user đã đăng nhập vẫn nhân hạn mức bằng cách xoay header IP; khi chuyển sang kho chung, khóa theo user phải bỏ phần IP. Route web /api/mini-tests/generate cũng chưa có rate limit — tách thành PERF-02.

Tiêu chí nghiệm thu:

- [ ] Hai instance API dùng chung một hạn mức; yêu cầu vượt hạn trả 429 và Retry-After đúng.
- [ ] Header x-real-ip/x-forwarded-for do client tự gửi không vượt qua hạn mức.
- [ ] Cache hit lời giải không gọi Gemini; hai yêu cầu đồng thời cho cùng câu chỉ phát sinh tối đa một lượt gọi.
- [ ] Vượt ngân sách ngày trả lỗi xác định trước khi gọi nhà cung cấp; dùng hết quota không tạo chi phí vượt trần đã cấu hình.
- [ ] Khi kho giới hạn hỏng, chính sách cho phép/từ chối và cảnh báo được định nghĩa, có test.

### SEC-04 — Chính sách liên kết tài khoản Google/Apple

Ưu tiên P1, chặn G3. Phụ thuộc: AUTH-03. Liên quan resolveMobileUser() trong app/lib/mobile-auth.ts.

Thực hiện: xem lại việc tự gắn provider mới vào User chỉ vì email trùng và email_verified. Dùng provider sub làm khóa đăng nhập; với email ngoài Gmail/Workspace hoặc khi gắn Apple vào tài khoản Google đã có, yêu cầu quy trình liên kết từ phiên đã đăng nhập hay kiểm chứng quyền sở hữu phù hợp. Không tách nhầm dữ liệu học hiện có.

Tiêu chí nghiệm thu:

- [ ] Đăng nhập lại cùng Google sub luôn vào cùng User dù email hiển thị đổi.
- [ ] Provider mới không chiếm tài khoản có sẵn chỉ bằng một email trùng chưa được chứng minh là cùng chủ.
- [ ] Có test cho Gmail, Workspace, email ngoài Google và trường hợp Apple/Google trùng email.
- [ ] Dữ liệu của 2 user hiện có vẫn gắn đúng tài khoản sau migration/chính sách mới.

### SEC-05 — Phân quyền nhập nội dung và pool câu hỏi dùng chung [ZCode bổ sung]

Ưu tiên P1, chặn G3; làm sớm hơn nếu nhóm thử nghiệm mở rộng ngoài người được tin cậy. Phụ thuộc: không. Liên quan app/api/import/questions-json/route.ts, app/api/v1/ingestions/[id]/import/route.ts, app/api/admin/.

> Ghi chú xác minh (ZCode, 27/09/2026): hiện mọi user đăng nhập đều import hàng loạt câu hỏi vào pool dùng chung (câu hỏi ownerId null xuất hiện trong bài của mọi người qua điều kiện OR ownerId null/user.id); không tồn tại vai trò admin, /api/admin/* chỉ trả 410 ở production mà không kiểm tra quyền khi chạy dev.

Thực hiện: định nghĩa cơ chế tin cậy (role trong schema hoặc allowlist theo user được cấu hình); áp cho mọi đường nhập (import JSON, import kết quả ingestion, các route admin); ghi lại quyết định phân quyền trong tài liệu vận hành.

Tiêu chí nghiệm thu:

- [ ] Tài khoản không có quyền gọi các đường import/admin trả 403; có test trường hợp âm tính với hai tài khoản.
- [ ] Câu hỏi vào pool chung (ownerId null) chỉ do tài khoản được phép tạo ra.
- [ ] Cơ chế phân quyền được ghi trong README/tài liệu vận hành, không dựa vào việc giấu URL.

### OPS-01 — Backup, restore và vòng đời file

Ưu tiên P1, chặn G2. Phụ thuộc: DEP-01. Liên quan PostgreSQL và bucket private.

Thực hiện: thiết lập backup định kỳ, quyền truy cập tối thiểu, lifecycle xóa pending object quá hạn, CORS cần thiết cho upload web. Ghi quy trình restore vào môi trường cách ly. Đặt mục tiêu thử nghiệm ban đầu RPO ≤24 giờ và RTO ≤4 giờ; điều chỉnh theo mức chấp nhận kinh doanh trước G3.

Tiêu chí nghiệm thu:

- [ ] Backup theo lịch có cảnh báo khi quá hạn; file READY không bị lifecycle của pending xóa.
- [ ] Restore thử vào database/bucket cách ly, xác nhận user, câu hỏi, attempt và media tham chiếu đọc được.
- [ ] Không dùng database production làm nơi thử restore; có biên bản thời gian khôi phục và điểm dữ liệu khôi phục.
- [ ] Bucket từ chối đọc công khai, signed URL hết hạn đúng và CORS chỉ cho origin/method cần thiết.

### QA-01 — Test bảo mật và logic nghiệp vụ trọng tâm

Ưu tiên P0, chặn G0/G1. Triển khai test tương ứng song hành với SEC-01, SEC-02 và DATA-01 để chốt G0; hoàn tất toàn bộ sau AUTH-03 để chốt G1. Liên quan tests/ và môi trường database test tách biệt.

Thực hiện: bổ sung test scoring, ownership, đăng nhập/refresh/logout, cache lời giải, import idempotent và seed an toàn. Mock Google/Gemini ở test tự động; dùng hai tài khoản giả lập để kiểm tra cách ly.

Tiêu chí nghiệm thu:

- [ ] Test bài làm xác nhận đáp án đúng không lộ trước khi nộp, chấm điểm chính xác, câu lạ bị từ chối và retry cùng clientSubmissionId chỉ tạo một attempt.
- [ ] Test hai tài khoản bao phủ GET test/attempt/media, lời giải cache, job, import và refresh token.
- [ ] Test token hết hạn, sai audience, refresh token reuse và logout; không cần gọi Google/Gemini thật.
- [ ] Test XSS và seed guard chạy trên database/tài liệu thử, không động vào dữ liệu hiện tại.

### QA-02 — Kiểm thử APK preview theo hành trình người dùng

Ưu tiên P1, chặn G2. Phụ thuộc: DEP-02, ING-03, MOB-01, MOB-02.

Tiêu chí nghiệm thu:

- [ ] Khi máy tính và Metro tắt, trên 4G: cài APK → Google Login → tạo/nộp bài → xem kết quả/lịch sử → AI Coach → logout/relogin.
- [ ] Upload PDF text + audio từ điện thoại, xem toàn bộ kết quả, sửa ít nhất một đáp án và import; sau đó tạo bài có câu vừa nhập.
- [ ] Đóng app giữa job, mất mạng khi refresh và mất phản hồi lúc nộp bài đều phục hồi theo các task tương ứng.
- [ ] Lặp lại bài học bằng tài khoản thứ hai để xác nhận không thấy dữ liệu của tài khoản thứ nhất.
- [ ] Biên bản có build ID, Android version, loại mạng, API deployment version, kết quả từng bước; không lưu dữ liệu nhạy cảm.

### QA-03 — CI, lint, phiên bản phụ thuộc và cổng phát hành

Ưu tiên P1, chặn G3. Phụ thuộc: QA-01. Liên quan package.json, mobile/package.json, eslint.config.mjs và workflow CI mới.

Thực hiện: sửa các lỗi lint của mã ứng dụng; loại trừ đúng script thử nghiệm/generated khỏi lint thay vì bỏ qua lỗi ứng dụng. Căn các phiên bản vá Expo theo kiểm tra tương thích, review npm audit và cập nhật theo hướng tương thích Prisma. Thêm pipeline cho root/mobile trên clean clone.

Tiêu chí nghiệm thu:

- [ ] Root lint, TypeScript, 11 test cũ + test mới và production build đều đạt.
- [ ] Mobile TypeScript, Expo install --check và Android bundle export đều đạt.
- [ ] Một thay đổi cố tình làm hỏng test/lint bị CI chặn; lockfile và migration cần thiết được đưa vào Git.
- [ ] Mọi cảnh báo mức cao của dependency audit được cập nhật hoặc ghi quyết định phạm vi ảnh hưởng; không tự động downgrade major Prisma.

### OPS-02 — Giám sát và hướng xử lý sự cố

Ưu tiên P1, chặn G3. Phụ thuộc: DEP-01, ING-01, SEC-03.

Thực hiện: log có requestId/jobId/errorCode, không chứa token, nội dung PDF, signed URL hay mật khẩu; đo 5xx, độ trễ, lỗi đăng nhập, job kẹt, chi phí AI và lỗi storage. Tạo cảnh báo và runbook khôi phục cho từng loại.

Tiêu chí nghiệm thu:

- [ ] Tạo có chủ đích lỗi 5xx, job quá hạn, lỗi storage và vượt quota trong staging; mỗi lỗi có metric/cảnh báo và hướng xử lý.
- [ ] Có thể truy một yêu cầu từ client tới API/job qua ID tương quan nhưng không thấy bí mật trong log.
- [ ] Người vận hành biết cách tạm dừng AI/ingestion, thử lại job và rollback bản deploy.

### PERF-01 — Phân trang và truy vấn có giới hạn

Ưu tiên P2, chặn G3 khi số người dùng/dữ liệu tăng. Phụ thuộc: DEP-01, QA-01. Liên quan app/api/v1/tests/route.ts, app/api/v1/progress/route.ts, API thống kê web và lịch sử.

Thực hiện: benchmark trên dữ liệu staging có kích thước dự kiến; thay việc nạp mọi câu hỏi/lượt làm bài vào bộ nhớ bằng chọn mẫu và tổng hợp/phân trang ở database, thêm index theo kết quả đo.

> Ghi chú xác minh (ZCode, 27/09/2026): đã xác nhận app/api/v1/tests/route.ts:42-53 và app/api/v1/progress/route.ts:11-32 nạp toàn bộ rồi xử lý trong JS; bản web app/api/progress/summary/route.ts:32-39 còn include cả dòng Question đầy đủ dù chỉ dùng trường part. Route tạo bài web app/api/mini-tests/generate có vấn đề tương tự cộng thêm shuffle lệch — tách thành PERF-02. Index khóa ngoại chuyển sang DATA-02.

Tiêu chí nghiệm thu:

- [ ] API danh sách có giới hạn trang rõ ràng; không trả toàn bộ lịch sử trong một response.
- [ ] Chọn câu hỏi không lặp trong một bài và phân bố Part đúng yêu cầu; thống kê sau tối ưu khớp bản chuẩn trên fixture.
- [ ] Với profile thử nghiệm được thống nhất (đề xuất 10.000 câu, 1.000 attempt/tài khoản, 20 người đồng thời), p95 API đọc <2 giây và bộ nhớ không tăng tuyến tính theo toàn bộ bảng.
- [ ] Có kết quả đo trước/sau và query plan/index liên quan.

### PERF-02 — Giới hạn truy vấn và sửa chọn câu ở route tạo bài web [ZCode bổ sung]

Ưu tiên P2, chặn G3. Phụ thuộc: SEC-03 (dùng lại cơ chế rate limit chung). Liên quan app/api/mini-tests/generate/route.ts.

> Ghi chú xác minh (ZCode, 27/09/2026): route này findMany toàn bộ câu hỏi rồi trộn bằng sort(() => 0.5 - Math.random()) — phân bố chọn câu bị lệch so với Fisher-Yates mà bản v1 dùng — và không có rate limit trong khi bản v1 giới hạn 20/phút.

Thực hiện: dùng cùng cách chọn mẫu có giới hạn với v1/tests (Fisher-Yates, không nạp toàn bộ bảng); áp rate limit bằng cơ chế của SEC-03.

Tiêu chí nghiệm thu:

- [ ] Không nạp toàn bộ bảng câu hỏi vào bộ nhớ; phân bố Part của bài tạo ra khớp bản chuẩn trên fixture.
- [ ] Route có giới hạn tần suất; yêu cầu vượt hạn trả 429 kèm Retry-After.
- [ ] Hành vi tạo bài trên web không thay đổi với người dùng cuối.

### REL-01 — Hồ sơ phát hành và phạm vi nền tảng

Ưu tiên P2, chặn G3. Phụ thuộc: QA-03, OPS-01, OPS-02.

Thực hiện: công bố chính sách dữ liệu/quyền riêng tư, quyền sử dụng bộ đề/audio, kênh hỗ trợ, thời hạn lưu/xóa tài khoản; lập checklist phiên bản, signing key và rollback. Nếu phát hành iOS, tạo riêng OAuth iOS/Apple configuration và chạy bộ test thiết bị iPhone tương đương G2.

Tiêu chí nghiệm thu:

- [ ] Tài liệu phát hành ghi rõ dữ liệu nào được thu thập, lưu ở đâu, cách xóa và cách liên hệ hỗ trợ.
- [ ] Nội dung TOEIC/PDF/audio dùng cho bản công khai có quyền sử dụng hoặc chỉ nằm trong thư viện riêng của người dùng.
- [ ] Google OAuth ở trạng thái phù hợp đối tượng người dùng phát hành; bản qua Play Internal Testing dùng đúng SHA-1 App Signing.
- [ ] Không tuyên bố hỗ trợ iOS trước khi đăng nhập Apple/Google, media, upload và vòng học đã qua kiểm thử trên iPhone.

## 5. Quy tắc hoàn thành chung cho mọi task

- Có thay đổi mã/cấu hình hoặc biên bản cấu hình Cloud tương ứng, được review và đưa vào version control khi phù hợp; không commit bí mật.
- Có test tự động cho logic có thể kiểm thử; các bước phụ thuộc thiết bị/Cloud có biên bản thử nghiệm và build ID.
- Không dùng database hiện tại để thử script xóa dữ liệu, restore hay load test.
- Cập nhật .env.example/README khi thêm biến môi trường hoặc thay đổi thao tác vận hành.
- Task chỉ được đánh dấu Done khi toàn bộ tiêu chí của chính task đạt; build/TypeScript xanh không thay thế kiểm thử chức năng.

## 6. Nguồn kỹ thuật tham chiếu

- Google: https://developers.google.com/identity/protocols/oauth2/native-app — Android không hỗ trợ custom URI scheme của OAuth flow hiện tại.
- Google: https://developers.google.com/identity/gsi/web/guides/verify-google-id-token — xác minh ID token và trường hợp email không đủ để tự liên kết tài khoản.
- Expo: https://docs.expo.dev/guides/google-authentication/ — Google Sign-In native và Development Build.
- Expo: https://docs.expo.dev/eas/environment-variables/usage/ — môi trường biến cho EAS Build/Update.
- Next.js 16.3.5 cài trong repo: node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md — after chạy sau response trong thời hạn platform; không thay thế cơ chế hàng đợi bền vững.

## 7. Phụ lục xác minh (ZCode, 27/09/2026)

Kết quả đối chiếu độc lập với mã nguồn và database trong cùng ngày lập plan:

- Số liệu mục 2 kiểm chứng lại đều đúng: 6/6 migration đã áp dụng (schema up to date); 2 user, 72 question, 7 attempt; job 3 FAILED / 3 IMPORTED / 1 COMPLETED; 11/11 test đạt; root lint đúng 11 lỗi; npm run build đạt (chạy lại ngày 27/09); Android Client ID của mobile trùng backend; EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID trống; EXPO_PUBLIC_API_URL đang là http://192.168.100.198:3000.
- Các lỗi SEC-01, SEC-02, DATA-01, SEC-03, SEC-04, ING-02, PERF-01 đều có thật, đúng vị trí mô tả (chi tiết file:dòng trong ghi chú từng task).
- Ba task mô tả hiện trạng chưa chính xác (code đã làm sẵn một phần): ING-01, MOB-01, MOB-02 — đọc ghi chú tương ứng trước khi triển khai để không làm lại việc đã có.
- Backend mobile-auth đã có refresh token xoay vòng, lưu hash, thu hồi cả family và access token 15 phút — không cần dựng lại.
- Vệ sinh nhỏ chưa thành task: file app.json ở thư mục gốc là file rác untracked (chỉ chứa eas.projectId, trùng mobile/app.json) — xóa hoặc xử lý trước khi commit; prisma.seed dùng ts-node nhưng ts-node không khai báo trong devDependencies nên seed hiện không chạy được (DATA-01 đã có tiêu chí nghiệm thu tương ứng).
- Không thể xác minh trong phiên này: lỗi 400 invalid_request phía Google (cần thiết bị và Google Cloud Console — AUTH-01 chịu trách nhiệm xác nhận), cấu hình EAS/Google Cloud từ xa, lần HeadBucket gần nhất.

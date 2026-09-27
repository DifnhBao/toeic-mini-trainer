# Trạng thái triển khai ngày 27/09/2026

Đây là trạng thái kiểm chứng tại workspace, không phải biên bản phát hành. Không có
commit, migration trên database thật, EAS Build hoặc thay đổi Google Cloud nào được
thực hiện trong lượt này.

## Đã triển khai trong code

- SEC-01: hai route AI explanation kiểm tra quyền sở hữu câu trả lời trước khi
  trả lời giải đã cache; route web kiểm tra UUID/JSON và chỉ trả DTO cần thiết.
- SEC-02: lọc HTML passage khi import và khi hiển thị cả dữ liệu cũ; thêm test
  định dạng hợp lệ và payload độc hại.
- DATA-01: seed demo không còn xóa dữ liệu; chỉ cho phép database dev/test/demo
  được xác nhận tường minh bằng `ALLOW_DEMO_SEED=true` và `SEED_DATABASE_NAME`.
- AUTH-02/03 (phần code): Android dùng Google Sign-In native, gửi ID token cho
  backend; backend chỉ chấp nhận audience Web OAuth Client được cấu hình và
  phân biệt lỗi token/cấu hình với lỗi tạo session. iOS chưa được cấu hình native.
- MOB-01 (phần code): lỗi mạng/5xx khi khôi phục phiên không xóa refresh token;
  màn đăng nhập có nút thử kết nối lại.
- DATA-02: thêm 10 index khóa ngoại trong migration mới, **chưa áp dụng** vào
  database nào và chưa đo EXPLAIN trên staging.
- Root lint hết lỗi chặn; script thử nghiệm thủ công và script reset scaffold được
  loại khỏi phạm vi lint ứng dụng.

## Đã kiểm chứng tại chỗ

- `npm test`: 17/17 đạt.
- `npx tsc --noEmit` ở root và `mobile/`: đạt.
- `npm run build`: đạt.
- `npm run lint`: đạt với 4 cảnh báo không chặn.
- `npx expo install --check`: dependencies phù hợp Expo SDK.
- `npx expo-doctor`: 21/21 kiểm tra đạt.
- `npx expo export --platform android`: đạt (chỉ xác minh JS bundle, không phải APK/native module).
- `npx prisma validate`: đạt.
- `npm audit --omit=dev` trong `mobile/`: không có cảnh báo.

## Chưa nghiệm thu / cần phối hợp

1. **OAuth Android:** Web Client hiện tại và Android Client cũ thuộc hai Google
   Cloud project khác nhau. Cần tạo Android OAuth Client trong project của Web
   Client với package `com.toeicminitrainer.app` và SHA-1 của APK development,
   đồng thời xác nhận Test users. Web Client ID đã được điền vào
   `mobile/.env.local`; Android Client mới chưa có. Không gửi Client Secret.
2. **APK thật:** cần build và cài Development Build mới sau khi thêm native module,
   sau đó thử luồng đăng nhập → học → nộp → xem kết quả → khôi phục phiên → logout
   trên điện thoại thật. Bundle export không chứng minh bước này.
3. **API độc lập:** chưa có lựa chọn hosting/staging HTTPS, domain, database và
   bucket riêng; APK preview trên 4G chưa thể nghiệm thu.
4. **Dữ liệu:** chưa chạy seed hai lần trên database thử nghiệm cách ly; migration
   index chưa áp dụng hoặc đo hiệu năng; không chạy seed trên database hiện tại.
5. **Bảo mật/QA:** chưa có test tích hợp hai tài khoản cho SEC-01 và token Google;
   chưa kiểm thử backup/restore, giám sát, tải hoặc giới hạn chi phí AI.
6. **Dependency audit:** `npm audit --omit=dev` còn 4 cảnh báo high trong nhánh
   Prisma 7.10.0 (`deepmerge-ts`, `mysql2`); đề xuất tự động hiện tại là hạ
   Prisma xuống 6.x (breaking change), nên chưa dùng `npm audit fix --force`.

Lưu ý: ghi chú SEC-05 trong `RELEASE_READINESS_PLAN.md` nói import của mọi user
đi vào pool chung. Code hiện tại gán `ownerId` bằng user đang đăng nhập trong
`importExtractedQuestions`; cần xác minh lại phạm vi SEC-05 trước khi thêm role
hoặc chặn chức năng import cá nhân.

## Bổ sung theo quyết định Vercel Hobby staging

- Đã thay Android Client ID cũ ở `.env` và `mobile/.env.local` bằng Client ID
  cùng Google Cloud project với Web Client; thêm `GOOGLE_MOBILE_WEB_CLIENT_ID`
  vào `.env` local. Các file env vẫn bị Git ignore.
- `npx expo prebuild --platform android --no-install` thành công; kiểm tra
  autolinking nhận cả `react-native-nitro-google-signin` và
  `react-native-nitro-modules`. Thư mục `mobile/android` sinh ra được Git ignore;
  đây chưa phải Gradle/EAS APK build hoặc thử nghiệm trên điện thoại.
- `mobile/.env.local` vẫn trỏ API HTTP LAN cho Development Build; chưa có
  staging HTTPS domain hay EAS environment `preview`, nên APK preview độc lập
  chưa thể tạo/kiểm thử đúng cấu hình.
- Đã thêm `vercel.json` cho `sin1`, build có `prisma generate`, endpoint worker
  có Bearer secret và endpoint readiness kiểm tra Neon/R2. GitHub Actions cron
  được định nghĩa trong repo nhưng **chưa hoạt động** vì chưa có Git remote,
  commit/default branch hoặc GitHub secrets.
- Hướng dẫn chi tiết ở `docs/VERCEL_STAGING.md`. Không cấu hình migration tự động
  trong Vercel build, không tạo database mới và không chạy migration hiện tại.
- Vercel Hobby chỉ được dùng cho staging cá nhân phi thương mại theo xác nhận
  của chủ dự án. Cần Fluid Compute để route 300 giây hợp lệ; chưa kiểm tra được
  trạng thái này trên một Vercel project vì project chưa được kết nối.

# Nghiệm thu phân tích học tập cá nhân

Ngày 09/10/2026. Kế hoạch: [PERSONAL_LEARNING_INSIGHTS_PLAN.md](PERSONAL_LEARNING_INSIGHTS_PLAN.md). Chủ dự án yêu cầu ưu tiên việc an toàn khi đi vắng và nhận báo cáo lúc 20h. Giai đoạn 1–2 đã có mã/kiểm chứng local; chưa triển khai API production hoặc APK mới cho tính năng này.

## Hành vi đã triển khai

- API private `GET /api/v1/progress/insights`; web `/progress`; Android `/insights`, mở từ Hôm nay và màn kết quả bài làm.
- Đọc bài đã nộp có điểm trong 30 ngày; chặn lịch sử quá cũ/tương lai, tối đa 100 bài và 50 đáp án mỗi bài; báo phạm vi bị giới hạn.
- Tách đúng/sai/bỏ trống, dùng lần trả lời mới nhất của mỗi câu. Luyện cùng một câu nhiều lần không tự tăng số bằng chứng độc lập. Mẫu dưới 20 câu mỗi Part chưa được kết luận yếu/mạnh.
- Part dưới 70% khi đủ mẫu được ưu tiên; 70–80% củng cố; từ 80% ghi nhận đang làm tốt trong mẫu đã luyện. Tỷ lệ hiển thị làm tròn, phân loại dùng tỷ lệ gốc.
- So hai nửa 15 ngày của từng Part khi mỗi nửa có ít nhất 10 câu khác nhau; báo số câu trùng. Không quy đổi thành điểm TOEIC hoặc tự kết luận trình độ tăng/giảm khi bài khác độ khó.
- Tối đa 8 nhãn kỹ năng, chỉ từ nhãn hiện tại trong kho; ít nhất 10 câu mới có đánh giá kỹ năng ban đầu. Hiển thị độ phủ nhãn, không tự phân loại câu chưa có nhãn.
- Đề xuất tối đa ba buổi, có lý do/số liệu/các bước luyện. Chỉ Part có câu hỏi được phép dùng mới có đề xuất bắt đầu. Kho trống có thông báo và lối mở Kho bài; vẫn giữ đánh giá Part chưa có nội dung để học viên biết điểm cần cải thiện.
- Khi bấm luyện, tạo bài đúng Part, tối đa 5–10 câu tùy kho, ưu tiên câu chưa làm của **đúng tài khoản** bằng `preferUnseen: true`. Thiếu câu mới thì dùng câu đã luyện; thiếu tổng số câu thì bài có thể ngắn hơn. Mặc định API cũ vẫn chọn ngẫu nhiên. Không tự tạo/nộp bài khi mở phân tích.
- Response không chứa ID câu/bài riêng tư, nội dung đề, lựa chọn hoặc đáp án; `no-store`. Web kiểm tra identity của phiên hiện tại trước hiển thị; Android kiểm tra owner/revision và bỏ response đã hết lượt focus. Không lưu báo cáo vào storage local và không gửi lịch sử ra AI/provider.

## Bằng chứng

| Kiểm tra | Kết quả |
| --- | --- |
| Unit/regression Windows | 245/245 đạt, không skip |
| Unit phân tích mới | 12/12: mẫu ít, lặp câu, blank mới nhất, ngưỡng và làm tròn, tuổi dữ liệu/phạm vi, xu hướng cùng Part, nhãn trùng/thiếu, không lộ raw đáp án, lọc đề xuất theo kho |
| PostgreSQL integration toàn bộ | 78/78 đạt, không skip; container test `toeic-resubmit-test-20261009`, loopback `55433`, đã dừng sau kiểm thử |
| Integration phân tích mới | 5/5: auth/không trộn tài khoản/no-store, số liệu và trend, chỉ ưu tiên câu mới được phép dùng, history của B không ảnh hưởng lựa chọn của A, fallback/cap/legacy và tài khoản suspended |
| TypeScript root/mobile | Đạt; typed routes Android sinh lại bằng generator của Expo CLI đang cài |
| Lint | 0 lỗi; ba cảnh báo img cũ ở web. Cảnh báo dependency retry ở màn mới đã sửa và lint riêng màn mới đạt |
| Build web/API | Next.js 16.3.8 Webpack đạt; `/progress` và `/api/v1/progress/insights` là dynamic |
| Android export | Expo SDK 57 đạt, 1.340 module, Hermes bundle khoảng 2,4 MB |
| Kiểm tra bundle | 1.323 source được kiểm tra; không có dependency công cụ xử lý tài liệu/AI local được đóng gói vào APK |

Log local trong `Test/insights-*`, không commit. Fixtures chỉ tạo/dọn UUID riêng trong PostgreSQL test, không seed/reset/truncate DB thật. Không migration, không gọi AI hoặc ghi vào DB/storage production. Bản server mới và giao diện Android mới cần phát hành đồng bộ; APK `0941a11` đang nghiệm thu chưa chứa màn này.

Commit tính năng `725b420a749ae1017591467d5df50e8c3f00e454` đã đẩy lên `codex/release-readiness`. CI [37921912620](https://github.com/DifnhBao/toeic-mini-trainer/actions/runs/37921912620) được đọc qua GitHub connector: web/integration/mobile và từng bước đều success. PR #4 vẫn nháp, chưa merge. Kết quả này chưa chứng minh API production hoặc UI điện thoại đã được cập nhật.

## Cần kiểm tra sau phát hành có kiểm soát

1. Tài khoản mới: các Part hiện “Chưa có dữ liệu”, không bị ghi nhận 0% yếu; chỉ có nút luyện ở Part có kho phù hợp.
2. Làm/nộp Part 5 và một Part khác; đối chiếu đúng/sai/bỏ trống với kết quả bài. Mở lại phân tích cập nhật số liệu, không tự tạo thêm bài khi tải trang.
3. Làm lại cùng một bài: số lượt tăng nhưng số câu khác nhau không tăng; lần trả lời mới nhất được dùng. Không lấy một bài làm lại để xác nhận hiệu quả học.
4. Nút luyện từ đề xuất vào đúng Part, ưu tiên câu chưa làm; thiếu câu mới/thiếu kho được diễn giải rõ. Đáp án vẫn kín đến khi nộp.
5. Đổi A → B, logout/relogin, đóng/mở app: không hiển thị phân tích A cho B. Khi phiên thay đổi trên web, quay về trang chủ rồi mở lại.
6. Mất mạng: hiển thị lỗi/thử lại, không thay bằng số liệu 0% hoặc kết luận yếu. Trở lại có mạng tải đúng tài khoản.
7. Samsung S23 FE/Android 16 và một Android thứ hai: đọc chữ lớn, cuộn, nút, điều hướng, Wi-Fi/4G. UI thật và điện thoại chưa được kiểm chứng bằng bộ test handler/bundle.
8. Rà soát chất lượng nhãn/nội dung/độ khó; sau hai tuần thu nhận ý kiến về đề xuất. Ngưỡng mẫu/tỷ lệ là lựa chọn sản phẩm cần kiểm chứng, không phải thang điểm chuẩn hóa.

Không đánh dấu các mục điện thoại/UI/triển khai là đạt thay cho chủ dự án. Chia audio vẫn để nghiệm thu sau theo yêu cầu trước đó.

## Bổ sung sau CI tính năng

Đã tối ưu lựa chọn câu chưa làm sau khi phép đo lịch sử lớn phát hiện chậm; [biên bản hiệu năng](PERSONAL_LEARNING_INSIGHTS_PERFORMANCE_2026-10-09.md) ghi truy vấn/fixture/các giới hạn. Đã sửa chênh lệch xu hướng: tính từ số đúng/tổng gốc, hiển thị một chữ số thập phân; phân loại tăng/giảm dùng tỷ lệ gốc. Không hiện số dạng `43.400000000000006` và không dùng làm tròn để đẩy qua ngưỡng.

Unit mới có 13 ca, toàn bộ regression local 246/246 đạt với hai tiến trình; TypeScript và lint tệp sửa đạt. 78/78 integration và build trong bảng trên là của bản tính năng trước tối ưu; cần CI đúng SHA bổ sung để xác minh thay đổi cuối. Máy hết dung lượng ổ C và Docker dừng; lượt đo thứ hai chưa hoàn tất/dọn, được ghi rõ trong biên bản, không thay bằng DB thật.

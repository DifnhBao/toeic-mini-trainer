import { z } from "zod";

// Product vocabulary, not a TOEIC proficiency scale or automatic classifier.
export const skillTaxonomy = [
  { key: "listen-picture", name: "Nghe: mô tả hình", parts: [1], guide: "Nhận diện người, vật, hành động hoặc vị trí được mô tả trong hình." },
  { key: "listen-response", name: "Nghe: chọn lời đáp", parts: [2], guide: "Hiểu câu hỏi/phát biểu và chọn lời đáp phù hợp; không chỉ dựa vào từ trùng âm." },
  { key: "listen-detail", name: "Nghe: chi tiết", parts: [3, 4], guide: "Tìm thông tin cụ thể được nói: ai, ở đâu, thời điểm, số lượng hoặc hành động." },
  { key: "listen-main", name: "Nghe: ý chính", parts: [3, 4], guide: "Xác định chủ đề, mục đích hoặc tình huống chung của đoạn nghe." },
  { key: "listen-inference", name: "Nghe: suy luận", parts: [3, 4], guide: "Kết luận từ ngữ cảnh; đáp án không được phát biểu trực tiếp nguyên văn." },
  { key: "grammar-tense", name: "Ngữ pháp: thì động từ", parts: [5, 6], guide: "Trọng tâm là thời gian, thể hoặc dạng chia động từ trong câu." },
  { key: "grammar-word-form", name: "Ngữ pháp: từ loại", parts: [5, 6], guide: "Chọn dạng danh từ, động từ, tính từ hoặc trạng từ theo vị trí và chức năng." },
  { key: "grammar-agreement", name: "Ngữ pháp: hòa hợp chủ vị", parts: [5, 6], guide: "Trọng tâm là sự phù hợp giữa chủ ngữ và động từ." },
  { key: "grammar-connectors", name: "Ngữ pháp: từ nối", parts: [5, 6], guide: "Chọn từ nối theo cấu trúc câu và quan hệ ý nghĩa giữa các mệnh đề." },
  { key: "vocabulary-context", name: "Từ vựng: ngữ cảnh", parts: [5, 6, 7], guide: "Chọn nghĩa/cách kết hợp từ phù hợp với ngữ cảnh, thay vì chỉ xác định từ loại." },
  { key: "read-main", name: "Đọc: ý chính", parts: [6, 7], guide: "Xác định chủ đề hoặc mục đích chung của đoạn đọc." },
  { key: "read-detail", name: "Đọc: chi tiết", parts: [6, 7], guide: "Tìm một thông tin cụ thể được nêu trong tài liệu." },
  { key: "read-inference", name: "Đọc: suy luận", parts: [6, 7], guide: "Kết luận từ bằng chứng trong đoạn đọc; tránh gán nhãn chỉ vì câu khó." },
  { key: "read-reference", name: "Đọc: liên kết trong đoạn", parts: [6, 7], guide: "Xác định đối tượng được nhắc tới, liên kết ý hoặc vị trí câu trong đoạn." },
  { key: "read-cross-text", name: "Đọc: đối chiếu tài liệu", parts: [7], guide: "Cần kết hợp thông tin từ ít nhất hai tài liệu để trả lời." },
] as const;

export const skillTagUpdateSchema = z.object({
  keys: z.array(z.string().min(1).max(40)).max(5),
  expectedTagIds: z.array(z.string().uuid()).max(100),
  reason: z.string().trim().min(5).max(500),
}).strict().superRefine((value, context) => {
  if (new Set(value.keys).size !== value.keys.length || value.keys.some(key => !skillTaxonomy.some(tag => tag.key === key)))
    context.addIssue({ code: "custom", path: ["keys"], message: "Chọn nhãn hợp lệ, không trùng." });
  if (new Set(value.expectedTagIds).size !== value.expectedTagIds.length)
    context.addIssue({ code: "custom", path: ["expectedTagIds"], message: "Danh sách phiên bản nhãn không hợp lệ." });
});

export function tagsForPart(part: number) {
  return skillTaxonomy.filter(tag => (tag.parts as readonly number[]).includes(part));
}

export function equalTagIds(a: readonly string[], b: readonly string[]) {
  const sorted = [...b].sort();
  return a.length === b.length && [...a].sort().every((id, index) => id === sorted[index]);
}

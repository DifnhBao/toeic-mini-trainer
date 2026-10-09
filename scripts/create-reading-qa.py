"""Create original, local-only Reading acceptance material from checked JSON."""
import hashlib
import json
from pathlib import Path
import shutil
from xml.sax.saxutils import escape
from zipfile import ZIP_DEFLATED, ZipFile

from pypdf import PdfReader
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer

root = Path(__file__).resolve().parents[1]
source = root / "content/qa/original-reading.json"
key_source = root / "content/qa/original-reading-key.json"
data = json.loads(source.read_text(encoding="utf-8"))
key = json.loads(key_source.read_text(encoding="utf-8"))
groups = data["data"]
questions = [question for group in groups for question in group["questions"]]
assert len(questions) == 20 and len(key["answers"]) == 20
assert [len(group["questions"]) for group in groups] == [10, 4, 3, 3]
for number, (question, answer) in enumerate(zip(questions, key["answers"]), 1):
    assert answer["number"] == number
    assert answer["answer"] == question["correctAnswer"]
    assert set(question["options"]) == set("ABCD")
    assert question["correctAnswer"] in question["options"]
    assert question["part"] in (5, 6, 7)
    assert answer["reason"].strip()
for group in groups:
    assert group["group"]["groupType"] == "TEXT"
    if group["questions"][0]["part"] >= 6:
        assert len(group["group"]["passageText"]) > 100

out = root / "output/pdf/reading-qa"
out.mkdir(parents=True, exist_ok=True)
styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="ReadingTitle", fontName="Helvetica-Bold", fontSize=22, leading=26,
                         textColor=colors.HexColor("#0B5D4B"), spaceAfter=8))
styles.add(ParagraphStyle(name="ReadingBody", fontName="Helvetica", fontSize=9.5, leading=13, spaceAfter=8))
styles.add(ParagraphStyle(name="ReadingQuestion", fontName="Helvetica-Bold", fontSize=9.5, leading=12, spaceBefore=7, spaceAfter=3))
styles.add(ParagraphStyle(name="ReadingOptions", fontName="Helvetica", fontSize=9, leading=11.5, spaceAfter=3))
styles.add(ParagraphStyle(name="ReadingKey", fontName="Helvetica", fontSize=10, leading=14, spaceAfter=12))


def paragraph(text, style="ReadingBody"):
    return Paragraph(escape(text).replace("\n", "<br/>"), styles[style])


def footer(canvas, doc):
    canvas.setStrokeColor(colors.HexColor("#DCE7E0"))
    canvas.line(48, 40, A4[0] - 48, 40)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#53685E"))
    canvas.drawString(48, 27, "TOEIC Mini Trainer / Original Reading functional QA")
    canvas.drawRightString(A4[0] - 48, 27, str(doc.page))


story = []
number = 0
for group_index, group in enumerate(groups):
    if group_index:
        story.append(PageBreak())
    part = group["questions"][0]["part"]
    story.append(paragraph(f"Part {part} - Reading practice", "ReadingTitle"))
    story.append(paragraph(f"Questions {number + 1}-{number + len(group['questions'])} / Choose one answer for each question."))
    if group_index == 0:
        story.append(paragraph("Original project-authored material for functional acceptance. Not an official TOEIC test. Answers are in the separate review document."))
    if group["group"].get("passageText"):
        for block in group["group"]["passageText"].split("</p>"):
            if block.strip():
                story.append(Paragraph(block.removeprefix("<p>").replace("<br>", "<br/>"), styles["ReadingBody"]))
        story.append(Spacer(1, 8))
    for question in group["questions"]:
        number += 1
        story.append(paragraph(f"{number}. {question['content']}", "ReadingQuestion"))
        options = [f"({letter}) {value}" for letter, value in question["options"].items()]
        option_text = "\n".join(["     ".join(options[:2]), "     ".join(options[2:])]) if part == 5 else "\n".join(options)
        story.append(paragraph(option_text, "ReadingOptions"))

question_pdf = out / "original-reading-questions.pdf"
SimpleDocTemplate(str(question_pdf), pagesize=A4, rightMargin=48, leftMargin=48,
                  topMargin=42, bottomMargin=55).build(story, onFirstPage=footer, onLaterPages=footer)
assert len(PdfReader(question_pdf).pages) == 4
for page, group in zip(PdfReader(question_pdf).pages, groups):
    text = " ".join(page.extract_text().split())
    for question in group["questions"]:
        assert " ".join(question["content"].split()) in text

key_story = []
for index, answer in enumerate(key["answers"]):
    if index % 10 == 0:
        if index:
            key_story.append(PageBreak())
        key_story.append(paragraph("Answer key and review", "ReadingTitle"))
        key_story.append(paragraph("Compare the extracted text, group boundaries and every answer before publication. This material checks functionality, not proficiency."))
    key_story.append(paragraph(f"{answer['number']}. {answer['answer']} - {answer['reason']}", "ReadingKey"))
key_story.append(paragraph(key["permission"]))
key_pdf = out / "original-reading-answer-key.pdf"
SimpleDocTemplate(str(key_pdf), pagesize=A4, rightMargin=48, leftMargin=48,
                  topMargin=42, bottomMargin=55).build(key_story, onFirstPage=footer, onLaterPages=footer)
assert len(PdfReader(key_pdf).pages) == 2

shutil.copyfile(source, out / source.name)
shutil.copyfile(key_source, out / key_source.name)
(out / "HUONG-DAN.txt").write_text(
    "BỘ READING NGHIỆM THU - 20 CÂU\n\n"
    "Part 5: câu 1-10; Part 6: 11-14; Part 7: 15-17 và 18-20.\n"
    "Nội dung tự soạn cho dự án, không phải đề ETS hoặc bài đánh giá trình độ.\n"
    "Chưa tải lên, chưa công khai và chưa được nghiệm thu trên điện thoại.\n\n"
    "PDF câu hỏi có 4 trang; đáp án nằm ở PDF riêng để tránh lộ khi luyện.\n"
    "Nếu dùng luồng OCR: ADMIN chọn PDF câu hỏi, kiểm lại đủ 20 câu/4 nhóm,\n"
    "đối chiếu đáp án rồi duyệt/xuất bản. OCR web hiện vẫn dùng provider riêng;\n"
    "gói này không gọi AI, không tính phí và không tự gửi file lên cloud.\n"
    "JSON dùng để đối chiếu và kiểm thử không cần OCR. Trang /admin/import\n"
    "hiện chỉ nhập vào kho riêng ADMIN, KHÔNG tự đưa bài vào Kho bài người học.\n\n"
    "Khi nghiệm thu: người học chọn từng bài từ Kho bài, kiểm đoạn đọc đầy đủ,\n"
    "chọn cả đáp án đúng/sai/bỏ trống, nộp và so điểm, xem lại thứ tự câu.\n"
    "Kiểm lịch sử, đóng/mở app, thử mất mạng/nộp lại và đổi tài khoản.\n"
    "Không đánh dấu đạt dựa riêng vào kiểm thử DB hoặc PDF đọc được.\n",
    encoding="utf-8",
)
files = [question_pdf, key_pdf, out / source.name, out / key_source.name, out / "HUONG-DAN.txt"]
manifest = {"questionCount": 20, "groupSizes": [10, 4, 3, 3], "humanAcceptance": "pending",
            "files": [{"name": file.name, "sizeBytes": file.stat().st_size,
                       "sha256": hashlib.sha256(file.read_bytes()).hexdigest()} for file in files]}
manifest_file = out / "manifest.json"
manifest_file.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
archive = out / "original-reading-acceptance.zip"
with ZipFile(archive, "w", ZIP_DEFLATED) as bundle:
    for file in files + [manifest_file]:
        bundle.write(file, file.name)
with ZipFile(archive) as bundle:
    assert bundle.testzip() is None and len(bundle.namelist()) == 6
print(json.dumps({"questions": 20, "groups": 4, "questionPages": 4, "keyPages": 2, "zip": str(archive)}, ensure_ascii=False))

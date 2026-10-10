from pathlib import Path
from xml.sax.saxutils import escape
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle, Image
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from PIL import Image as PILImage, ImageDraw, ImageFont
from pypdf import PdfReader

root = Path(__file__).resolve().parents[1]
out = root / 'output/pdf'; out.mkdir(parents=True, exist_ok=True)
pack = root / 'Test/qa-content'; pack.mkdir(parents=True, exist_ok=True)
styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name='Brand', fontName='Helvetica-Bold', fontSize=23, leading=28, textColor=colors.HexColor('#0B5D4B'), spaceAfter=8))
styles.add(ParagraphStyle(name='CopyQA', fontName='Helvetica', fontSize=10, leading=13, spaceAfter=7))
styles.add(ParagraphStyle(name='QuestionQA', fontName='Helvetica-Bold', fontSize=9.5, leading=12, spaceBefore=7, spaceAfter=3))
styles.add(ParagraphStyle(name='OptionsQA', fontName='Helvetica', fontSize=9, leading=11.5))
styles.add(ParagraphStyle(name='SectionQA', fontName='Helvetica-Bold', fontSize=12, leading=16, textColor=colors.HexColor('#0B5D4B'), spaceBefore=11, spaceAfter=5))

img = PILImage.new('RGB', (1000, 300), '#F4F7F5'); draw = ImageDraw.Draw(img)
font = ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf', 24)
bold = ImageFont.truetype('C:/Windows/Fonts/segoeuib.ttf', 26)
for box, label in [((40, 45, 310, 230), 'ROOM A'), ((365, 45, 635, 230), 'ROOM B'), ((690, 45, 960, 230), 'RECEPTION')]:
    draw.rounded_rectangle(box, 16, fill='white', outline='#0B5D4B', width=4)
    draw.text((box[0]+55, box[1]+70), label, fill='#173F35', font=bold)
draw.text((740, 250), 'East entrance >', fill='#173F35', font=font)
image_path = pack / 'office-plan.png'; img.save(image_path)

story = []
def p(text, style='CopyQA'): return Paragraph(escape(text).replace('\n', '<br/>'), styles[style])
def section(text): story.append(p(text, 'SectionQA'))
def q(number, stem, options):
    story.append(p(f'{number}. {stem}', 'QuestionQA'))
    story.append(p('\n'.join(f'({letter}) {text}' for letter, text in zip('ABCD', options)), 'OptionsQA'))

story.append(p('Original practice set', 'Brand'))
story.append(p('Functional QA / 10 questions / listening, passage and image'))
story.append(p('Original project-authored material. Not an official TOEIC test. Intended for import, media playback and scoring checks only. Answer key and transcripts are on page 3.'))
section('Part 3 - Conversation / Questions 1-3')
story.append(p('Use original-listening.wav. The first conversation concerns a product demonstration.'))
q(1, 'When will the product demonstration take place?', ['Tuesday morning', 'Wednesday afternoon', 'Thursday morning', 'Friday afternoon'])
q(2, 'What will Maya update?', ['An invitation', 'A price list', 'A security code', 'A customer survey'])
q(3, 'What does Daniel agree to check?', ['The air conditioner', 'The projector', 'The delivery truck', 'The reception desk'])
section('Part 4 - Announcement / Questions 4-5')
q(4, 'Why will the reception desk close early?', ['A meeting has been cancelled', 'A shipment has arrived', 'A new employee is starting', 'The security system is being upgraded'])
q(5, 'What should visitors use after 3 p.m. on Friday?', ['The west parking lot', 'The east entrance', 'The staff cafeteria', 'The second-floor elevator'])

story.append(PageBreak())
story.append(p('Reading and workplace plan', 'Brand'))
section('Part 7 - Email / Questions 6-8')
story.append(p('To: Workshop participants\nSubject: Wednesday training update\n\nOur inventory workshop will begin at 9:00 a.m. on Wednesday. The session has moved from Room A to Room B because Room A needs repairs. Please bring your laptop and the stock report sent yesterday. The workshop ends at 11:30 a.m.; lunch is optional and starts at noon. Visitors should enter through the east entrance, next to reception. Room B is between Room A and reception, as shown in the plan below.\n\nTraining coordinator'))
story.append(Image(str(image_path), width=400, height=120))
q(6, 'Why has the workshop moved to another room?', ['More visitors have registered', 'The trainer will arrive late', 'Room A needs repairs', 'Lunch has been cancelled'])
q(7, 'What should participants bring?', ['A laptop and a stock report', 'A projector and a receipt', 'A visitor badge and lunch', 'An invitation and a security form'])
q(8, 'Which room is between Room A and reception?', ['The cafeteria', 'The storage room', 'The east entrance', 'Room B'])
section('Part 5 - Incomplete sentences / Questions 9-10')
q(9, 'Please submit the final report _____ Friday.', ['at', 'by', 'onwards', 'into'])
q(10, 'The new software helps employees work more _____.', ['efficient', 'efficiency', 'efficiently', 'efficiencies'])

story.append(PageBreak())
story.append(p('Answer key and transcripts', 'Brand'))
story.append(p('Review extracted questions and answer keys before importing. The generated audio uses an offline synthetic English voice; it checks playback behavior, not examination audio quality.'))
data = [['Question', 'Part', 'Answer']] + [[str(n), str(part), answer] for n, part, answer in [(1,3,'C'),(2,3,'A'),(3,3,'B'),(4,4,'D'),(5,4,'B'),(6,7,'C'),(7,7,'A'),(8,7,'D'),(9,5,'B'),(10,5,'C')]]
table = Table(data, colWidths=[100,100,100], hAlign=TA_LEFT)
table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#0B5D4B')),('TEXTCOLOR',(0,0),(-1,0),colors.white),('FONTNAME',(0,0),(-1,0),'Helvetica-Bold'),('FONTNAME',(0,1),(-1,-1),'Helvetica'),('FONTSIZE',(0,0),(-1,-1),10),('BOTTOMPADDING',(0,0),(-1,-1),5),('TOPPADDING',(0,0),(-1,-1),5),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.HexColor('#EFF5F1'),colors.white])]))
story.append(table)
section('Part 3 transcript')
conversation = 'Maya: Hi Daniel, is the product demonstration still scheduled for Tuesday?\nDaniel: The client asked to move it to Thursday at ten in the morning. Room B is available then.\nMaya: Great. I will update the invitation. Could you check the projector before they arrive?\nDaniel: Of course. I will test it on Wednesday afternoon.'
story.append(p(conversation))
section('Part 4 transcript')
announcement = 'Attention staff. The reception desk will close at three p.m. on Friday while the security system is upgraded. Visitors arriving after three should use the east entrance and call extension two one zero. Normal reception service will resume on Monday morning.'
story.append(p(announcement))
story.append(Spacer(1,8))
story.append(p('Permission: the project may use, modify and distribute this original QA text and diagram. No third-party examination questions or recordings were copied. Synthetic voice output is provided for internal functional testing.'))

def footer(canvas, doc):
    canvas.setStrokeColor(colors.HexColor('#DCE7E0')); canvas.line(48,40,A4[0]-48,40)
    canvas.setFont('Helvetica',8); canvas.setFillColor(colors.HexColor('#53685E'))
    canvas.drawString(48,27,'TOEIC Mini Trainer / Original functional QA / 08 Oct 2026')
    canvas.drawRightString(A4[0]-48,27,f'{doc.page}')

output = out / 'original-functional-qa.pdf'
SimpleDocTemplate(str(output), pagesize=A4, rightMargin=48, leftMargin=48, topMargin=42, bottomMargin=55).build(story, onFirstPage=footer, onLaterPages=footer)
reader = PdfReader(str(output))
assert len(reader.pages) == 3, f'Unexpected page count: {len(reader.pages)}'
text = '\n'.join(page.extract_text() for page in reader.pages)
for number in range(1,11): assert f'{number}.' in text
(pack / 'original-functional-qa.pdf').write_bytes(output.read_bytes())
speech = 'Questions one to three refer to the following conversation. ' + conversation.replace('\n',' ') + ' Questions four and five refer to the following announcement. ' + announcement
(pack / 'audio-script.txt').write_text(speech, encoding='utf-8')
print('Created and text-checked 3-page original QA PDF and office-plan image.')

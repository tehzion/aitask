from pathlib import Path
from xml.sax.saxutils import escape
import re
from reportlab.pdfgen import canvas
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfbase.ttfonts import TTFont
root=Path('/Users/user/Downloads/aitask-master')
pdfmetrics.registerFont(UnicodeCIDFont('STSong-Light'))
font=Path('/Library/Fonts/Arial Unicode.ttf')
if not font.exists(): font=Path('/System/Library/Fonts/Supplemental/Arial Unicode.ttf')
if font.exists():
    pdfmetrics.registerFont(TTFont('Bilingual',str(font)))
    cjk='Bilingual'
else: cjk='STSong-Light'
ink=colors.HexColor('#182B3B'); muted=colors.HexColor('#546574'); accent=colors.HexColor('#167A75')
styles={}
for lang,f in [('en','Helvetica'),('zh',cjk)]:
    wrap='CJK' if lang=='zh' else 'LTR'
    styles[lang]={
      'title':ParagraphStyle(lang+'title',fontName=f,fontSize=23,leading=31,textColor=ink,spaceAfter=15,wordWrap=wrap),
      'h2':ParagraphStyle(lang+'h2',fontName=f,fontSize=15,leading=21,textColor=accent,spaceBefore=13,spaceAfter=8,keepWithNext=True,wordWrap=wrap),
      'h3':ParagraphStyle(lang+'h3',fontName=f,fontSize=11.5,leading=17,textColor=ink,spaceBefore=10,spaceAfter=5,keepWithNext=True,wordWrap=wrap),
      'body':ParagraphStyle(lang+'body',fontName=f,fontSize=9.5,leading=12.5,textColor=ink,spaceAfter=5,wordWrap=wrap),
      'cell':ParagraphStyle(lang+'cell',fontName=f,fontSize=8.3,leading=11.6,textColor=ink,wordWrap=wrap),
      'head':ParagraphStyle(lang+'head',fontName=f,fontSize=8.8,leading=13,textColor=colors.white,wordWrap=wrap),
    }
def clean(t):
    t=t.replace('—','-').replace('–','-').replace('\u2011','-')
    t=escape(t)
    return re.sub(r'\*\*(.*?)\*\*',r'<b>\1</b>',t) if cjk!='STSong-Light' else t.replace('**','')
flow=[]
for lang,name in [('en','aitask-v3-client-report-2026-10-09.md'),('zh','aitask-v3-client-report-zh-CN-2026-10-09.md')]:
    if flow: flow.append(PageBreak())
    st=styles[lang]; lines=(root/'docs'/name).read_text().splitlines(); i=0
    while i<len(lines):
      line=lines[i].strip()
      if not line: i+=1; continue
      if line.startswith('|'):
        rows=[]
        while i<len(lines) and lines[i].strip().startswith('|'):
          row=[x.strip() for x in lines[i].strip().strip('|').split('|')]
          if not all(re.fullmatch(r'[:\- ]+',x) for x in row): rows.append(row)
          i+=1
        data=[[Paragraph(clean(x),st['head' if n==0 else 'cell']) for x in row] for n,row in enumerate(rows)]
        t=Table(data,colWidths=[105,226,160],repeatRows=1,hAlign='LEFT')
        t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),ink),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.HexColor('#F1F6F7'),colors.white]),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),9),('RIGHTPADDING',(0,0),(-1,-1),9),('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6),('LINEBELOW',(0,0),(-1,0),1,accent)]))
        flow.extend([t,Spacer(1,8)]); continue
      if line.startswith('# '): flow.append(Paragraph(clean(line[2:]),st['title']))
      elif line.startswith('## '): flow.append(Paragraph(clean(line[3:]),st['h2']))
      elif line.startswith('### '): flow.append(Paragraph(clean(line[4:]),st['h3']))
      elif line.startswith('- ') or re.match(r'^\d+\. ',line):
        text=line; i+=1
        while i<len(lines) and lines[i].startswith('  '): text+=' '+lines[i].strip(); i+=1
        flow.append(Paragraph(clean(text),st['body'])); continue
      else:
        text=line; i+=1
        while i<len(lines) and lines[i].strip() and not lines[i].startswith(('#','|','- ')) and not re.match(r'^\d+\. ',lines[i]): text+=' '+lines[i].strip(); i+=1
        flow.append(Paragraph(clean(text),st['body'])); continue
      i+=1
out=root/'output/pdf/aitask-v3-client-report-en-zh-2026-10-09.pdf'
def footer(c,doc):
    c.setFont('Helvetica',8); c.setFillColor(muted)
    c.drawString(52,28,'AiTask v3.0 | Client Feature & Improvement Report | 09 Oct 2026')
    c.drawRightString(A4[0]-52,28,str(doc.page))
doc=SimpleDocTemplate(str(out),pagesize=A4,rightMargin=52,leftMargin=52,topMargin=36,bottomMargin=40,title='AiTask v3.0 - English and Simplified Chinese Client Report',author='AiTask')
doc.build(flow,onFirstPage=footer,onLaterPages=footer)
print(out)

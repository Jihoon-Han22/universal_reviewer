#!/usr/bin/env python
"""시험성적서(cert) 골든 픽스처 생성기.

golden/certs/P01.pdf ... P13.pdf  (digital PDF, reportlab)
                 + P01.png ...     (pypdfium2 로 1페이지를 scale 2.0 래스터화)
                 + P01.json ...    (ground truth)
실행: uv run python golden/gen_certs.py   (멱등 - 항상 덮어쓴다)
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pypdfium2 as pdfium
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.platypus import (PageBreak, Paragraph, SimpleDocTemplate, Spacer,
                                Table, TableStyle)

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

OUT = Path(__file__).resolve().parent / "certs"

# --- CJK 폰트 (reportlab 기본 동봉 CID 폰트) --------------------------------- #
FONT = None
for _fid in ("HYSMyeongJo-Medium", "HYGothic-Medium"):
    try:
        pdfmetrics.registerFont(UnicodeCIDFont(_fid))
        FONT = _fid
        break
    except Exception:
        continue
if FONT is None:
    raise RuntimeError("한글 CID 폰트를 등록할 수 없습니다 (HYSMyeongJo-Medium / HYGothic-Medium)")

TITLE = ParagraphStyle("t", fontName=FONT, fontSize=18, leading=24, alignment=1)
BODY = ParagraphStyle("b", fontName=FONT, fontSize=9, leading=13)
SMALL = ParagraphStyle("s", fontName=FONT, fontSize=8, leading=11)
RIGHT = ParagraphStyle("r", fontName=FONT, fontSize=9, leading=13, alignment=2)

GREY = colors.Color(0.88, 0.88, 0.88)

# (시험항목, 결과, 단위)
BASIC = [
    ("산화마그네슘", "2.8", "%"),
    ("염화물", "0.018", "%"),
    ("강열감량", "1.2", "%"),
    ("비표면적", "4320", "cm2/g"),
    ("활성도지수", "92", "%"),
]


# --------------------------------------------------------------------------- #
# building blocks
# --------------------------------------------------------------------------- #
def tstyle(header_rows=1):
    return TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), FONT),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.black),
        ("BACKGROUND", (0, 0), (-1, header_rows - 1), GREY),
        ("ALIGN", (1, header_rows), (-1, -1), "CENTER"),
        ("ALIGN", (0, 0), (-1, header_rows - 1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ])


def meta_block(cert_no, width=170 * mm):
    data = [["성적서번호", cert_no, "시험일자", "2026-09-01"],
            ["시 료 명", "고로슬래그 미분말", "제 조 사", "○○산업(주)"],
            ["의 뢰 자", "△△건설(주)", "규    격", "KS F 2563"]]
    w = width / 4
    t = Table(data, colWidths=[w * 0.7, w * 1.3, w * 0.7, w * 1.3])
    t.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), FONT),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.black),
        ("BACKGROUND", (0, 0), (0, -1), GREY),
        ("BACKGROUND", (2, 0), (2, -1), GREY),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    return t


def header_story(cert_no, width=170 * mm):
    return [Paragraph("시 험 성 적 서", TITLE), Spacer(1, 6 * mm),
            meta_block(cert_no, width), Spacer(1, 6 * mm)]


def table3(rows, width=170 * mm, header=("시험항목", "결과", "단위")):
    data = [list(header)] + [[a, b, c] for a, b, c in rows]
    t = Table(data, colWidths=[width * 0.5, width * 0.3, width * 0.2], repeatRows=1)
    t.setStyle(tstyle())
    return t


def fields(rows):
    return [{"item": a, "value": b, "unit": c} for a, b, c in rows]


def gt(pid, desc, cert_no, flds, corrupt=False):
    return {"id": pid, "desc": desc, "cert_no": cert_no,
            "fields": flds, "corrupt_fixture": corrupt}


def rasterize(pdf_path, png_path, scale=2.0):
    pdf = pdfium.PdfDocument(str(pdf_path))
    try:
        n = len(pdf)
        pdf[0].render(scale=scale).to_pil().save(png_path)
    finally:
        pdf.close()
    return n


def emit(g, story, pagesize=A4, on_first=None):
    OUT.mkdir(parents=True, exist_ok=True)
    pdf_path = OUT / f"{g['id']}.pdf"
    png_path = OUT / f"{g['id']}.png"
    json_path = OUT / f"{g['id']}.json"
    doc = SimpleDocTemplate(str(pdf_path), pagesize=pagesize,
                            leftMargin=20 * mm, rightMargin=20 * mm,
                            topMargin=18 * mm, bottomMargin=18 * mm,
                            title=f"시험성적서 {g['cert_no']}")
    if on_first:
        doc.build(story, onFirstPage=on_first, onLaterPages=on_first)
    else:
        doc.build(story)
    pages = rasterize(pdf_path, png_path)
    json_path.write_text(json.dumps(g, ensure_ascii=False, indent=2) + "\n",
                         encoding="utf-8")
    print(f"[certs]    {pdf_path.name}  pages={pages}  cert_no={g['cert_no']}  "
          f"fields={len(g['fields'])}  corrupt={g['corrupt_fixture']}  :: {g['desc']}")


# --------------------------------------------------------------------------- #
# P01 ~ P13
# --------------------------------------------------------------------------- #
def p01():
    s = header_story("2026-0891")
    s.append(table3(BASIC))
    emit(gt("P01", "기본 3열 표 (시험항목/결과/단위)", "2026-0891", fields(BASIC)), s)


def p02():
    printed = [(a, f"{b} {c}", "") for a, b, c in BASIC]
    data = [["시험항목", "결과"]] + [[a, b] for a, b, _ in printed]
    t = Table(data, colWidths=[100 * mm, 70 * mm], repeatRows=1)
    t.setStyle(tstyle())
    s = header_story("2026-0892")
    s.append(t)
    emit(gt("P02", "단위가 결과 셀 안에 병합됨 (\"2.8 %\")", "2026-0892", fields(BASIC)), s)


def p03():
    rows = [("산화마그네슘", "2.8"), ("염화물", "0.018"),
            ("강열감량", "1.2"), ("활성도지수", "92")]
    data = [["시험항목", "결과(%)"]] + [list(r) for r in rows]
    t = Table(data, colWidths=[110 * mm, 60 * mm], repeatRows=1)
    t.setStyle(tstyle())
    s = header_story("2026-0893")
    s.append(t)
    emit(gt("P03", "단위가 헤더에만 있음 (\"결과(%)\"), 단위 열 없음", "2026-0893",
            fields([(a, b, "%") for a, b in rows])), s)


def p04():
    chem = [("산화마그네슘", "2.8", "%"), ("염화물", "0.018", "%"), ("강열감량", "1.2", "%")]
    phys = [("비표면적", "4320", "cm2/g"), ("밀도", "2.91", "g/cm3"),
            ("압축강도", "28.4", "MPa")]
    s = header_story("2026-0894")
    s.append(Paragraph("1. 화학성분", BODY))
    s.append(Spacer(1, 2 * mm))
    s.append(table3(chem))
    s.append(Spacer(1, 8 * mm))
    s.append(Paragraph("2. 물리성능", BODY))
    s.append(Spacer(1, 2 * mm))
    s.append(table3(phys))
    emit(gt("P04", "한 페이지에 표 2개 (화학성분 + 물리성능)", "2026-0894",
            fields(chem + phys)), s)


def p05():
    rows = [("산화마그네슘", "2.8", "%", "KS L 5405"),
            ("염화물", "0.018", "%", "KS L 5405"),
            ("비표면적", "4320", "cm2/g", "KS F 2563"),
            ("활성도지수", "92", "%", "KS F 2563"),
            ("압축강도", "28.4", "MPa", "KS F 2405")]
    data = [["시험항목", "시험방법", "결과", "단위"]] + \
           [[a, m, v, u] for a, v, u, m in rows]
    t = Table(data, colWidths=[55 * mm, 50 * mm, 40 * mm, 25 * mm], repeatRows=1)
    t.setStyle(tstyle())
    s = header_story("2026-0895")
    s.append(t)
    emit(gt("P05", "4열 표 (시험방법 열 포함)", "2026-0895",
            fields([(a, v, u) for a, v, u, _ in rows])), s)


def p06():
    rows = [("비표면적", "4,120", "cm2/g"),
            ("최대하중", "28,000", "N"),
            ("압축강도", "24.0~26.5", "MPa"),
            ("염화물", "0.018", "%")]
    s = header_story("2026-0896")
    s.append(table3(rows))
    emit(gt("P06", "천단위 구분기호 및 범위 값 포함", "2026-0896", fields(rows)), s)


def p07():
    rows = [("산화마그네슘", "2.8", "%"),
            ("6가크롬", "N.D.", "-"),
            ("납", "불검출", "-"),
            ("카드뮴", "N.D.", "mg/kg")]
    s = header_story("2026-0897")
    s.append(table3(rows))
    emit(gt("P07", "N.D. / 불검출 값 포함", "2026-0897", fields(rows)), s)


def _stamp(canvas, doc):
    canvas.saveState()
    w, h = doc.pagesize
    bw, bh = 62 * mm, 24 * mm
    x, y = w - 20 * mm - bw, 22 * mm
    canvas.setLineWidth(0.6)
    canvas.rect(x, y, bw, bh)
    canvas.setFont(FONT, 8)
    canvas.drawString(x + 3 * mm, y + bh - 8 * mm, "시험기관 : 한국건설시험원")
    canvas.drawString(x + 3 * mm, y + bh - 14 * mm, "시 험 원 : 이○○      (인)")
    canvas.drawString(x + 3 * mm, y + bh - 20 * mm, "책 임 자 : 최○○      (인)")
    canvas.restoreState()


def p08():
    s = header_story("2026-0898")
    s.append(table3(BASIC))
    emit(gt("P08", "우측 하단 직인(텍스트 블록) + 시험원 성명", "2026-0898",
            fields(BASIC)), s, on_first=_stamp)


def p09():
    width = 240 * mm
    s = header_story("2026-0899", width=width)
    s.append(table3(BASIC, width=width))
    emit(gt("P09", "가로(landscape) 페이지", "2026-0899", fields(BASIC)),
         s, pagesize=landscape(A4))


def p10():
    part1 = [("산화마그네슘", "2.8", "%"), ("염화물", "0.018", "%"),
             ("강열감량", "1.2", "%"), ("삼산화황", "0.9", "%")]
    part2 = [("비표면적", "4320", "cm2/g"), ("밀도", "2.91", "g/cm3"),
             ("활성도지수", "92", "%"), ("압축강도", "28.4", "MPa")]
    s = header_story("2026-0900")
    s.append(table3(part1))
    s.append(Spacer(1, 4 * mm))
    s.append(Paragraph("(다음 장에 계속)", RIGHT))
    s.append(PageBreak())
    s.append(Paragraph("시 험 성 적 서 (계속)", TITLE))
    s.append(Spacer(1, 6 * mm))
    s.append(table3(part2))
    emit(gt("P10", "2페이지, 표가 페이지에 걸쳐 분할됨", "2026-0900",
            fields(part1 + part2)), s)


def p11():
    rows = [("산화마그네슘(MgO)", "2.8", "%"),
            ("염화물(Cl-)", "0.018", "%"),
            ("강열감량(Ig.loss)", "1.2", "%"),
            ("비표면적(Blaine)", "4320", "cm2/g")]
    s = header_story("2026-0901")
    s.append(table3(rows))
    emit(gt("P11", "항목명에 괄호 기호 포함 (\"산화마그네슘(MgO)\")", "2026-0901",
            fields(rows)), s)


def p12():
    width = 170 * mm
    banner = Table([["문서번호 : TR-2026-0902", "개정 : 2", "페이지 : 1 / 1"]],
                   colWidths=[width * 0.5, width * 0.25, width * 0.25])
    banner.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), FONT),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.black),
        ("BACKGROUND", (0, 0), (-1, -1), GREY),
    ]))
    data = [["시 험 결 과", "", ""], ["시험항목", "결과", "단위"]] + \
           [[a, b, c] for a, b, c in BASIC]
    t = Table(data, colWidths=[width * 0.5, width * 0.3, width * 0.2], repeatRows=2)
    st = tstyle(header_rows=2)
    st.add("SPAN", (0, 0), (-1, 0))
    t.setStyle(st)

    s = [banner, Spacer(1, 4 * mm)] + header_story("2026-0902")
    s.append(t)
    s.append(Spacer(1, 6 * mm))
    s.append(Paragraph("※ 본 성적서는 시험 의뢰된 시료에 한하여 유효하며, "
                       "일부 발췌 사용을 금합니다.", SMALL))
    s.append(Paragraph("※ 문의 : 한국건설시험원 품질시험팀 (02-000-0000)", SMALL))
    emit(gt("P12", "장식용 헤더 행 추가 + 하단 각주", "2026-0902", fields(BASIC)), s)


def p13():
    printed = [("산화마그네슘", "2.8", "%"),
               ("염화물", "0.025", "%"),        # 인쇄값 0.025
               ("강열감량", "1.2", "%"),
               ("비표면적", "4320", "cm2/g"),
               ("활성도지수", "92", "%")]
    truth = [(a, "0.015" if a == "염화물" else b, c) for a, b, c in printed]
    s = header_story("2026-0903")
    s.append(table3(printed))
    emit(gt("P13", "P01과 동일하나 정답 json 의 염화물 값이 인쇄값과 다름 "
                   "(인쇄 0.025 / json 0.015) - grounding 검증용",
            "2026-0903", fields(truth), corrupt=True), s)


BUILDERS = [p01, p02, p03, p04, p05, p06, p07, p08, p09, p10, p11, p12, p13]


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for fn in BUILDERS:
        fn()
    print(f"[certs]    done - {len(BUILDERS)} pdf + {len(BUILDERS)} png + "
          f"{len(BUILDERS)} json in {OUT}  (font={FONT})")


if __name__ == "__main__":
    main()

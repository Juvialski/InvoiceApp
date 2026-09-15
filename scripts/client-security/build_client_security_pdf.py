from __future__ import annotations

import html
import re
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.lib.utils import ImageReader
from reportlab.platypus import Flowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "docs" / "client-facing" / "HYDROQUALISENSE_CLIENT_SECURITY_OVERVIEW.md"
OUTPUT = ROOT / "artifacts" / "client-security" / "Hydroqualisense_Client_Security_Overview.pdf"


def ascii_safe(value: str) -> str:
    replacements = {
        "\u2013": "-",
        "\u2014": "-",
        "\u2011": "-",
        "\u201c": '"',
        "\u201d": '"',
        "\u2018": "'",
        "\u2019": "'",
        "\u2022": "-",
    }
    for source, target in replacements.items():
        value = value.replace(source, target)
    return value.encode("ascii", "replace").decode("ascii")


def markdown_text(value: str) -> str:
    value = ascii_safe(value.strip())
    value = html.escape(value, quote=False)
    value = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", value)
    value = re.sub(r"`([^`]+)`", r"<font name='Courier'>\1</font>", value)
    return value


class Rule(Flowable):
    def __init__(self, width: float, color: colors.Color = colors.HexColor("#dbe4f0")):
        super().__init__()
        self.width = width
        self.height = 8
        self.color = color

    def draw(self):
        self.canv.setStrokeColor(self.color)
        self.canv.setLineWidth(0.7)
        self.canv.line(0, 4, self.width, 4)


class Screenshot(Flowable):
    def __init__(self, path: Path, width: float, crop_top: float = 0.0, crop_bottom: float = 1.0):
        super().__init__()
        self.path = path
        self.width = width
        self.reader = ImageReader(str(path))
        image_width, image_height = self.reader.getSize()
        self.scale = width / image_width
        self.image_height = image_height * self.scale
        self.crop_bottom = crop_bottom
        self.height = (crop_bottom - crop_top) * self.image_height
        self.crop_top = crop_top

    def wrap(self, avail_width, avail_height):
        return self.width, self.height

    def draw(self):
        self.canv.saveState()
        self.canv.setStrokeColor(colors.HexColor("#cbd5e1"))
        self.canv.setLineWidth(0.6)
        self.canv.rect(0, 0, self.width, self.height, stroke=1, fill=0)
        self.canv.clipPath(self.canv.beginPath()) if False else None
        self.canv.saveState()
        self.canv.rect(0, 0, self.width, self.height, stroke=0, fill=0)
        self.canv.clipPath(self._clip_path())
        image_y = -(1 - self.crop_bottom) * self.image_height
        self.canv.drawImage(self.reader, 0, image_y, width=self.width, height=self.image_height, preserveAspectRatio=True, mask="auto")
        self.canv.restoreState()
        self.canv.restoreState()

    def _clip_path(self):
        path = self.canv.beginPath()
        path.rect(0, 0, self.width, self.height)
        return path


def table_from_lines(lines: list[str], styles: dict[str, ParagraphStyle], width: float) -> Table:
    rows: list[list[Paragraph]] = []
    for line in lines:
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        rows.append([Paragraph(markdown_text(cell), styles["table"]) for cell in cells])
    columns = max(len(row) for row in rows)
    if columns == 2:
        widths = [2.05 * inch, width - 2.05 * inch]
    elif columns == 3:
        widths = [1.45 * inch, 1.9 * inch, width - 3.35 * inch]
    else:
        widths = [width / columns] * columns
    table = Table(rows, colWidths=widths, repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e8eef8")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#16243b")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.45, colors.HexColor("#cbd5e1")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
    ]))
    return table


def page_story(source_page: str, styles: dict[str, ParagraphStyle], width: float):
    story: list[Flowable] = []
    lines = [ascii_safe(line.rstrip()) for line in source_page.splitlines()]
    index = 0
    while index < len(lines):
        line = lines[index].strip()
        if not line or line == "---":
            index += 1
            continue
        screenshot_match = re.match(r"^!\[([^\]]+)\]\(([^)]+)\)$", line)
        if screenshot_match:
            gallery: list[tuple[str, Path]] = []
            scan_index = index
            while scan_index < len(lines):
                if not lines[scan_index].strip():
                    scan_index += 1
                    continue
                gallery_match = re.match(r"^!\[([^\]]+)\]\(([^)]+)\)$", lines[scan_index].strip())
                if not gallery_match:
                    break
                gallery_caption, gallery_relative_path = gallery_match.groups()
                gallery_path = ROOT / gallery_relative_path.replace("/", "\\")
                if not gallery_path.exists():
                    raise SystemExit(f"Missing screenshot asset: {gallery_path}")
                gallery.append((gallery_caption, gallery_path))
                scan_index += 1
            index = scan_index

            if len(gallery) > 1 and all("client-security\\screenshots" in str(image_path).lower() for _, image_path in gallery):
                columns = 3
                cell_width = (width - 16) / columns
                cells: list[list[Flowable]] = []
                for caption, image_path in gallery:
                    cells.append([
                        Screenshot(image_path, cell_width, crop_top=0.0, crop_bottom=1.0),
                        Spacer(1, 3),
                        Paragraph(markdown_text(caption), styles["caption"]),
                    ])
                gallery_rows = [cells[offset:offset + columns] for offset in range(0, len(cells), columns)]
                if gallery_rows and len(gallery_rows[-1]) < columns:
                    gallery_rows[-1].extend([[] for _ in range(columns - len(gallery_rows[-1]))])
                gallery_table = Table(gallery_rows, colWidths=[cell_width] * columns, hAlign="LEFT")
                gallery_table.setStyle(TableStyle([
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 2),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 2),
                    ("TOPPADDING", (0, 0), (-1, -1), 2),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ]))
                story.extend([Spacer(1, 5), gallery_table, Spacer(1, 5)])
            else:
                for caption, image_path in gallery:
                    screenshot = Screenshot(image_path, width, crop_top=0.0, crop_bottom=1.0)
                    story.extend([Spacer(1, 5), screenshot, Paragraph(markdown_text(caption), styles["caption"]), Spacer(1, 7)])
            continue
        if line.startswith("|") and index + 1 < len(lines) and lines[index + 1].strip().startswith("|") and "---" in lines[index + 1]:
            table_lines = [line]
            index += 1
            while index < len(lines) and lines[index].strip().startswith("|"):
                if "---" not in lines[index]:
                    table_lines.append(lines[index].strip())
                index += 1
            story.extend([Spacer(1, 5), table_from_lines(table_lines, styles, width), Spacer(1, 8)])
            continue
        if line.startswith(">"):
            callout = Paragraph(markdown_text(line[1:].strip()), styles["callout"])
            box = Table([[callout]], colWidths=[width])
            box.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#eef4ff")),
                ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#9db7e8")),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 9),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
            ]))
            story.extend([Spacer(1, 5), box, Spacer(1, 8)])
            index += 1
            continue
        heading = re.match(r"^(#{1,3})\s+(.+)$", line)
        if heading:
            level = len(heading.group(1))
            style_name = "title" if level == 1 else "h2" if level == 2 else "h3"
            story.append(Paragraph(markdown_text(heading.group(2)), styles[style_name]))
            if level == 2:
                story.append(Rule(width))
            index += 1
            continue
        if line.startswith("- "):
            story.append(Paragraph(markdown_text("- " + line[2:]), styles["bullet"]))
            index += 1
            continue
        if re.match(r"^\d+\.\s+", line):
            story.append(Paragraph(markdown_text(line), styles["numbered"]))
            index += 1
            continue
        if line.startswith("**") and line.endswith("**"):
            story.append(Paragraph(markdown_text(line), styles["meta"]))
            index += 1
            continue
        # Join ordinary wrapped Markdown lines into one readable paragraph.
        paragraph_lines = [line]
        index += 1
        while index < len(lines):
            next_line = lines[index].strip()
            if not next_line or next_line.startswith(("#", "- ", ">", "|")):
                break
            paragraph_lines.append(next_line)
            index += 1
        story.append(Paragraph(markdown_text(" ".join(paragraph_lines)), styles["body"]))
        story.append(Spacer(1, 4))
    return story


def draw_brand(canvas, doc):
    canvas.saveState()
    page_width, page_height = letter
    canvas.setFillColor(colors.HexColor("#14213d"))
    canvas.rect(0, page_height - 0.48 * inch, page_width, 0.48 * inch, stroke=0, fill=1)
    canvas.setFillColor(colors.HexColor("#80a9ff"))
    canvas.roundRect(0.58 * inch, page_height - 0.37 * inch, 0.18 * inch, 0.18 * inch, 0.04 * inch, stroke=0, fill=1)
    canvas.setFillColor(colors.white)
    canvas.setFont("Helvetica-Bold", 9)
    canvas.drawString(0.86 * inch, page_height - 0.32 * inch, "HYDROQUALISENSE")
    canvas.setFillColor(colors.HexColor("#64748b"))
    canvas.setFont("Helvetica", 7.5)
    canvas.drawRightString(page_width - 0.58 * inch, 0.38 * inch, f"Client Security Overview  |  {doc.page}")
    canvas.setStrokeColor(colors.HexColor("#dbe4f0"))
    canvas.setLineWidth(0.6)
    canvas.line(0.58 * inch, 0.52 * inch, page_width - 0.58 * inch, 0.52 * inch)
    canvas.restoreState()


def main():
    source = SOURCE.read_text(encoding="utf-8")
    pages = source.split("<!-- PAGEBREAK -->")
    if len(pages) != 7:
        raise SystemExit(f"Expected 7 source pages, found {len(pages)}")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    styles = getSampleStyleSheet()
    content_width = letter[0] - 1.16 * inch
    custom = {
        "title": ParagraphStyle("title", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=20, leading=24, textColor=colors.HexColor("#14213d"), spaceAfter=10, alignment=TA_LEFT),
        "h2": ParagraphStyle("h2", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=15, leading=19, textColor=colors.HexColor("#14213d"), spaceBefore=3, spaceAfter=7),
        "h3": ParagraphStyle("h3", parent=styles["Heading3"], fontName="Helvetica-Bold", fontSize=10.5, leading=14, textColor=colors.HexColor("#31558e"), spaceBefore=6, spaceAfter=4),
        "body": ParagraphStyle("body", parent=styles["BodyText"], fontName="Helvetica", fontSize=9.1, leading=13.2, textColor=colors.HexColor("#334155"), spaceAfter=4),
        "bullet": ParagraphStyle("bullet", parent=styles["BodyText"], fontName="Helvetica", fontSize=8.9, leading=12.6, leftIndent=12, firstLineIndent=-8, textColor=colors.HexColor("#334155"), spaceAfter=3),
        "numbered": ParagraphStyle("numbered", parent=styles["BodyText"], fontName="Helvetica", fontSize=8.9, leading=12.6, leftIndent=16, firstLineIndent=-16, textColor=colors.HexColor("#334155"), spaceAfter=4),
        "meta": ParagraphStyle("meta", parent=styles["BodyText"], fontName="Helvetica-Bold", fontSize=8.5, leading=11, textColor=colors.HexColor("#526581"), spaceAfter=3),
        "callout": ParagraphStyle("callout", parent=styles["BodyText"], fontName="Helvetica-Bold", fontSize=9, leading=13, textColor=colors.HexColor("#1e3a68")),
        "caption": ParagraphStyle("caption", parent=styles["BodyText"], fontName="Helvetica-Oblique", fontSize=7.6, leading=10, textColor=colors.HexColor("#64748b"), spaceAfter=4),
        "table": ParagraphStyle("table", parent=styles["BodyText"], fontName="Helvetica", fontSize=7.8, leading=10.2, textColor=colors.HexColor("#334155")),
    }
    doc = SimpleDocTemplate(
        str(OUTPUT),
        pagesize=letter,
        rightMargin=0.58 * inch,
        leftMargin=0.58 * inch,
        topMargin=0.72 * inch,
        bottomMargin=0.7 * inch,
        title="Hydroqualisense Client Security Overview",
        author="Hydroqualisense",
    )
    story: list[Flowable] = []
    for page_index, page in enumerate(pages):
        story.extend(page_story(page, custom, content_width))
        if page_index < len(pages) - 1:
            from reportlab.platypus import PageBreak
            story.append(PageBreak())
    doc.build(story, onFirstPage=draw_brand, onLaterPages=draw_brand)
    print(f"wrote {OUTPUT}")


if __name__ == "__main__":
    main()

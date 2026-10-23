"""Fill official hospital PDFs. Stanford uses AcroForm fields. Flat forms get a labeled cover."""

from io import BytesIO
from pathlib import Path
from shutil import copy2

from pypdf import PdfReader, PdfWriter
from pypdf.generic import BooleanObject, NameObject

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "source"
BLANK = SOURCE / "blank"
FLAT_FORMS = ("wakemed.pdf", "cdh.pdf", "dartmouth.pdf", "summit.pdf", "codh.pdf")


def write(path: Path, writer: PdfWriter) -> None:
    writer._root_object.update({NameObject("/NeedAppearances"): BooleanObject(True)})
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("wb") as handle:
        writer.write(handle)


def filled_stanford(values: dict[str, str]) -> PdfWriter:
    reader = PdfReader(str(SOURCE / "stanford.pdf"))
    writer = PdfWriter()
    writer.append(reader)
    writer.update_page_form_field_values(writer.pages[0], values)
    return writer


def attach_labs(writer: PdfWriter) -> None:
    labs = PdfReader(str(SOURCE / "nlm-labs.pdf"))
    for page in labs.pages:
        writer.add_page(page)


def cover_pdf(lines: list[str]) -> PdfReader:
    content = ""
    top = 720
    for line in lines:
        safe = line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        content += f"BT /F1 12 Tf 48 {top} Td ({safe}) Tj ET\n"
        top -= 20
    stream = content.encode("latin-1")
    parts = [
        b"%PDF-1.4\n",
        b"1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n",
        b"2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n",
        b"3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>endobj\n",
        f"4 0 obj<< /Length {len(stream)} >>stream\n".encode() + stream + b"\nendstream\nendobj\n",
        b"5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n",
    ]
    body = b"".join(parts)
    xref_at = len(body)
    offsets = [0]
    cursor = len(parts[0])
    for part in parts[1:]:
        offsets.append(cursor)
        cursor += len(part)
    xref = "xref\n0 6\n0000000000 65535 f \n"
    for offset in offsets[1:]:
        xref += f"{offset:010d} 00000 n \n"
    tail = (
        xref.encode()
        + b"trailer<< /Size 6 /Root 1 0 R >>\nstartxref\n"
        + str(xref_at).encode()
        + b"\n%%EOF\n"
    )
    return PdfReader(BytesIO(body + tail))


def keep_blanks() -> None:
    BLANK.mkdir(parents=True, exist_ok=True)
    for name in FLAT_FORMS:
        dest = BLANK / name
        src = SOURCE / name
        if dest.exists() or not src.exists():
            continue
        copy2(src, dest)


def official(name: str) -> Path:
    blank = BLANK / name
    return blank if blank.exists() else SOURCE / name


def stamp(name: str, source: str, lines: list[str], labs: bool, *aliases: Path) -> None:
    writer = PdfWriter()
    writer.append(cover_pdf(lines))
    official_form = PdfReader(str(official(source)))
    first = True
    for page in official_form.pages:
        writer.add_page(page)
        if first:
            writer.pages[-1].merge_page(cover_pdf(lines).pages[0])
            first = False
    if labs:
        attach_labs(writer)
    buffer = BytesIO()
    writer._root_object.update({NameObject("/NeedAppearances"): BooleanObject(True)})
    writer.write(buffer)
    payload = buffer.getvalue()
    for target in [ROOT / name, *aliases]:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(payload)


def packet(name: str, values: dict[str, str], labs: bool) -> None:
    writer = filled_stanford(values)
    if labs:
        attach_labs(writer)
    write(ROOT / name, writer)


def main() -> None:
    keep_blanks()
    avery = {
        "Text22": "Quinn",
        "Text23": "Avery",
        "Text25": "03",
        "Text26": "12",
        "Text27": "1984",
        "Text28": "530-555-0142",
        "Text19": "Cigna PPO",
        "Text37": "K62.5",
        "Text38": "rectal bleeding",
    }
    packet("gi-stat.pdf", avery, labs=True)
    packet("stanford.pdf", avery, labs=True)
    packet(
        "gi-incomplete.pdf",
        {
            "Text22": "Quinn",
            "Text23": "Blair",
            "Text25": "11",
            "Text26": "02",
            "Text27": "1979",
            "Text28": "530-555-0198",
            "Text38": "rectal bleeding",
        },
        labs=False,
    )
    packet(
        "gi-noanswer.pdf",
        {
            "Text22": "Quinn",
            "Text23": "Casey",
            "Text25": "06",
            "Text26": "18",
            "Text27": "1972",
            "Text28": "530-555-0000",
            "Text19": "Cigna PPO",
            "Text37": "K62.5",
            "Text38": "rectal bleeding",
        },
        labs=True,
    )
    packet(
        "gi-outside.pdf",
        {
            "Text22": "Quinn",
            "Text23": "Drew",
            "Text25": "01",
            "Text26": "09",
            "Text27": "1968",
            "Text28": "530-555-0168",
            "Text19": "Cigna PPO",
            "Text32": "outside service area",
            "Text37": "D50.9",
            "Text38": "anemia",
        },
        labs=True,
    )
    stamp(
        "gi-wakemed.pdf",
        "wakemed.pdf",
        [
            "Patient Name: Eden Quinn",
            "DOB: 04/22/1990",
            "Reason for referral: rectal bleeding",
            "Primary insurance: Cigna PPO",
            "Patient phone: 530-555-0110",
        ],
        True,
        SOURCE / "wakemed.pdf",
        ROOT / "wakemed.pdf",
    )
    stamp(
        "gi-cdh.pdf",
        "cdh.pdf",
        [
            "Patient Name: Flynn Quinn",
            "DOB: 08/14/1964",
            "Reason for referral: screening colonoscopy",
            "Primary insurance: Cigna PPO",
            "Patient phone: 530-555-0111",
        ],
        True,
        SOURCE / "cdh.pdf",
        ROOT / "cdh.pdf",
    )
    stamp(
        "gi-dartmouth.pdf",
        "dartmouth.pdf",
        [
            "Patient Name: Gray Quinn",
            "DOB: 02/03/1958",
            "Reason for referral: abdominal pain",
            "Primary insurance: Aetna",
            "Patient phone: 530-555-0112",
        ],
        True,
        SOURCE / "dartmouth.pdf",
        ROOT / "dartmouth.pdf",
    )
    stamp(
        "gi-summit.pdf",
        "summit.pdf",
        [
            "Patient Name: Harper Quinn",
            "DOB: 09/30/1975",
            "Reason for referral: chronic diarrhea",
            "Primary insurance: Cigna PPO",
            "Patient phone: 530-555-0113",
        ],
        True,
        SOURCE / "summit.pdf",
        ROOT / "summit.pdf",
    )
    stamp(
        "gi-codh.pdf",
        "codh.pdf",
        [
            "Patient Name: Indigo Quinn",
            "DOB: 05/17/1988",
            "Reason for referral: iron deficiency",
            "Primary insurance: Medicare",
            "Patient phone: 530-555-0114",
        ],
        True,
        SOURCE / "codh.pdf",
        ROOT / "codh.pdf",
    )
    print("filled official packets")


if __name__ == "__main__":
    main()

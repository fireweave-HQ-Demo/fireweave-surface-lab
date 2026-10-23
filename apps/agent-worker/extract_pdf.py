import base64
import re
from io import BytesIO

from pypdf import PdfReader

PAYERS = ["cigna ppo", "cigna", "aetna", "blue cross", "medicare", "medicaid", "united", "humana"]
STAT = ["rectal bleeding", "hematochezia", "gi bleed", "anemia", "iron deficiency"]
SYMPTOMATIC = ["chronic diarrhea", "ibs", "abdominal pain", "constipation"]
SCREENING = ["screening colonoscopy", "average risk", "routine colonoscopy", "surveillance colonoscopy"]
LABELS = {
    "mi",
    "first",
    "last",
    "name",
    "first name",
    "last name",
    "patient",
    "dob",
    "phone",
    "email",
    "gender",
    "address",
    "code",
    "icd",
    "diagnosis",
    "mm",
    "dd",
    "yyyy",
}


def _pdf_body(raw: bytes) -> bytes:
    end = raw.rfind(b"%%EOF")
    if end == -1:
        return raw
    return raw[: end + 5]


def _clean(value: str) -> str:
    text = re.sub(r"[_\.]{2,}", " ", value)
    return " ".join(text.split()).strip(" :-")


def _field_values(reader: PdfReader) -> dict[str, str]:
    values: dict[str, str] = {}
    fields = reader.get_fields() or {}
    for name, field in fields.items():
        if not field:
            continue
        raw = field.get("/V")
        if raw in (None, "/Off", "Off"):
            continue
        text = _clean(str(raw).lstrip("/"))
        if text:
            values[str(name)] = text
    return values


def _pages(reader: PdfReader) -> list[str]:
    pages = []
    for page in reader.pages:
        pages.append(_clean(page.extract_text() or ""))
    return pages


_STOP = r"dob|date of birth|reason|primary insurance|insurance|patient phone|phone|gender|address|referring|member"


def _labeled(text: str, labels: list[str]) -> str:
    for label in labels:
        match = re.search(rf"{label}\s*[:#]?\s+([A-Za-z0-9 ,.'/-]{{2,80}}?)(?=\s+(?:{_STOP})\b|$)", text, re.I)
        if not match:
            continue
        value = _clean(match.group(1))
        if value and not re.fullmatch(r"[_./-]+", value) and value.lower() not in LABELS:
            return value
    return ""


def _is_person(value: str) -> bool:
    parts = [part for part in value.split() if part]
    if len(parts) < 2:
        return False
    if any(part.lower().strip(".,") in LABELS for part in parts):
        return False
    return all(re.fullmatch(r"[A-Za-z][A-Za-z.'-]{0,30}", part) for part in parts)


def _is_dob(value: str) -> bool:
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        return False
    year = int(value[:4])
    return 1900 <= year <= 2026


def _is_reason(value: str) -> bool:
    low = value.lower()
    if len(low) < 4 or re.search(r"page \d", low) or "please fill" in low:
        return False
    return low not in LABELS and "icd" not in low


def _dob(text: str, fields: dict[str, str]) -> str:
    parts = [fields.get("Text25", ""), fields.get("Text26", ""), fields.get("Text27", "")]
    if all(part.isdigit() for part in parts) and len("".join(parts)) >= 6:
        month, day, year = (part.zfill(2) for part in parts)
        if len(year) == 2:
            year = "19" + year
        built = f"{year}-{month}-{day}"
        return built if _is_dob(built) else ""
    match = re.search(r"\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b", text)
    if match:
        month, day, year = match.group(1).zfill(2), match.group(2).zfill(2), match.group(3)
        if len(year) == 2:
            year = "19" + year
        built = f"{year}-{month}-{day}"
        return built if _is_dob(built) else ""
    labeled = _labeled(text, ["date of birth", "birth date", "dob"])
    return labeled if _is_dob(labeled) else ""


def _name(text: str, fields: dict[str, str]) -> str:
    last = fields.get("Text22", "")
    first = fields.get("Text23", "")
    if first and last:
        combined = f"{first} {last}"
        return combined if _is_person(combined) else ""
    direct = _labeled(text, ["patient name", "patient last name"])
    if _is_person(direct):
        return direct
    first_only = _labeled(text, ["first name", "patient first name"])
    last_only = _labeled(text, ["last name", "patient last name"])
    combined = f"{first_only} {last_only}".strip()
    return combined if _is_person(combined) else ""


def _payer(text: str, fields: dict[str, str]) -> str:
    blob = " ".join([text, *fields.values()]).lower()
    labeled = _labeled(text, ["primary insurance", "health insurance", "insurance", "payer"])
    if labeled:
        return labeled
    for payer in PAYERS:
        if payer in blob:
            return "Cigna PPO" if payer.startswith("cigna") else payer.title()
    return ""


def _reason(text: str, fields: dict[str, str]) -> str:
    labeled = fields.get("Text38") or _labeled(text, ["reason for referral", "diagnosis/symptoms"])
    if _is_reason(labeled):
        return labeled
    diagnosis = fields.get("Text37") or ""
    if _is_reason(diagnosis):
        return diagnosis
    blob = text.lower()
    for token in [*STAT, *SYMPTOMATIC, *SCREENING]:
        if token in blob:
            return token
    return ""


def _sections(pages: list[str], payer: str) -> list[dict]:
    sections = []
    joined = "\n".join(pages).lower()
    for index, page in enumerate(pages, start=1):
        low = page.lower()
        kind = ""
        summary = page[:80]
        if re.search(r"hemoglobin\s+\d", low) or "cbc, platelet" in low or ("complete blood count" in low and "result" in low):
            kind = "labs"
            summary = "Laboratory results"
        elif any(token in low for token in ("health insurance claim", "cms-1500")):
            kind = "insurance"
            summary = "Insurance"
        elif "referral for consult" in low or "referral form" in low or "patient information" in low:
            kind = "referral"
            summary = "Referral form"
        if kind and kind not in {item["kind"] for item in sections}:
            sections.append({"kind": kind, "pageStart": index, "pageEnd": index, "summary": summary})
    if payer and "insurance" not in {item["kind"] for item in sections}:
        sections.append({"kind": "insurance", "pageStart": 1, "pageEnd": 1, "summary": payer})
    if "referral" not in {item["kind"] for item in sections} and "colonoscopy" in joined:
        sections.append({"kind": "referral", "pageStart": 1, "pageEnd": 1, "summary": "Referral form"})
    return sections


def _area(text: str) -> str:
    low = text.lower()
    if "outside service" in low or "out of service" in low or "out of area" in low:
        return "out"
    return "in"


def parse_pdf(raw: bytes, filename: str) -> dict:
    try:
        reader = PdfReader(BytesIO(_pdf_body(raw)))
    except Exception as error:
        raise RuntimeError(f"unreadable packet: {filename}") from error
    fields = _field_values(reader)
    pages = _pages(reader)
    text = "\n".join(pages + list(fields.values()))
    name = _name(text, fields)
    dob = _dob(text, fields)
    reason = _reason(text, fields)
    if not _is_person(name) or not _is_dob(dob) or not _is_reason(reason):
        raise RuntimeError(f"unreadable packet: {filename}")
    payer = _payer(text, fields)
    sections = _sections(pages, payer)
    last = _labeled(text, ["date of last colonoscopy", "last colonoscopy"])
    if not re.search(r"\d{4}", last or ""):
        last = "none"
    return {
        "filename": filename,
        "patientName": name,
        "dob": dob,
        "reason": reason,
        "payer": payer,
        "confidence": 0.94 if payer and any(item["kind"] == "labs" for item in sections) else 0.82,
        "sections": sections,
        "memberId": _labeled(text, ["member id", "policy #", "medical insurance id"]) or fields.get("Text16", ""),
        "phone": fields.get("Text28") or _labeled(text, ["patient phone", "cell phone", "phone"]),
        "serviceArea": _area(text),
        "lastColonoscopy": last,
        "cpt": "45378" if "colonoscopy" in text.lower() else "",
        "diagnosis": fields.get("Text37") or _labeled(text, ["icd 10", "icd", "diagnosis"]),
    }


def parse_pdf_base64(payload: dict) -> dict:
    return parse_pdf(base64.b64decode(payload["pdfBase64"]), payload["filename"])

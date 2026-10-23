"""Build 45 packets from the official hospital forms. No invented layouts."""

from pathlib import Path

from fill_official import attach_labs, filled_stanford, keep_blanks, write, write_flat

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "samples"

FORMS = ("stanford", "wakemed", "cdh", "dartmouth", "summit", "codh")
PEOPLE = [
    ("Maya", "Alvarez", "1986-03-11"),
    ("Noah", "Brooks", "1974-07-19"),
    ("Elena", "Chen", "1991-01-08"),
    ("Rafael", "Das", "1963-11-27"),
    ("Simone", "Ellis", "1980-05-03"),
    ("Owen", "Farouk", "1959-09-14"),
    ("Priya", "Garcia", "1988-12-02"),
    ("Jonah", "Huang", "1971-04-21"),
    ("Camille", "Iyer", "1967-08-09"),
    ("Hector", "Jones", "1955-02-16"),
    ("Iris", "Klein", "1993-06-28"),
    ("Felix", "Lopez", "1978-10-05"),
    ("Nadia", "Moreau", "1962-01-30"),
    ("Oscar", "Nguyen", "1984-09-17"),
    ("Tessa", "Okonkwo", "1976-03-24"),
    ("Victor", "Reeves", "1952-07-06"),
    ("Wendy", "Santos", "1989-11-13"),
    ("Yasmin", "Turner", "1970-05-22"),
    ("Bruno", "Ueda", "1966-08-18"),
    ("Clara", "Vaughn", "1983-12-09"),
    ("Diego", "Walsh", "1957-04-04"),
    ("Freya", "Xu", "1992-02-27"),
    ("Gavin", "Young", "1973-06-15"),
    ("Helena", "Zaman", "1961-10-31"),
    ("Isaac", "Bennett", "1987-01-19"),
    ("Julia", "Craig", "1969-07-08"),
    ("Kevin", "Dunn", "1954-03-12"),
    ("Lena", "Foster", "1990-09-25"),
    ("Marco", "Grant", "1977-12-14"),
    ("Nora", "Hughes", "1964-05-07"),
    ("Pablo", "Ingram", "1981-08-29"),
    ("Rosa", "James", "1958-11-03"),
    ("Seth", "Kaur", "1975-02-20"),
    ("Uma", "Lewis", "1985-06-01"),
    ("Vince", "Moreno", "1960-10-16"),
    ("Willa", "Nash", "1994-04-13"),
    ("Xavier", "Ortiz", "1972-09-08"),
    ("Yara", "Price", "1968-01-26"),
    ("Zane", "Quinn", "1956-07-21"),
    ("Ada", "Roy", "1982-03-05"),
    ("Beau", "Singh", "1979-08-12"),
    ("Cora", "Trent", "1965-12-19"),
    ("Drew", "Usher", "1953-05-28"),
    ("Eve", "Vega", "1995-10-07"),
    ("Finn", "Wade", "1974-01-15"),
]
REASONS = [
    ("rectal bleeding", "K62.5"),
    ("hematochezia", "K62.5"),
    ("anemia", "D50.9"),
    ("iron deficiency", "D50.9"),
    ("chronic diarrhea", "K58.0"),
    ("ibs diarrhea", "K58.0"),
    ("abdominal pain", "R10.9"),
    ("screening colonoscopy", "Z12.11"),
    ("routine colonoscopy", "Z12.11"),
    ("average risk", "Z12.11"),
]
PAYERS = ["Cigna PPO", "Aetna", "Medicare", "Blue Cross", "United", "Humana", "Medicaid"]


def iso_parts(iso: str) -> tuple[str, str, str]:
    year, month, day = iso.split("-")
    return month, day, year


def slug(first: str, last: str, form: str) -> str:
    return f"{form}-{first.lower()}-{last.lower()}.pdf"


def stanford(path: Path, first: str, last: str, iso: str, reason: str, icd: str, payer: str, phone: str, labs: bool, outside: bool) -> None:
    month, day, year = iso_parts(iso)
    values = {
        "Text22": last,
        "Text23": first,
        "Text25": month,
        "Text26": day,
        "Text27": year,
        "Text28": phone,
        "Text38": reason,
    }
    if payer:
        values["Text19"] = payer
    if icd:
        values["Text37"] = icd
    if outside:
        values["Text32"] = "outside service area"
    writer = filled_stanford(values)
    if labs:
        attach_labs(writer)
    write(path, writer)


def flat(path: Path, form: str, first: str, last: str, iso: str, reason: str, payer: str, phone: str, labs: bool, outside: bool) -> None:
    month, day, year = iso_parts(iso)
    lines = [
        f"Patient Name: {first} {last}",
        f"DOB: {month}/{day}/{year}",
        f"Reason for referral: {reason}",
        f"Patient phone: {phone}",
    ]
    if payer:
        lines.append(f"Primary insurance: {payer}")
    if outside:
        lines.append("Service area: outside service area")
    write_flat(path, f"{form}.pdf", lines, labs)


def main() -> None:
    keep_blanks()
    if OUT.exists():
        for old in OUT.glob("*.pdf"):
            old.unlink()
    OUT.mkdir(exist_ok=True)
    for index, (first, last, iso) in enumerate(PEOPLE):
        form = FORMS[index % len(FORMS)]
        reason, icd = REASONS[index % len(REASONS)]
        payer = PAYERS[index % len(PAYERS)]
        phone = f"530-555-{2000 + index:04d}"
        labs = True
        outside = False
        if index % 9 == 0:
            payer = ""
            labs = False
        elif index % 11 == 0:
            outside = True
        elif index % 13 == 0:
            reason, icd = "rash", ""
        path = OUT / slug(first, last, form)
        if form == "stanford":
            stanford(path, first, last, iso, reason, icd, payer, phone, labs, outside)
        else:
            flat(path, form, first, last, iso, reason, payer, phone, labs, outside)
    print(f"wrote {len(list(OUT.glob('*.pdf')))} official packets in {OUT}")


if __name__ == "__main__":
    main()

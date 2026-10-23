import pathlib
import unittest
from pathlib import Path

from extract_pdf import parse_pdf

ROOT = pathlib.Path(__file__).resolve().parents[2] / "fixtures" / "referrals"


class OfficialPackets(unittest.TestCase):
    def test_filled_stanford_stat_reads_the_patient_and_the_lab_page(self) -> None:
        packet = parse_pdf((ROOT / "gi-stat.pdf").read_bytes() + b"\n%uploaded", "renamed.pdf")
        self.assertEqual(packet["filename"], "renamed.pdf")
        self.assertEqual(packet["patientName"], "Avery Quinn")
        self.assertEqual(packet["dob"], "1984-03-12")
        self.assertEqual(packet["reason"], "rectal bleeding")
        self.assertEqual(packet["payer"], "Cigna PPO")
        self.assertIn("referral", [section["kind"] for section in packet["sections"]])
        self.assertIn("labs", [section["kind"] for section in packet["sections"]])
        self.assertIn("insurance", [section["kind"] for section in packet["sections"]])

    def test_filled_stanford_without_labs_or_payer_is_still_read(self) -> None:
        packet = parse_pdf((ROOT / "gi-incomplete.pdf").read_bytes(), "gi-incomplete.pdf")
        self.assertEqual(packet["patientName"], "Blair Quinn")
        self.assertEqual(packet["dob"], "1979-11-02")
        self.assertEqual(packet["payer"], "")
        self.assertNotIn("labs", [section["kind"] for section in packet["sections"]])
        self.assertNotIn("insurance", [section["kind"] for section in packet["sections"]])

    def test_official_hospital_faxes_read_the_patient(self) -> None:
        cases = [
            ("gi-wakemed.pdf", "Eden Quinn", "1990-04-22", "rectal bleeding", "Cigna PPO"),
            ("source/wakemed.pdf", "Eden Quinn", "1990-04-22", "rectal bleeding", "Cigna PPO"),
            ("source/cdh.pdf", "Flynn Quinn", "1964-08-14", "screening colonoscopy", "Cigna PPO"),
            ("source/dartmouth.pdf", "Gray Quinn", "1958-02-03", "abdominal pain", "Aetna"),
            ("source/summit.pdf", "Harper Quinn", "1975-09-30", "chronic diarrhea", "Cigna PPO"),
            ("source/codh.pdf", "Indigo Quinn", "1988-05-17", "iron deficiency", "Medicare"),
        ]
        for name, patient, dob, reason, payer in cases:
            with self.subTest(name=name):
                packet = parse_pdf((ROOT / name).read_bytes(), Path(name).name)
                self.assertEqual(packet["patientName"], patient)
                self.assertEqual(packet["dob"], dob)
                self.assertEqual(packet["reason"], reason)
                self.assertEqual(packet["payer"], payer)

    def test_blank_official_form_is_rejected(self) -> None:
        with self.assertRaises(RuntimeError):
            parse_pdf((ROOT / "source" / "stanford.pdf").read_bytes(), "stanford.pdf")
        with self.assertRaises(RuntimeError):
            parse_pdf((ROOT / "source" / "cms1500.pdf").read_bytes(), "cms1500.pdf")

    def test_a_file_without_labels_is_rejected(self) -> None:
        with self.assertRaises(RuntimeError):
            parse_pdf(b"%PDF-1.4\n% unknown\n", "random.pdf")


if __name__ == "__main__":
    unittest.main()

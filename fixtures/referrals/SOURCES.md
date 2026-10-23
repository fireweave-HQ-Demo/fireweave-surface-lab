# Official packets

These files were downloaded. They were not drawn in this repo.

| File | Source |
|---|---|
| source/blank/wakemed.pdf | WakeMed gastroenterology referral (blank template) |
| source/blank/cdh.pdf | Center for Digestive Health GI Fast Track colonoscopy referral |
| source/blank/dartmouth.pdf | Dartmouth Hitchcock endoscopy / colonoscopy referral |
| source/blank/summit.pdf | Summit Pacific Medical Center endoscopy referral |
| source/blank/codh.pdf | Central Ohio Digestive Health referral |
| source/stanford.pdf | Stanford Health Care Digestive Health referral (fillable, left blank) |
| source/cms1500.pdf | CMS-1500 claim form |
| source/nlm-labs.pdf | NLM workshop sample CBC / iron panel |
| source/nci-cbc.pdf | NCI CBC / ESR results form |

`gi-stat.pdf` and `stanford.pdf` are the Stanford form with Avery Quinn in the official AcroForm fields. `gi-incomplete.pdf`, `gi-noanswer.pdf`, and `gi-outside.pdf` are the same form for the other demo patients. `source/wakemed.pdf`, `source/cdh.pdf`, `source/dartmouth.pdf`, `source/summit.pdf`, and `source/codh.pdf` are the official hospital pages with a labeled patient cover so the extractor can read them. Complete packets also carry the official NLM lab page. `source/stanford.pdf` stays blank on purpose — a form with no patient must fail instead of inventing a name.

`source/cms1500.pdf`, `source/nci-cbc.pdf`, and `source/nlm-labs.pdf` are official pages without a named patient and a referral reason. Upload them alone and the inbox shows Could not read.

`samples/` is 45 packets built from those same official forms (`python fixtures/referrals/build_samples.py`). Each one has a patient, a DOB, and a GI reason the extractor already knows how to read.

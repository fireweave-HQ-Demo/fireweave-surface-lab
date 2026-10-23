# Clinic OS — product idea from a full pass of TriFetch

Research date: 23 October 2026. Primary source: the live site at [trifetch.ai](https://trifetch.ai/), including [How it works](https://trifetch.ai/#how), plus every still and demo clip the homepage embeds. This note is a build brief for a product in the same category. It describes what TriFetch publicly shows, how the pages and reference media look, and what a replica has to contain.

TriFetch sells **Linda**, one named AI employee for independent and specialty clinics. She answers phones, reads faxes, enters referrals, submits prior authorizations, and writes the result back into the EHR the clinic already uses. The promise on the homepage is no API project and live in 30 days: she gets her own login and works the existing screens. The footage shows the real product behind that sentence. It is a desktop and browser app called **TriFetch Health OS** (window title `TriFetchOS — Healthcare Operating System`), with a human approval step before anything is finalized in the chart.

## What to build

A clinic operating system with one employee persona on the outside and several agents on the inside.

The outside story stays simple. One employee. Three jobs the front office cannot keep up with: phones, faxes and referrals, prior authorization. Configured to that clinic’s rules, not a generic bot. Staff approve writes at first. Autonomy is a dial, not a launch switch.

The inside product, visible in the demo clips, is wider than the homepage copy:


| Module         | What the footage and specialty pages show                                                                            |
| -------------- | -------------------------------------------------------------------------------------------------------------------- |
| Referral inbox | PDF faxes land in a queue, get sectioned, triaged, and turned into a chart                                           |
| Patient hub    | Extracted demographics and insurance, with a human “looks good” gate                                                 |
| Agent session  | A live browser inside the app, logged into the EHR or a payer portal, with a step log and a Take control button      |
| EHR side panel | A panel parked on the eClinicalWorks screen that polls, copies fields, and autofills the form                        |
| Prior auth     | Draft request, missing-field warnings, medical-necessity draft, payer-portal submission, denial appeal, patient text |
| Voice agents   | Several named agents per clinic, each with a job, a Start call button, and a live listening modal                    |
| Scribe (Quill) | Visit recording, note format, generated notes, then an EMR upload queue                                              |
| Dashboard      | Completed, pending, flagged, plus daily counts of calls, faxes, and auths                                            |


A replica that only ships a phone bot, or only a fax parser, misses the product. The homepage comparison page says the point is the whole chain: the call becomes a referral, the referral an authorization, the authorization a booked procedure. Source: [TriFetch vs Assort, Linear, Sully & Tennr](https://trifetch.ai/compare).

## Who it is for

Mid-size to large clinics, primary care and specialty, that already live in a browser EHR and drown in admin. Named specialties on the site: cardiology, gastroenterology, ENT, ophthalmology, physical therapy, primary care, pain management, dermatology, plus a scrolling list that also includes pediatrics, orthopaedics, allergy, nephrology, endocrinology, behavioral health, pain and spine, and pulmonology.

The buyer is a physician-owner or practice manager. The user day to day is front office staff who approve Linda’s work, and the physician who stops rebuilding charts at night. Sales motion is a 30-minute demo on the clinic’s own numbers, a live phone number patients can call, and a physician video. There is no self-serve checkout yet. Custom plans start at $5,000 per month. A smaller self-serve plan is listed as coming in early 2027. Source: [pricing](https://trifetch.ai/pricing).

Public proof is concentrated on two customers you can see in the footage: a GI practice on eClinicalWorks (the [767-referral case study](https://trifetch.ai/customers/gi-referral-backlog), tied to Redding Endoscopy and Dr. Paul Dhanuka) and an ophthalmology practice (Cal Retina MD, Dr. Shashi Ganti). Logo strip also names Advanced Southern Gastroenterology, Rancho Health, Long Island Comprehensive Medical Care, Tinsley Surgical, CardioClinic, and Genesis Behavioral Health.

## The three jobs, as the site defines them

**Phones.** 24/7, in the patient’s language, up to 50 calls at once. Schedule, reschedule, confirm, take a message, route clinical questions, transfer the moment someone asks for a person. The FAQ adds a required opening disclosure that the call is automated and recorded, and lists Spanish, Portuguese, Hindi, Gujarati, Korean, and Russian. Name and voice are customizable. Source: [FAQs](https://trifetch.ai/faqs).

**Faxes and referrals.** Same-day read, sort, and chart entry. Urgent cases flagged. Incomplete packets faxed back to the referring provider. Every patient called to book. The line they use: a 70-page referral packet becomes a scheduled patient chart.

**Prior authorization.** Eligibility, same-day submit, status tracking, denial appeals, so a procedure does not wait on paperwork.

Under those three, the GI specialty page spells out the actual pipeline. Source: [Gastroenterology](https://trifetch.ai/specialties/gastroenterology).

1. Classify on arrival into STAT, symptomatic, and screening. STAT examples they publish: rectal bleeding, anemia. Screening: routine colonoscopy. The queue mock says it is checked every 10 seconds and batch-processed three times a day.
2. Clinical criteria before a human sees the file. Published examples: labs within 60 days, imaging attached, 8-week PPI trial for GERD, stool studies for diarrhea, service area, colonoscopy not already done in the last year. Failures generate a fax-back that names the gap.
3. Payer routing before a slot is offered. Published examples: a named payer maps to a named physician and a time-of-day rule (morning vs end of day). Out-of-network is dropped before scheduling.
4. Prior auth tracker. Procedure code, payer, status (approved, submitted, denied), and a denial that already has appeal documents staged.
5. Outbound call with a structured pre-procedure screen: BMI, cardiac history, diabetes, high-risk meds, driver confirmed. Rideshare is not accepted for procedure visits. Two contact attempts, 24 hours apart. Source: [GI referral workflow post](https://trifetch.ai/blog/gastroenterology-ai-referral-workflow).
6. Chart build. Up to five charts in parallel, 15–20 minutes, documents filed into pathology, labs, insurance, and clinical notes. Status on the mock: awaiting staff approval. Multiple EHR profiles are used so the agent’s login stays separate from staff.

The case-study math, from [the GI backlog page](https://trifetch.ai/customers/gi-referral-backlog), is the number the homepage is selling:

- 767 backlogged referrals worked in two weeks, then the steady inbound is about 70–80.
- 27 patients verified, authorized, and queued for staff to schedule.
- 2 booked end to end by Linda.
- 8 sent to a physician because of a clinical question.
- About 18,000 record updates written to eClinicalWorks.
- Value stack they publish: $17.4k–$21.8k procedure revenue (29 patients at the practice’s own $600–$750 net per colonoscopy) plus $9.5k–$11.5k of staff time (~380 hours at $25–$30 loaded). Against a $5,000 month, they call that 5.4–6.6× in two weeks, and project 8–10× at steady state.
- The homepage stat block prints the 27, the ~18,000, and the 5.4–6.6×. It does not print the 37.



## How she is allowed to touch the EHR

Public description, consistent across the homepage, the FAQ, and the Epic FAQ:

- Computer-use agents that read the screen each step. They explicitly say this is not RPA and not macros, so an EHR button that moves does not require a rescript.
- Her own user login, through the clinic’s normal path, including VPN and two-factor authentication. No third-party API into the EHR. They say this is how they stay inside Epic’s vendor rules: a user on clinic-controlled hardware, not an integration.
- Any browser system: EHR, fax portal, payer portal, email. Named EHRs: Epic, eClinicalWorks, athenahealth, NextGen, Elation, Tebra, Office Ally, Oracle Health.
- Ten screens at once. Marketing line: ten referrals in the time one used to take. Set her up at 5 a.m., minimize the window, she keeps working.
- Training wheels. A human approves every write before it lands in the chart. The clinic sets a confidence threshold on the dashboard for what may run alone and what gets flagged. They say most clinics loosen that after two to three weeks.
- Deterministic extraction (a fax into demographics) is described as near-perfect. Ambiguous fields, such as an unclear procedure code, are flagged and never guessed. They claim above 90% at the start, climbing over two to three weeks as she learns that clinic.
- She can message staff inside the EHR inbox.
- Dashboard shows completed, pending, and flagged items, and daily counts of calls, faxes, and prior auths.
- PHI stays in the US on Google Cloud. Identifiable PHI is not used to train models. BAAs with the clinic and with every model provider, named as Google Cloud and Anthropic. SOC 2 Type 2, HIPAA, $1M cyber and tech E&O through Embroker with an AI endorsement. Onshore only.

The word they want remembered is **glass overlay**: she sits on the glass of the software you already have. The footage shows three concrete versions of that overlay, described in the next section.

## What every reference image actually looks like

The homepage does not use illustrated mockups for the product. It plays screen recordings, cropped into a white card with a 1.5px near-black border. The hero is one wide video. Below the “how it works” copy, ten more videos sit in a 2-column grid, each about 150px tall, labeled in mono. A green live dot sits in a dark green title bar: “Linda · 10 sessions running in parallel.” A footer line says mock patient data, no real PHI. The clips themselves are recordings of the product on a real desktop, with the EHR and payer sites visible. Treat the field values in those clips as demo content. The layout is the spec.

### Brand mark and social card

- Mark: four chevrons chasing each other around an empty center, like a pinwheel. It reads as a single black glyph at 30px in the nav, and as a pearl version in the dark footer. The favicon is the same mark in dark green on black. Wordmark beside it is heavy Bricolage Grotesque, tight tracking, “TriFetch”.
- Open Graph card (1200×630): warm off-white field, mark and wordmark top left, headline “Meet Linda, the AI employee for specialty clinics.” The word Linda sits in a flat electric-blue rectangle with white type, the same highlight the homepage animates. Subline in gray. Bottom left, a pill outline reading TRIFETCH.AI. Bottom right, small green-gray text: “Referrals · Prior auth · Patient calls.” A thin blue bar and a thin dark-green bar run along the bottom edge.
- Hero poster is the first frame of the Windows inbox recording, described below.



### Hero clip — Windows, Referral Inbox plus ECW agent (~20s)

A Windows 11 desktop, blue wallpaper. Three things share the screen: the TriFetch window, a File Explorer window of an inbound fax folder, and a Windows toast from “TriFetch Health OS”.

**Referral Inbox.** Left rail, white, with the pinwheel and “TriFetch Health OS”. Nav items with simple line icons: Dashboard, Inbox (badge count), ECW Agent, Settings. Footer of the rail is the logged-in clinic user. Main pane title “Referral Inbox”, a search field, an Upload button in blue, and filter chips: STAT, Symptomatic, Screening, Accepted, with small counts. A blue processing strip lists PDFs currently extracting. The table columns are patient, triage, category, referring provider, and a percent that behaves like a confidence or urgency score. Triage pills are green “Accepted” or gray “Pending”. Category pills are red “STAT” or quiet “routine”. Rows alternate a very light tint. A details drawer slides over the right of the table. It has tabs Details and PDF, an allergies line, and a document-sections list that names the parts of a packet: fax cover sheet, insurance card, patient profile, clinical notes, procedure note, each with a page range and a one-line summary. A documents row shows the PDF name and a green “completed” chip. A mint banner reads “Patient created successfully.”

**Toast.** Bottom-right Windows notification. Title TriFetch Health OS. Body is an acceptance plus the clinical reason the referral was marked urgent. This is the “you don’t watch the screen” moment: the app talks through the OS, not only inside its own window.

**Fax folder.** Explorer open on a folder of inbound PDFs, some already filed under Rejected and STAT. The story of the shot is that Linda and the fax folder are on the same machine. She is not waiting on an API from the fax vendor.

**ECW Agent, later in the same clip.** The nav item ECW Agent is selected. A second column lists the running job. The center is an embedded browser: eClinicalWorks’ web schedule, April calendar, provider column grayed, a blue “Running” pill, and a **Take control** button at the top of the browser. To the right, a card of extracted fields (sex, city, state, phone, address, signature date, name) and an **activity log** in small mono type. The log is the agent’s trace: a timestamp, “step started”, “step completed”, “deciding next action”, “executing”. The last frame shows the eCW new-patient dialog open on top of the schedule, fields filled, while the log keeps scrolling. A “Pop out” control sits on the browser chrome.

That single clip is the product thesis: inbox on the left, EHR in the middle, extracted truth and a reasoning trace on the right, a human one click away from taking the mouse.

### Grid clip — Referral 1 and Prior Auth 1 — Mac app, Patient Hub

macOS window titled TriFetch Health OS. Clinic label in the sidebar: a surgery group. Nav: Dashboard, Patient Hub (mint highlight), Agent Session, Settings, Help, Sign out. The page is Patient Hub on a pale lavender-to-white gradient.

A status row: Extraction count, PA count, Completed count. Below it, stacked white cards. Each card is “Extracted Patient Information” in a two-column form: name, DOB with age, sex, phone, address, primary insurance, member number, group number, provider, reason for visit. A green pill button, **Looks Good**, sits on the card. A hand cursor hovers the form, which is the recording’s way of saying a person is reviewing, not the agent typing alone.

Prior Auth 2 in the grid is the same hub a step later. The top card now shows a **PA Approved** result: payer, member id, group, status, auth number, and “Determined via CoverMyMeds”. Under it, an Alert Patient panel with a phone number and a drafted SMS (“your medication has been approved…”) and Cancel / Send. Extraction count has dropped and the PA count has gone to 1. So the hub is a review queue that changes state: extracted, then authorized, then patient notified.

### Grid clip — Referral 2 — Agent Session on a payer portal

Same Mac app, Agent Session selected. Subtitle on the page: live agent runs and call activity, active sessions stream in real time. Counters: Running 1, Completed 12. The session card is titled as a CoverMyMeds prior-auth submission, status “running”, and a right-aligned line “Agent submitting prior…”. Inside the card, the embedded browser shows the CoverMyMeds request form: plan header, patient information fields, eligibility check, type of review, physician block. The agent is driving a third-party payer site with the same chrome it uses for the EHR.

### Grid clip — Scheduling and Referral (eCW) — browser plus side panel

A Mac Chrome window on the eClinicalWorks cloud schedule. The schedule grid is the familiar ECW day view: time gutter, provider column, a long green block where a slot is being taken, calendar on the right. Over the right edge of the browser sits a TriFetch side panel, “ECW Patient”, listing the chart fields it is about to write: demographics, address, appointment type, provider, date, time, insurance, clinical notes, reason. Three actions at the bottom of the panel: **Auto-Fill ECW Form**, **Copy All Patient Info**, **Mark Transferred to ECW**. A status line reads connected, polling every 5 seconds. This is the glass overlay in its most literal form: a panel on top of the EHR, not a replacement screen.

### Grid clip — Ophthalmology PA 1 and 2 — TriFetchOS in the browser

Chrome on a web app whose left nav is the full operating system, version marked v0.1.0:

Dashboard, Patients, Schedule, Encounters, Follow-Ups, Intake, Referrals, Prior Auth, Voice Assistants, Patient Q&A, Pre-Op Screener.

Prior Auth is a draft document. A yellow warning banner lists what would make the payer form incomplete: diagnosis codes not set, procedure codes not set, service date not set, and tells the user to run AI generation or attach the referral. The draft has patient information, a medication block (a retinal injection, drug name, eye, dose), and payer information. Top right: Copy, Letter PDF, AAH Form, a red **Submit**. A right-hand card titled **AI Assistant** offers “Generate medical necessity documentation using AI analysis of clinical encounters,” a blue **Generate with AI** button, and “Add guidance”.

The second ophthalmology clip scrolls the same draft into the form the payer will see: procedure codes, drug and NDC, a clinical-necessity textarea, a step-therapy textarea, an attestation checkbox, a signature field, a date, and **Submit Authorization Request**. Small print says submissions are logged and audited per HIPAA. A floating chat bubble sits at the bottom right of the app, the same place a support widget would.

This screen is a different generation of UI from the Mac Patient Hub. The replica should assume the browser OS is the target, and the desktop hub is an earlier shell that still has to do the same jobs.

### Grid clip — Scribe 1 — EMR agent queue

A lighter web app, clinic name in the corner (“Preview Clinic”). Nav: Dashboard, Quill Scribe, Document Inbox, EMR Agent. EMR Agent is a two-pane console. Left, a task list with filters All, Accept, Reject, Schedule, and counts. Each row is a patient, a job name (SOAP upload, file upload), a timestamp, and a pill: Running in blue or Completed in green. Right, the embedded EHR browser with **Take control**, showing the eCW login screen (a dedicated username is filled) and later the schedule. The list is the “10 screens” idea expressed as a queue: many jobs, one live browser you can grab.

### Grid clip — Scribe 2 — Quill

Same shell, Quill selected. Header: “Quill” with a small “AI Scribe” tag, and the line “Intelligent clinical note generation from your visit recordings.” A white card holds a note-format dropdown set to History & Physical, a red recording dot with a timer, and two buttons: Pause (gray) and Stop (red). Below, “Recent Generated Notes”, each row a document icon, a blurred title, a green Ready pill, and View Note. This module is on the homepage grid and in the nav, and it is absent from the three-jobs marketing story. A replica should include it as a fourth job, because the product already demos it.

### Grid clip — the voice desktop — Voice Assistants

The browser OS again, Voice Assistants selected, header “Provider Portal” with the connected EHR named at the top right. The page is a card grid of agents. Each card has an avatar, a name, a role, a one-sentence job description, a “Patient-facing” pill, an Active pill, and a blue **Start call** button. Names and jobs visible in the clip:

- A front-desk scheduler who books and manages appointments.
- A front-desk router who sends calls to the right department and handles pre-screening, optical, scheduling, and billing.
- A surgery screener who collects medication history and GLP-1 flags before cataract surgery.
- A front-desk agent who schedules retina visits and logs the registration back to eCW.

A modal is open over the grid for one live call: a soft green pulsing circle, the agent’s name, the word “Listening…”, a mute button, and a red hang-up. The marketing site talks about one Linda. The product screen talks about a roster of named agents, each scoped to a clinic role. Linda is one of them.

### People, badges, and the physician film

- Testimonial card: white, 1.5px ink border, 6px hard offset shadow, 14px radius. Left column about 340px holds a 132px circular photo, name in display type, role in gray, and the organization’s logo. Right column is the quote in 17px body type with a giant mist-colored opening quotation mark. Six slides, dots and circular arrow buttons. People, all public on the page: Tim Eggena (co-founder of NextGen, founding advisor), David Harel (former athenahealth sales, advisor), Paul Dhanuka, MD (GI, Redding Endoscopy, a pilot), Dr. Shashi Ganti (ophthalmology, Cal Retina), Kimberly A. Lucey, MD (solo ophthalmology), Emily Baack (former prior-auth operations, UnitedHealthcare). Eggena’s photo is a daylight street portrait, denim shirt, used large and circular.
- Compliance row: the standard AICPA SOC 2 Type 2 circular seal, and a HIPAA badge, each about 88px tall with a mono caption.
- Physician film: a 16:9 frame, max about 1400px, 20px radius, heavy soft shadow, YouTube id `DV3zxrw_Dp8`. It loads as a facade (the YouTube poster plus a dark play button) and only then mounts the iframe. The section is centered, display headline, short lede.



### Logo treatments

Customer logos sit in a marquee on the dark green proof band, inverted to white at 80% opacity, about 140px tall chips, fading out at both edges with a mask. On a light background the same strip is grayscale until hover. EHR logos sit in white chips with the same ink border and a smaller 4px offset shadow, in a row, and again in an orbit: seven chips around a glowing green core with three expanding pulse rings. The “+ yours” chip is dashed and has no shadow.

## How the website looks

The homepage is a long editorial page on warm paper, not a SaaS gradient template. It is a Next.js app. The homepage look is an inline stylesheet, separate from an older Tailwind layer still in the bundle (teal `#0D6B6B`, Fraunces, Inter Tight). The page you see is the inline system below. A faint teal radial wash from the app shell sits behind the paper, so the background is not a flat fill.

### Tokens


| Token         | Value     | Use                                                                                   |
| ------------- | --------- | ------------------------------------------------------------------------------------- |
| Paper         | `#F7F5F0` | Page background                                                                       |
| Paper deep    | `#EFEBE2` | Tinted sections, offset shadows                                                       |
| Ink           | `#121A16` | Text, borders, primary buttons, footer                                                |
| Viridian      | `#1E3D36` | Proof band, call band, EMR title bars                                                 |
| Viridian deep | `#142A25` | Final CTA                                                                             |
| Mist          | `#DDD8CC` | Hairlines, chips, quotation mark                                                      |
| Cursor blue   | `#2447F5` | Links that must pop, focus ring, the Linda highlight, primary button on the final CTA |
| Cursor soft   | `#DCE3FF` | Stat numbers on the green band, “glass overlay” highlight                             |
| Sky deep      | `#1B38C9` | Blue button hover                                                                     |
| Stat          | `#C2410C` | The rare orange tag                                                                   |
| Ok            | `#1F7A55` | Success                                                                               |
| Body text     | `#35423C` | Paragraphs                                                                            |
| Muted         | `#6B7770` | Captions                                                                              |
| Live green    | `#45D48E` | Live dots, guarantee accent, solid button on the green band                           |


Type:

- Display: Bricolage Grotesque, 800, tight negative tracking. Headlines from about 40px to 56px, line-height around 1.06.
- Body: Instrument Sans, 17px, line-height 1.6.
- Mono: IBM Plex Mono. Eyebrows, phone numbers, step numbers, captions, the big phone button.

Eyebrow pattern: 12px mono, uppercase, 0.12em tracking, viridian, with a 9px blue square in front. Every section starts with one: “From one customer”, “What Linda does”, “How it works”, “The guarantee”.

Shape language: 1.5px ink borders, 8–14px radii, and a hard offset shadow (`6px 6px 0` paper-deep) instead of a soft drop shadow. Buttons are 8px radius, ink fill, paper text. Hover lifts 1px and turns the fill viridian. Ghost buttons are transparent with an ink border. The phone button in the nav is a blue pill outline with a phone-icon mask. Selection color is the cursor blue with white text. Focus is a 3px blue outline.

Motion, all disabled under reduced-motion: a blue rectangle sweeps behind the word “Linda” in the H1 and the word flips to white; stats and the how-it-works rows fade up on scroll; the live dot pulses; a caret blinks in the decorative session tiles; the logo marquee and the specialty list scroll until hover; the orbit core breathes and sends out rings.

Layout: content column 1140px, nav and hero widen to 1460px, page padding 28px. Hero is a 0.7 / 1.3 grid, copy left, video right, 76px of top padding. Sections are 84px vertical. The proof band, the call-Linda band, and the final CTA go edge to edge in green.

### Page order

1. Black announcement bar, mono, centered. “Forbes · Meet The UCLA PhDs Ending The US Healthcare Admin Nightmare” and a light-blue “Read the article” link. Forbes piece: 27 April 2026, Ilona Limonta-Volkova.
2. Sticky nav on paper, hairline bottom border. Logo, links (Case Studies, a Specialties dropdown, How It Works, ROI Calculator, Pricing, FAQs, Our Team, Careers), then the phone pill and “Book a Demo”. The specialties menu is a white 560px panel, two columns, ink border, offset shadow. Each item is a bold name and a gray one-line job. Below 1200px the links collapse. Below 640px the phone pill hides.
3. Hero. H1 as above. Lede at 19px. Two buttons: filled “Book a Demo”, ghost “Watch Linda work · 90 sec” which jumps to the session grid. The video card has the viridian bar “eClinicalWorks · New Patient / Linda’s session” with a live dot, the recording, a blue Fullscreen button pinned to the bottom right of the video, then a mono caption: no human is touching this screen, real footage, mock data.
4. Proof band in viridian. Eyebrow, a sentence, the inverted logo marquee, then four stats in a row divided by faint white rules. Numbers are display, about 58px, in cursor-soft blue. Labels are small and sage. Two buttons: outline “Read the full case study”, solid mint “Find how much Linda can save you”.
5. Testimonials. Light logo strip, then the carousel described above.
6. Three job cards. White, ink border, offset shadow, a mono kicker in blue at the bottom of each card (“Fewer than 2%…”, “A 70-page packet…”, “Same-day submission…”). Under the cards, a full-width note with a 4px blue left border: they build a version of Linda per clinic, you do not retrain her.
7. How it works, anchor `#how`. Two columns. Left: the glass-overlay paragraph and a numbered list, mono blue numbers, hairline dividers. Right: the ten-video showcase. Under that, the sentence “Works with your existing EHR” with the words “glass overlay” highlighted in cursor-soft, then the orbit of EHR logos.
8. Call band. Viridian, centered. The phone number is a large mono button, transparent, white border. Fine print under it in mono.
9. Physician video, centered.
10. “Built for your practice.” Split: copy and a button on the left, a tall masked scroller of specialty names on the right. Inactive names are a warm gray (`#C4C0B4`), the active name is ink, hover goes blue. The list loops.
11. Implementation. Five columns on a top ink rule. Each column has a mono “STEP N” in blue, a display title, then two short blocks labeled TriFetch and Your clinic. Step 5 is labeled joint. Under the columns, a viridian guarantee card: a huge “30” and the word “days”, a vertical mint rule, then “Every dollar back” and the paragraph. They say no client has asked for it.
12. Trust. Two columns. Left, three short claims (founders, advisors, data). Right, the Eggena pull-quote card and the two compliance seals. Founders named on [the team page](https://trifetch.ai/about): Varuni Sarwal, Ph.D., CEO (UCLA CS, IIT Delhi, Amazon post-training) and Rosemary He, Ph.D., COO. Founding engineers Dhruv Miyani, Dhairya Shah, Yashvardan Singh. Advisors include Oren Avram, Ph.D. and Suvrankar Datta, M.D. The FAQ says a team of about 10, roughly $2M raised, Nexus Venture Partners named, a double-digit number of practices. The homepage says a $1.9M pre-seed led by Nexus. Use the FAQ figure when the two disagree, and keep the homepage figure next to it.
13. FAQ accordion. Display-weight questions, a plus that becomes a minus, answer in 16.5px. Six questions on the homepage, the rest on `/faqs`.
14. One blog card with a mist offset shadow. Category, read time, title, dek.
15. Final CTA on viridian-deep. The filled button here is cursor blue, not ink. Ghost button is a muted green border.
16. Footer on ink. Pearl logo, copyright 2026 TriFetch, Inc., links: Our Team, Blog, FAQs, Compare, Careers, Contact, Privacy Notice, Consumer Health Data Notice, Service Terms, BAA.
17. A fixed circular back-to-top button, ink, bottom right, hidden until scroll.

Inner pages (pricing, FAQs, case study, compare, specialties, ROI) share the nav and the paper page, and read as documents: a display H1, a “last updated” line, then sections. The compare page is a real table, Linda as the first column, then another hire, Assort Health, Linear Health, Sully.ai, and Tennr, with Prosper AI, Forus, and Thoughtful AI discussed underneath. The case study repeats the stat band and adds a four-step “how we cleared it” list and the value stack. Specialty pages are the most product-like marketing: each workflow is a short section followed by a UI mock (queue, checklist, routing engine, auth tracker, call transcript, chart-build progress).

### The ROI calculator is part of the product story

[The calculator](https://trifetch.ai/roi-calculator) is a long form, not a three-slider widget. It is worth copying because it teaches the value model.

- Practice profile: providers (default 6), locations, net collections per completed visit, current vendor spend replaced.
- A toggle between labor savings and capacity created. Capacity is the path for clinics that are growing rather than cutting staff.
- Workflows you can turn on: phones and scheduling, outbound and recalls, prior auth and denials, referrals, faxes, eligibility and intake, inbox and provider time, plus an optional high-value segment (infusions, 340B, surgical cases) with patients lost per month, revenue per patient, and months retained.
- Defaults they ship: 1,200 inbound calls a week, 4 front-desk FTEs, 6,300 appointments a month, 100 prior auths a week, 10% denial rate, 2 PA FTEs, 40 referrals a day, 80 faxes a day, 3 minutes per fax, 45 inbox minutes per provider per day valued at the provider’s rate.
- Blank money fields fall back to a specialty benchmark, and the results are supposed to mark which numbers were benchmarks. Referral conversion benchmark they cite: 3.5%, from the GI pilot. Output: an annual run rate, and month-one backlog recovery shown separately as one-time.



### Demo and pricing surfaces

Book-a-demo is its own page. The homepage CTA copy tells the clinic to bring numbers; the meeting shows the screen recording, runs the ROI live, and they will say if it is a bad fit.

Pricing, last updated 20 October 2026:

- Custom implementation, from $5,000 per month, for multi-provider clinics running several workflows. Includes workflows built for that clinic, a customer-success manager, and a forward-deployed engineer.
- Self-serve, early 2027, one standard workflow, self-guided setup. Waitlist via [inquiry@trifetch.ai](mailto:inquiry@trifetch.ai).
- Price moves with workflows, monthly volume, and how many provider schedules are configured. Adding staff does not raise the price.
- One-time implementation fee. Annual contract, billed monthly. Adding a workflow later has no change fee. Good-faith renegotiation if volume moves. No free trial. The 30-day opt-out is the trial.
- Every plan states HIPAA, SOC 2, a signed BAA, and the 30-day opt-out.

Onboarding, from the FAQ and the five steps: a dedicated engineer for the first month, on site or remote; they shadow and write a structured SOP; the clinic provides credentials and signs the SOP; agents are tested on dummy patients only; go-live comes with a handbook; weekly check-ins continue; the clinic and TriFetch then set the line for when a human steps in. Phones, prior auth, and referrals outside the EMR are described as live within a week. Full bidirectional EMR work, about a month. No IT project on the clinic side.

## Architecture to replicate

Put this together from what they state and what the screens show. Do not invent a private backend.

```text
Fax folder / upload / inbox
        │  extract sections, classify, score
        ▼
Review queue  ── Looks good / Accept / Reject / Flag ──►  staff
        │
        ├─ Voice agents (named, per role) ── schedule, screen, transfer
        │
        ├─ Agent session (embedded browser, own login, step log, Take control)
        │     EHR web app, payer portal (CoverMyMeds), fax portal, email
        │
        ├─ Side panel on the EHR  (poll ~5s, autofill, mark transferred)
        │
        └─ Chart write, only after the approval rule for that workflow says so
                │
                ▼
        Dashboard: completed / pending / flagged, daily counts
        Messages into the EHR inbox
        Audit log of every submission
```

Design rules that fall out of the screens:

- One clinic tenant, many named agents. The marketing name can be a single employee. The product nav is a roster.
- The agent and the staff member never share a login. The eCW username in the scribe clip is a dedicated agent account. The sidebar shows the human who is watching.
- Every mutating step has a status the UI can show: extracting, running, pending, accepted, completed, approved, denied, appeal filed, awaiting staff approval.
- The activity log is part of the product, not a debug view. Staff trust the trace.
- Take control is always on the embedded browser. The agent is interruptible.
- Parallelism is a queue of jobs plus a small number of live browsers, not ten mice on one screen. The homepage’s decorative 5×2 grid of tiny windows (green title bar, blinking caret) is the illustration of that queue. The real UI is the task list.
- Ambiguous clinical coding stops and asks. The ophthalmology draft’s yellow banner is the pattern: name the missing fields, offer Generate with AI, refuse to submit a hole.
- Fax-back is a first-class action, with the missing item named, before the file enters the staff queue.
- Payer rules and scheduling rules are clinic configuration (which doctor, which time of day, which facility), edited as data, not as a new bot.
- Scribe notes land in the same EMR-agent queue as referrals. One write path.
- Voice opens with a disclosure, records, and transfers on request or on failure. The listening modal is a single green orb, the agent’s name, and two buttons. It should look calm.
- Notifications leave the app: an OS toast when a STAT referral is accepted, an SMS when a prior auth is approved.

Model providers they name are Google Cloud and Anthropic, under BAAs, US regions, no training on the clinic’s PHI. The computer-use loop is: screenshot or DOM of the logged-in browser, a next action, an execution step, a log line, a stop when the field is ambiguous or the confidence is under the clinic’s threshold.

## Visual system for the product UI

The marketing site and the app do not share a skin. Build both, and keep them apart.

**Marketing.** Paper, ink, viridian, one electric blue, mono eyebrows, hard offset shadows, display serif-adjacent grotesk. It should feel like a clinic brochure that learned layout, not like a developer tool.

**App.** Cool off-white with a lavender wash. White cards, 1px light borders, soft shadows, small radius. Sidebar in white or very light gray. Active nav item in a pale mint pill. Primary actions in a clear blue. Destructive and recording in red. Success in green pills (“Looks Good”, “Approved”, “Ready”, “Accepted”). Warning in a pale yellow banner with a list. Mono or compact sans for logs and metadata. A live session always shows the word Running and a way to take the mouse. The embedded browser is a real browser chrome inside a card, so staff recognize the EHR and do not think they are in a clone of it.

**Decorative session tiles** on the marketing site, for when there is no video: a 58px-tall cream rectangle, 6px radius, a 10px viridian strip across the top, and a blinking blue caret. Five columns, two rows. They are a poster of “ten sessions,” not the product.

## Site map worth rebuilding


| Path                                                                                                                               | Job                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `/`                                                                                                                                | The page above. Anchor `#how` is “How it works”. Anchor `#sessions` is the video grid.                       |
| `/customers/gi-referral-backlog`                                                                                                   | The only case study linked from the nav                                                                      |
| `/specialties` and `/specialties/{cardiology,gastroenterology,ent,ophthalmology,physical-therapy,pcp,pain-management,dermatology}` | One workflow story per specialty, with UI mocks                                                              |
| `/roi-calculator`                                                                                                                  | The long calculator                                                                                          |
| `/pricing`                                                                                                                         | Two plans, the volume drivers, pricing FAQ                                                                   |
| `/faqs`                                                                                                                            | Compliance, getting started, how Linda works, patients and staff, contracts                                  |
| `/compare`                                                                                                                         | The table                                                                                                    |
| `/about#team`                                                                                                                      | Founders, founding team, advisors                                                                            |
| `/careers`                                                                                                                         | Hiring                                                                                                       |
| `/book-demo`                                                                                                                       | The conversion page                                                                                          |
| `/blog`                                                                                                                            | Evaluation content: phone agent vs receptionist, prior-auth denials, referral intake, one post per specialty |
| `/legal`, privacy notice, consumer health data notice, service terms, BAA, subprocessors                                           | Trust center, linked from the footer                                                                         |
| Phone `(240) 981-5499`                                                                                                             | A live Linda, in the nav, the call band, the FAQ, and the final CTA                                          |


Blog and specialty pages do double duty: they are SEO, and they are the spec for clinic-specific rules. A replica’s specialty pages should be generated from the same rule config the agent runs, so the marketing claim and the product cannot drift.

## Implementation order

Build in the order the footage proves, not in the order of the homepage.

1. **Inbox and extract.** Upload or watch a folder of PDFs. Split a packet into sections. Pull demographics, insurance, and reason. Show the details drawer and the confidence. Statuses: extracting, pending, accepted.
2. **Review gate.** Looks Good, reject, flag. Nothing writes through without it. Audit row per decision.
3. **One agent session.** Embedded browser, one dedicated login, activity log, Take control, a single EHR flow (create patient, or drop a referral on the schedule). Side panel with autofill as the second way in.
4. **Rules.** STAT / symptomatic / screening, fax-back on a missing document, payer-to-provider routing. Start with one specialty’s published rules so the demo is specific.
5. **Prior auth.** Draft, missing-field banner, generate the necessity note, submit through a payer portal session, store the auth number, text the patient.
6. **Voice, one agent.** Disclosure, schedule against the rules, transfer to a human, write the outcome to the chart. Then a roster of named agents.
7. **Dashboard and toasts.** Counts, the queue, an OS notification for STAT.
8. **Scribe.** Record, pick a note format, list of ready notes, push through the same EMR queue.
9. **Marketing site** in the token system above, with the real product recordings in the hero once they exist. ROI calculator uses the same volume inputs sales will quote from.
10. **Autonomy dial.** Per workflow, a threshold. Default is approve-everything. The handbook and the five-step onboarding are a services motion around this, not a feature to fake in the UI.



## Claims to keep honest

These are TriFetch’s published claims, useful as targets and dangerous as copy-paste promises:

- Fewer than 2% of patients identify the voice as AI.
- Above 90% workflow accuracy at the start.
- Live in a week outside the EMR, about a month for full chart read/write.
- 30-day money back, written into the contract.
- No client has asked for the money back.
- 5.4–6.6× in two weeks on one GI practice’s own fee schedule.

A replica should show the clinic its own numbers in the calculator and in the dashboard, and keep the guarantee as a commercial term, not as a badge printed before there is a pilot.

## Sources

- [trifetch.ai](https://trifetch.ai/) homepage, including `#how`, the inline design system, and the clips under `/design/hero-clip.mp4` and `/design/videos/`
- [GI referral backlog case study](https://trifetch.ai/customers/gi-referral-backlog)
- [FAQs](https://trifetch.ai/faqs)
- [Pricing](https://trifetch.ai/pricing)
- [ROI calculator](https://trifetch.ai/roi-calculator)
- [Compare](https://trifetch.ai/compare)
- [Specialties](https://trifetch.ai/specialties) and [Gastroenterology](https://trifetch.ai/specialties/gastroenterology)
- [Team](https://trifetch.ai/about)
- [GI workflow essay](https://trifetch.ai/blog/gastroenterology-ai-referral-workflow)
- Forbes announcement linked from the homepage bar (27 April 2026)


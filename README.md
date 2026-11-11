# ai_projects

Browser-based tools for Brookdale Community College. Single-file HTML, no build step, no CDN dependencies, published through GitHub Pages.

```
ai_projects/
├── .nojekyll
├── README.md
├── faculty-schedule/
│   ├── index.html                     the tool
│   └── data/26FA/sections.json        the feed it reads
├── data/raw/                          scraped spreadsheets, committed for provenance
└── tools/
    ├── build_schedule_data.py         spreadsheet -> sections.json
    ├── scrape_schema.md               what the scraper must capture
    ├── sample_scrape.xlsx             five-row example in the expected shape
    └── test.js                        jsdom smoke test for the tool
```

## Faculty Schedule Builder

`faculty-schedule/index.html` → https://mqaissaunee-bcc.github.io/ai_projects/faculty-schedule/

Faculty search their name, their sections load, they add office hours and contact details, and export a weekly schedule as PDF, `.ics`, `.png`, or `.csv`. Chairs add several names and get one sheet per person with a page break between.

Office hours can be drawn directly on the grid: drag across an empty part of a day column to create a block snapped to the quarter hour, drag a block to move it (sideways into another day as well as up and down), or drag its bottom edge to resize. A block that falls on several days shifts in time only — moving one of its days to a different column would be ambiguous. Course blocks are not draggable, and a plain click creates nothing. This is enabled only for `(pointer: fine)` — on touch, a drag would fight with scrolling, so the step 3 form remains the path there and the only fully keyboard-accessible one.

With more than one person on screen, both the sections list and the office-hours list are grouped under headings by person, and a block whose owner is no longer selected is listed under "owner not selected" instead of silently disappearing — it still exists in storage, so hiding it would lose work with no way to get it back.

Each office-hours or commitment block gets an owner: a named person, or "Everyone shown" for something like a department meeting. Owned blocks appear only on that person's sheet and count only toward that person's office-hour total. A block drawn by dragging takes the owner of the sheet it was drawn on. With one person selected the picker is hidden and everything belongs to them.

### Checks that catch a form before a dean does

- **Conflicts.** Any two blocks overlapping in the same day column are listed on screen — office hours on top of a class, or two sections at the same time. Shown in the banner area only, never printed: a schedule submitted for approval shouldn't announce its own errors, and by then it should be fixed.
- **Office-hours floor.** "Office hours required" under Your information (default 5, matching the paper form) drives a warning when the total falls short, and the summary reads `Office hours: 3 of 5`.
- **Department summary.** With several people selected, a summary sheet leads the printout: sections, contact hours against the required load, overload, office hours, release, and column totals. Numbers off the expected load or below the office-hours floor are highlighted — underlined in print, where color may not survive. Toggle under Display options.

### Overload agreements

Every overload section needs a memorandum of agreement, one per part of term, so a person with overload in both 15W and 11W gets two. `moaGroups()` groups the PT-flagged sections by person and session; `buildMoaDoc()` renders each as a document modelled on the Institute Office's Word form.

Filled from what the tool knows: name, term and session wording, one row per section with its credits, and the session start and end dates from `calendar-26FA.json`. A rate per credit is optional — set it and amounts are computed with the rate stated underneath; leave it blank and the column prints empty for the office.

**The rate per credit belongs to the session, not the tool.** Three sample agreements came out at $1,050 (Fall 2026 15-week), $1,020 (Fall 2025 11-week) and $985 (Summer II 2025) per credit, so a single global rate would have printed wrong figures on a payment document. Each part of term carries its own rate, with the global one used only as a fallback.

**The session wording is free text.** The office writes "FALL 2025 11-week semester" and "SUMMER II 2025 10 WEEK SEMESTER"; the tool's own wording is only a placeholder, and a session the feed does not name — a summer ten-week, say — can be typed in.

**No total row.** The issued form lists sections and amounts with no total, so the generated one does the same.

**Institutes are a saved list**, not single fields: each college institute has its own dean, phone, and office staff, so `state.institutes` holds a record per institute and the agreement reads from whichever is selected. **Payment dates and the respond-by date are per part of term**, since an 11-week overload is paid over fewer months than a 15-week one; the panel shows one pay group per session that actually needs an agreement.

"Save settings file" writes institutes, rate, and payment dates only — deliberately no schedule and no personal details — so one office can hand its setup to another.

Credits follow the section's published credit value when the whole section is overload, and the overload portion when it is a split, marked `(partial)`.

**The dean's signature line is always left blank.** The sample form arrives with it pre-filled because the office issues it; a faculty-side tool producing a document with the dean's name already on it is a different object. Each document also carries a line saying it is a draft for the Institute Office.

Printing uses a named page — `@page moa { size: letter portrait }` with `.moa-doc { page: moa }` — so agreements print portrait while the schedule stays landscape. The Word export writes an HTML document with the Office namespace, which Word opens and can edit without needing a zip library in the browser.

### Reporting what changed in the data

Pass `--previous` pointing at the `sections.json` being replaced and the build records its own differences into the new feed under `changes`: sections added and removed, which changed instructor, which changed room or meeting pattern, and the unstaffed count before and after.

```bash
python3 tools/build_schedule_data.py <the four exports> \
  --pot-labels 15W,11W,7A,7B --term 26FA --term-label "Fall 2026" \
  --calendar tools/calendar-26FA.json \
  --previous faculty-schedule/data/26FA/sections.json \
  --out faculty-schedule/data/26FA/sections.json
```

Read `--previous` before writing `--out`; the build loads the old file first, so pointing both at the same path is fine.

The app uses it twice. College-wide figures head the **What's new** page, regenerated from the feed rather than written by hand — no changelog editing per data refresh. And anything touching a section the current person has appears as a notice at the top of their page: *ELEC-101-001RL moved to GMH 106 (was MAS 108)*. A cancelled section can only be named if that person had previously touched it, since it is no longer in the feed to match against.

### What's new

A **What's new** button opens the changelog, also available as a third tab in Help. `APP_VERSION` at the top of the script drives it: a returning visitor whose stored version differs sees a dot on the button until they read it, and a first-time visitor sees no dot, having nothing to catch up on. When you ship a change, bump `APP_VERSION` and add a section at the top of `#paneNews`.

### Built-in help

A **? Help** button in the header opens a dialog with two tabs: a six-step walkthrough matching the numbered panels, and a FAQ seeded with the questions this project actually produced — split instructor names, credits versus contact hours, partial overload, the Windows print destination, missing short-session courses, and where the data comes from.

**Start the guided tour** highlights each panel in turn, opening it as it goes, with a callout placed beside the panel on a wide screen and below it on a narrow one. First-time visitors get a dismissible banner offering the tour; the choice is remembered under `bcc-faculty-schedule-tour` in `localStorage`, separate from the schedule draft so "Reset everything" doesn't bring the banner back.

When adding features, add the matching FAQ entry. The entries exist because someone was confused once — that's the bar for adding another.

### Load accounting

Modeled on the college's Faculty Teaching/Office Hours Schedule form, which counts **contact hours**, not credits:

- **Office hours required are derived, not fixed.** Seven official forms all show contact hours plus released credits summing to 15, with office hours at one per three contact hours — a sheet with 12 credits released shows 3 contact hours and 1 office hour. A flat requirement of 5 was wrong for everyone with release time. `officeRequired()` computes it from the load owed; a typed value overrides it.
- **Release time expects hours on the grid**, by a different rule from teaching: two hours per credit plus one, so a three-credit release expects seven. That holds exactly on three sample forms — TLC Fellow, Program Review, and Poverty Informed Fellow each show 7 hours for 3 credits. Six- and twelve-credit releases on those forms show fewer hours than the formula gives, so the figure is overridable per line.
- **Release-time activity is a third block type**, beside office hours and other commitments, for the chair hours, fellow hours, site visits, and coordinator time that fill those forms. It renders distinctly and is excluded from the office-hour total.
- **Extra compensation is recorded apart from release**, because it is paid on top rather than reducing the load owed; only release credits reduce the contact hours required.
- **The required load is a 15-week figure**, so a section in any other session defaults to overload and is excluded from the contact-hour total. `defaultPtHours()` decides this from the section's session; the faculty member overrides it with the PT button or by entering 0 in the editor. An explicit 0 is stored rather than the key being cleared — clearing would fall back to the session default, which is the opposite of what "count this toward load" means.
- Overload is tracked in hours, not as a yes/no flag, because a section can be split. The **PT** button flags a whole section; the section editor takes a number for a partial split, so a 4-hour course whose online lab is paid as overload contributes 3 to load and 1 to PT. PT hours are clamped to the section's contact hours.
- PT sections leave the load total, are marked on the grid and in the course table (`3 load + 1 PT`), and are listed by name under the summary — the form's "List Part-time Sections" field.
- When the load total goes above a full load, the summary says by how much rather than silently reporting an over-full schedule.
- Contact hours default to the credit value in the schedule report, but that number is wrong for lab courses: ELEC-103 is published as 4 credits and counts as 3 contact hours. Any section's hours can be overridden in its editor, and the override persists.
- Office hours are totalled automatically from the office-hours blocks (hours × days).
- Release time is a repeatable list under Your information — credits plus what they were released for, one line per assignment, matching the several release lines on the paper form. Each lowers the contact hours owed, and the reasons print in the summary.
- An optional signature line (Display options) prints rules for faculty, chair, dean, and date. The faculty line can be signed in the tool — typed in a script face, or drawn on a canvas pad with mouse, trackpad, or finger — with an auto-filled date and a "Signed electronically" note beneath. The chair and dean lines always stay blank; they belong to other people.

  This is an attestation, not an authenticated signature: nothing verifies who typed or drew it, and a drawn one is stored in `localStorage` and travels inside a saved draft file. The FAQ says so plainly, and it's worth confirming the Institute Office accepts one before faculty rely on it.

### Why the office-hours location shares the time line

A block carried three lines: title, time, location. Print shrinks rows from 58px to 32px, so an hour-long block became 30px tall with 39px of content, and `overflow:hidden` silently cut the last line — the location — off the printed page while it stayed visible on screen. Course blocks were unaffected because their room is already part of the one-line `sub`.

Non-course blocks now render as `10 am–11 am · GMH 104` on a single line, and `.blk` has a 24px minimum height in print so a half-hour block still shows both lines.

Worth remembering when testing print output: the first check for this passed because the string being searched for also appeared in the page header. Use a value that can only come from the element under test.

### Tightening the grid

Two opt-in Display options, both off by default because a full weekday grid is what people expect:

- **Hide days with nothing on them** filters `daysShown()`, with a guard so an empty schedule never produces a grid with no columns.
- **Collapse long empty stretches** folds runs of empty hours into a single short row labelled with the range. `buildSegments()` turns the hour range into a row list, and `unitsBefore()` maps a time to a position in row units, so blocks stay expressed as `calc(var(--rowh) * n)` and print rescaling still works. No block can span a fold, since a folded hour is by definition empty.

The segment list is stored on the grid element, and `minutesAt()` walks the same rows, so dragging still lands where the cursor is when stretches are folded away.

### One-page printing

On by default. Two stages, in order:

1. **Condense.** The course table drops its Meets and Room columns, which repeat what the grid already shows. That alone usually gets a normal load onto one page.
2. **Scale, only if still needed.** Before the print dialog opens, each sheet is cloned into a hidden container at exact page width with the print geometry applied, measured, and given a `zoom` factor written to `--fit`. A second measurement runs at the widened layout, since less text wrapping usually means less shrinking is needed. The floor is 0.6; below that the tool says the schedule won't fit rather than printing something unreadable.

`--fit` is only read inside `@media print`, so the on-screen sheet is never scaled. In chair mode every faculty sheet is measured separately, so one person's heavy schedule doesn't shrink everyone else's page.

The `.print-measure` CSS block mirrors the `@media print` geometry. **Keep the two in step** — if they drift, the measured height stops matching the printed one and the fitting silently misjudges.

The summary prints as `Contact hours: 15 of 15 · Office hours: 5 · PT / overload: 3`.

Asynchronous sections stay off the grid and appear in the "Not on the weekly grid" list below it.

Everything typed into the tool — office hours, phone, email — lives in `localStorage` only. Nothing is posted anywhere.

### Pipeline

```
scraper  →  data/raw/26FA_schedule_YYYYMMDD.xlsx  →  build_schedule_data.py  →  faculty-schedule/data/26FA/sections.json  →  the tool
```

One source. The tool no longer reads anything from the enrollment dashboard or the `AI_Examples` repo, and carries no enrollment counts.

```bash
python3 tools/build_schedule_data.py --inspect data/raw/26FA_schedule_20260901.xlsx

python3 tools/build_schedule_data.py data/raw/26FA_schedule_20260901.xlsx \
  --term 26FA --term-label "Fall 2026" \
  --out faculty-schedule/data/26FA/sections.json
```

Commit the raw spreadsheet alongside the generated feed so any published schedule can be traced back to the file that produced it. `tools/scrape_schema.md` is the contract for what the scrape must contain — read it before running the scraper, not after.

Only dependency: `pip3 install openpyxl`, and only for `.xlsx` input. CSV needs nothing.

### The current feed is a stopgap

`faculty-schedule/data/26FA/sections.json` was built from the enrollment report before the scrape existed. It covers all 1,628 sections and 503 instructors, but every end time in it is derived (`credits × 55 min ÷ meeting days`), flagged `≈` in the interface, and there are no room numbers. The first real scrape replaces it and those flags disappear.

### Sharing

There is no built-in email. A `mailto:` link fails silently on any machine with no mail handler registered — common for people who read mail in a browser tab — and Windows drops it entirely past roughly 2,000 characters. Both failures look identical to a broken button, so the feature was removed rather than patched further.

The export panel now says plainly: save the PDF, attach it to your own email. "Copy summary as text" puts a plain-text version on the clipboard for the body of that message.

### Printing in color

Off by default. The default print style is dark text on white with a colored left edge, which survives a print dialog that has background graphics switched off. Turning color on fills the blocks and flips the text white, which only works when background graphics are enabled — the option shows that warning when ticked.

### Online courses with no meeting time

Asynchronous sections have no day or time, so they cannot be placed on a time grid honestly. Three presentations, chosen per person under Display options:

- **Band** (default) — a strip under the day headers listing each course. Present on the grid without asserting a meeting time. Includes the section suffix, since someone can teach the same course both in person and online.
- **Column** — an extra hatched column beside the weekdays, with a block per course.
- **List** — the original section beneath the grid.

The band and column replace the list rather than sitting alongside it; showing both would repeat the same courses twice on one page.

An untimed course can also be tied to particular weekdays: tick days in the section editor and leave the times blank. The course then sits in the band above those columns instead of spanning the week, still with no time. This needed no data-model change — a meeting with days and no start time was already representable; the band just had to read it, and `daysShown()` had to include a day that only an untimed course uses, or a course pinned to Saturday would have had nowhere to go.

A course with no start time cannot become a calendar event. The `.ics` export leaves those out, names them in an `X-COMMENT` line, and the toast says how many were skipped — better than inventing an all-day event that repeats for fifteen weeks and clutters someone's calendar.

### Academic calendar

`tools/calendar-26FA.json` carries the term dates and the exceptions, and is merged into the feed with `--calendar`:

```json
{
  "start": "2026-09-08",
  "end": "2026-12-23",
  "closures": [{"from": "2026-11-26", "to": "2026-11-29", "label": "Thanksgiving recess — all locations closed"}],
  "swaps": [
    {"date": "2026-12-22", "actsAs": "R", "label": "Thursday classes held"},
    {"date": "2026-12-23", "actsAs": "F", "label": "Friday classes held; last day of 15-week classes"}
  ]
}
```

Term dates prefill the export fields, so the `.ics` works without anyone typing a date. Closures become `EXDATE` entries. A swap day does two things: the day's own classes are excluded, and the borrowed day's classes are added as one-off events — so a Thursday class correctly lands on Tuesday 22 December, and Tuesday classes correctly do not. The dates also print in a footnote under the grid.

Update this file each term. It is the one piece of information the enrollment export does not carry.

### More than one term

`faculty-schedule/data/terms.json` lists the terms on offer, newest first:

```json
{"terms": [
  {"code": "27SP", "label": "Spring 2027", "path": "data/27SP/sections.json"},
  {"code": "26FA", "label": "Fall 2026",   "path": "data/26FA/sections.json"}
]}
```

The app reads it, shows a term menu when there is more than one, and remembers the choice. Without the file it loads a single feed exactly as before.

**Saved work is per term**, because a section code like `NETW-107-001RL` exists in both Fall 2026 and Spring 2027 and the two must not share flags. `localStorage` is keyed `bcc-faculty-schedule-v1:<term>`; profile, options, release lines, signature, institutes, and the selected faculty member carry forward on first visit to a new term, while sections, overload flags, overrides, and office-hours blocks do not.

Building a term whose export omits credits and gives only `Surname, F`:

```bash
python3 tools/build_schedule_data.py data/raw/27SPR_Course_Enrollment_Report_111126.xlsx \
  --pot-from-term --term 27SP --term-label "Spring 2027" \
  --calendar tools/calendar-27SP.json \
  --credits-from-course faculty-schedule/data/26FA/sections.json \
  --names-from faculty-schedule/data/26FA/sections.json \
  --out faculty-schedule/data/27SP/sections.json
```

`--credits-from-course` matches on course code rather than section, since credits belong to the course. `--names-from` uses another term's full names to expand `Qaissaunee, M` into `Michael Qaissaunee`, which also keeps the same person selectable across terms.

### Sessions

Where one export carries every session in a `Term` column (`26FA`, `26FA11`, `26FA7A`, `26FA7B`), use `--pot-from-term` instead of `--pot-labels`:

```bash
python3 tools/build_schedule_data.py data/raw/<one export>.xlsx \
  --pot-from-term --term 26FA --term-label "Fall 2026" \
  --calendar tools/calendar-26FA.json \
  --previous faculty-schedule/data/26FA/sections.json \
  --out faculty-schedule/data/26FA/sections.json
```

An export filtered to currently-active sections (the 10/27 one omits all of 7A, which ended 10/26, plus 248 others) can be completed from the feed it replaces:

```bash
python3 tools/build_schedule_data.py data/raw/26FAR_Course_Enrollment_Report_102726.xlsx \
  --pot-from-term --term 26FA --term-label "Fall 2026" \
  --calendar tools/calendar-26FA.json \
  --fill-missing --carry-credits \
  --previous faculty-schedule/data/26FA/sections.json \
  --out faculty-schedule/data/26FA/sections.json
```

`--fill-missing` keeps sections the export dropped, marked `carried: true`. `--carry-credits` supplies the credit values this export omits. Both read `--previous`, which is also used as a dictionary of full instructor names — an export giving `Dornemann, S` is shown as the full name already known.

**Order matters inside the build.** Names are canonicalised after the carried sections are merged in, or each half keeps its own spelling of the same person; and the faculty list is assembled last, or it freezes before either step. Both were bugs: the first split people in two, the second published a list of initials while the sections held full names.

**Check the output before committing.** An 18-column variant of this report exists that omits `Section End Time` and `Room`; see `tools/scrape_schema.md`. The build reports estimated end times and missing rooms — if those numbers jump, the export is the wrong variant and the previous feed is better.

The feed can also be built from one export per session:

```bash
python3 tools/build_schedule_data.py \
  data/raw/26FA_Course_Enrollment_Report_091226.xlsx \
  data/raw/26FA11_Course_Enrollment_Report_091226.xlsx \
  data/raw/26FA7A_Course_Enrollment_Report_091226.xlsx \
  data/raw/26FA7B_Course_Enrollment_Report_091226.xlsx \
  --pot-labels 15W,11W,7A,7B \
  --term 26FA --term-label "Fall 2026" \
  --calendar tools/calendar-26FA.json \
  --out faculty-schedule/data/26FA/sections.json
```

A section appearing in two files is kept once, from the first, with a warning — `HIST-136-DE02A` currently does.

In the app, step 1 lists a checkbox per session with its section count. **15-week is on by default and the short sessions are opt-in**, because the printed sheet is a 15-week form and a 7B course on it may confuse whoever approves it. At least one session must stay ticked.

Switched on, a short-session course carries its session code on the grid block and a dashed edge, the band chip gets the same badge, the course table appends it to the mode column, and a footnote under the grid names the sessions on show.

7A and 7B occupy different halves of the term, so two courses at the same hour in different sessions may never actually collide. The conflict check says so rather than calling it a clash: *different sessions (7A and 7B), check the dates*.

**Session dates are not in the enrollment export**, so they live in the `sessions` block of `calendar-26FA.json`. Fall 2026:

| Session | Start | End |
|---|---|---|
| 15W | 2026-09-08 | 2026-12-23 |
| 7A | 2026-09-08 | 2026-10-26 |
| 11W | 2026-10-01 | 2026-12-18 |
| 7B | 2026-10-29 | 2026-12-18 |

With these in place the calendar export bounds each course to its own session, so an 11-week course starts in October and a 7B course in late October instead of repeating from September. Closures and swap days are clipped to the session too: 7A ends before Thanksgiving, so it gets no exclusion, and only 15W runs on 22 and 23 December.

They also let the conflict check tell a real clash from an apparent one. 7A and 7B never run at the same time, so two of their courses sharing an hour is listed under "overlaps that are not clashes"; 15W and 11W do overlap from October, so that is reported as a genuine conflict. Leave a session's dates null and it falls back to "different sessions, check the dates".

**Update these each term.** Wrong dates produce confidently wrong calendar exports.

### A section is included unless it is unticked

`isIncluded()` treats an unset value as included. Seeding inclusion when a faculty member was picked looked equivalent, but it meant that switching a session on later revealed sections that were silently excluded — present in the list, unticked, absent from the sheet, with nothing explaining why.

### Data loading

The tool tries `data/26FA/sections.json` relative to itself, then the absolute Pages URL, then falls back to an embedded 205-section sample so the page is never dead. `DATA_CANDIDATES` at the top of the script block controls the order. "Load a different data file" in the toolbar accepts any feed JSON — the fast way to check a new term before committing it.

### New term

1. Scrape it, commit the spreadsheet to `data/raw/`.
2. Build to `faculty-schedule/data/<TERM>/sections.json`.
3. Update `DATA_CANDIDATES` in `index.html`.

Faculty drafts are keyed by browser, not by term, so returning users keep their contact block and office hours and only re-pick sections.

### Notes for future edits

- CSP-safe: every handler is `addEventListener`, no inline `on*` attributes. Keep it that way for Canvas embedding.
- Grid blocks are positioned in `calc(var(--rowh) * n)` units so the print stylesheet can rescale the whole grid to one landscape page by overriding `--rowh`.
- Printed blocks are black on white with a colored left spine, so they stay legible whether or not the user enables background graphics in the print dialog.
- `node tools/test.js` runs the smoke suite (search, selection, multi-pattern editing, exports, persistence, accessibility). Needs `npm install jsdom` in the same directory.

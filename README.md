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

With more than one person on screen, each office-hours or commitment block gets an owner: a named person, or "Everyone shown" for something like a department meeting. Owned blocks appear only on that person's sheet and count only toward that person's office-hour total. A block drawn by dragging takes the owner of the sheet it was drawn on. With one person selected the picker is hidden and everything belongs to them.

### Checks that catch a form before a dean does

- **Conflicts.** Any two blocks overlapping in the same day column are listed on screen — office hours on top of a class, or two sections at the same time. Shown in the banner area only, never printed: a schedule submitted for approval shouldn't announce its own errors, and by then it should be fixed.
- **Office-hours floor.** "Office hours required" under Your information (default 5, matching the paper form) drives a warning when the total falls short, and the summary reads `Office hours: 3 of 5`.
- **Department summary.** With several people selected, a summary sheet leads the printout: sections, contact hours against the required load, overload, office hours, release, and column totals. Numbers off the expected load or below the office-hours floor are highlighted — underlined in print, where color may not survive. Toggle under Display options.

### What's new

A **What's new** button opens the changelog, also available as a third tab in Help. `APP_VERSION` at the top of the script drives it: a returning visitor whose stored version differs sees a dot on the button until they read it, and a first-time visitor sees no dot, having nothing to catch up on. When you ship a change, bump `APP_VERSION` and add a section at the top of `#paneNews`.

### Built-in help

A **? Help** button in the header opens a dialog with two tabs: a six-step walkthrough matching the numbered panels, and a FAQ seeded with the questions this project actually produced — split instructor names, credits versus contact hours, partial overload, the Windows print destination, missing short-session courses, and where the data comes from.

**Start the guided tour** highlights each panel in turn, opening it as it goes, with a callout placed beside the panel on a wide screen and below it on a narrow one. First-time visitors get a dismissible banner offering the tour; the choice is remembered under `bcc-faculty-schedule-tour` in `localStorage`, separate from the schedule draft so "Reset everything" doesn't bring the banner back.

When adding features, add the matching FAQ entry. The entries exist because someone was confused once — that's the bar for adding another.

### Load accounting

Modeled on the college's Faculty Teaching/Office Hours Schedule form, which counts **contact hours**, not credits:

- Overload is tracked in hours, not as a yes/no flag, because a section can be split. The **PT** button flags a whole section; the section editor takes a number for a partial split, so a 4-hour course whose online lab is paid as overload contributes 3 to load and 1 to PT. PT hours are clamped to the section's contact hours.
- PT sections leave the load total, are marked on the grid and in the course table (`3 load + 1 PT`), and are listed by name under the summary — the form's "List Part-time Sections" field.
- When the load total goes above a full load, the summary says by how much rather than silently reporting an over-full schedule.
- Contact hours default to the credit value in the schedule report, but that number is wrong for lab courses: ELEC-103 is published as 4 credits and counts as 3 contact hours. Any section's hours can be overridden in its editor, and the override persists.
- Office hours are totalled automatically from the office-hours blocks (hours × days).
- Release time is a repeatable list under Your information — credits plus what they were released for, one line per assignment, matching the several release lines on the paper form. Each lowers the contact hours owed, and the reasons print in the summary.
- An optional signature line (Display options) prints rules for faculty, chair, dean, and date. The faculty line can be signed in the tool — typed in a script face, or drawn on a canvas pad with mouse, trackpad, or finger — with an auto-filled date and a "Signed electronically" note beneath. The chair and dean lines always stay blank; they belong to other people.

  This is an attestation, not an authenticated signature: nothing verifies who typed or drew it, and a drawn one is stored in `localStorage` and travels inside a saved draft file. The FAQ says so plainly, and it's worth confirming the Institute Office accepts one before faculty rely on it.

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

### Parts of term

15-week only for now. The current feed is a single 15W export, and the app defaults to 15W and hides the part-of-term control when the feed carries only one session — no dead control on screen. It also shows a standing notice so nobody teaching a short session assumes the tool is broken; the notice disappears by itself once the feed carries more than one part of term.

The piping stays in place. Build with several files and the control reappears on its own, listing the sessions it found:

```bash
python3 tools/build_schedule_data.py \
  data/raw/26FA_15W.xlsx data/raw/26FA_11W.xlsx data/raw/26FA_7A.xlsx data/raw/26FA_7B.xlsx \
  --pot-labels 15W,11W,7A,7B \
  --term 26FA --term-label "Fall 2026" \
  --out faculty-schedule/data/26FA/sections.json
```

Nothing in the app needs changing when that happens. Short-session sections carry their session label into the course table and the "Not on the weekly grid" list, and `--pot 15W` on the generator restricts the feed itself if that's ever wanted instead.

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

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

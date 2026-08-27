# ai_projects

Browser-based tools for Brookdale Community College. Single-file HTML, no build step, no CDN dependencies, published through GitHub Pages.

```
ai_projects/
├── .nojekyll
├── README.md
├── faculty-schedule/
│   ├── index.html                    the tool
│   └── data/26FA/sections.json       the feed it reads
└── tools/
    ├── build_schedule_data.py        builds the feed
    └── scrape_schema.md              what the scraper must capture
```

## Faculty Schedule Builder

`faculty-schedule/index.html` → https://mqaissaunee-bcc.github.io/ai_projects/faculty-schedule/

Faculty search their name, their sections load from the published schedule, they add office hours and contact details, and export a weekly schedule as PDF, `.ics`, `.png`, or `.csv`. Chairs add several names and get one sheet per person with a page break between.

Everything typed into the tool — office hours, phone, email — lives in `localStorage` only. Nothing is posted anywhere.

### Enable Pages

Settings → Pages → deploy from branch `main`, folder `/ (root)`. The `.nojekyll` file at the root keeps Pages from running the content through Jekyll.

### Data

The tool tries `data/26FA/sections.json` relative to itself, then the absolute Pages URL, then falls back to an embedded 205-section sample so the page is never dead. `DATA_CANDIDATES` at the top of the script block controls the order. "Load a different data file" in the toolbar accepts any feed JSON, which is the fast way to test a new term before committing it.

Rebuild the feed with `tools/build_schedule_data.py`. Until the scrape lands it reads the enrollment dashboard's existing manifest, which means end times are estimated (`credits × 55 min ÷ meeting days`) and marked `≈` everywhere they appear, and no room numbers exist. `tools/scrape_schema.md` is the contract for replacing those estimates with real data.

### New term

1. Point `--manifest` (or the scrape) at the new term.
2. Write the output to `faculty-schedule/data/<TERM>/sections.json`.
3. Update `DATA_CANDIDATES` in `index.html` to the new term folder.

Faculty drafts are keyed by browser, not by term, so returning users keep their contact block and office hours and only re-pick sections.

### Notes for future edits

- CSP-safe: every handler is `addEventListener`, no inline `on*` attributes. Keep it that way for Canvas embedding.
- Blocks are positioned in `calc(var(--rowh) * n)` units so the print stylesheet can rescale the grid to fit one landscape page by overriding `--rowh`.
- Printed blocks are black on white with a colored left spine, so they stay legible whether or not the user enables background graphics in the print dialog.
- Tests: `node test.js` in a directory with `jsdom` installed covers search, section selection, multi-pattern editing, exports, and persistence.

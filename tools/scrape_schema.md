# Scrape contract

What the scraper needs to capture, and the JSON `build_schedule_data.py` expects back.

## Why a scrape at all

The published enrollment report (`Individual Sects All`) has 18 columns and is missing three things a printable faculty schedule needs:

| Missing | Consequence today |
|---|---|
| End times — only `Section Start Time` exists | Every end time is derived as credits × 55 min ÷ meeting days and flagged `≈`. Any course off the standard block is wrong. |
| Room numbers — `Location` is a campus code (LINC, ORLV, WALL, DE, ONLH) | No room prints. Faculty type them in by hand. |
| Second meeting patterns — one row per section, one start time | A course that lectures MW at 11:00 and labs Friday at 1:30 cannot be represented. |

Also worth capturing: full course titles. The report truncates at 30 characters, which is why "Hacker Tech, Tools & Incident" is missing its last word.

## Fields

One object per section, keyed by section code exactly as it appears in the enrollment report (`NETW-107-001RL`). A flat list of objects each carrying a `section` key also works.

| Field | Required | Notes |
|---|---|---|
| `meetings` | **yes** | Array. This is the whole point of the scrape. Empty array for a fully asynchronous section. |
| `meetings[].days` | yes | `"M"`, `"M, W"`, `"MW"`, `"MWF"`, `"TuTh"`, or `["M","W"]` all parse. Thursday must be distinguishable from Tuesday — `TH`/`Tu` are handled, a bare `T` is read as Tuesday. |
| `meetings[].start` / `.end` | yes | `"2:00 PM"`, `"14:00"`, or `"1400"`. A missing `end` keeps the section flagged as estimated. |
| `meetings[].building` / `.room` | recommended | Concatenated for display. `TBA`, `TBD`, `ONLINE`, `NONE` are treated as absent. |
| `meetings[].type` | optional | `LEC` / `LAB` / `CLIN`. Accepted and ignored for now; capture it anyway, it's free. |
| `title` | recommended | Untruncated. Wins over the report's title when longer. |
| `instructors` | recommended | Array. **Must match the enrollment report's format** — see below. |
| `credits`, `course`, `campus`, `partOfTerm` | optional | Fall back to the enrollment report when absent. |
| `mode` | optional | One of `inperson`, `online-async`, `online-sync`, `hybrid`. Inferred from campus code and meeting pattern when absent. |
| `startDate` / `endDate` | recommended | `YYYY-MM-DD`. Needed to print accurate date ranges for 7A/7B/11W sections and to bound calendar exports. |
| `crn` | optional | Carried through the feed. Useful as a join key if the section-code format ever changes. |

## Instructor names are the sharp edge

The enrollment report gives `"Michael Qaissaunee"` — first name, space, last name, one instructor per section, 89 sections with no instructor at all. If the scrape returns `"Qaissaunee, Michael"` or `"M. Qaissaunee"`, the faculty picker lists the same person twice and each entry has half their courses.

Normalize to the report's `First Last` form, or normalize both sides in the generator. The build prints a warning for every section where the two sources disagree, so run it once and read the output before publishing.

Team-taught sections are the reason `instructors` is an array. The report only ever names one person; if the public schedule lists two, capture both and each will see the section on their own sheet.

## Example

```json
{
  "NETW-107-001RL": {
    "crn": "10421",
    "course": "NETW-107",
    "title": "Introduction to Security",
    "credits": 3,
    "instructors": ["Michael Qaissaunee"],
    "campus": "LINC",
    "mode": "inperson",
    "partOfTerm": "15W",
    "startDate": "2026-09-09",
    "endDate": "2026-12-22",
    "meetings": [
      {"days": "M", "start": "2:00 PM", "end": "3:15 PM", "building": "MAS", "room": "212", "type": "LEC"},
      {"days": "W", "start": "2:00 PM", "end": "4:45 PM", "building": "MAS", "room": "118", "type": "LAB"}
    ]
  }
}
```

## Building the feed

```bash
# scrape plus enrollment counts — the intended steady state
python3 tools/build_schedule_data.py \
  --scrape scraped_meetings.json \
  --manifest https://mqaissaunee-bcc.github.io/AI_Examples/data/26FA/manifest.json \
  --term-label "Fall 2026" \
  --out faculty-schedule/data/26FA/sections.json

# scrape only, no enrollment numbers
python3 tools/build_schedule_data.py --scrape scraped_meetings.json \
  --term 26FA --term-label "Fall 2026" --out faculty-schedule/data/26FA/sections.json
```

Scrape values always beat report values. Sections the scrape misses fall back to the report with estimated end times, so a partial scrape degrades gracefully rather than dropping courses.

## Check before publishing

The build prints what it found; read all four lines.

1. **Section count** should land near 1,628 for 26FA across all parts of term (1,406 of them 15W). A large shortfall means the scrape paginated badly.
2. **Estimated meeting times** should be 0, or close to it. Anything left is a section the scrape missed.
3. **Sections in the report with no scrape record** — the list is printed. Usually cancelled or late-added sections.
4. **Scraped sections not in the report** — also printed. Expect a few; a flood means the section-code format differs between the two systems.

Then open the tool, search a name you know, and check that person's schedule against reality. The 8/27 data has Qaissaunee at 9 sections across 15W and 11W, which is a reasonable smoke test.

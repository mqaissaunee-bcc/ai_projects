# What the scraper needs to capture

The scrape is now the only source. `build_schedule_data.py` reads the spreadsheet it produces and writes `sections.json`. Nothing else feeds the tool.

## The one structural rule

**One row per meeting pattern, not one per section.** A course that lectures MW at 11:00 in MAS 212 and labs Friday at 1:30 in MAS 118 must be two rows sharing a section code:

| Section | Days | Start Time | End Time | Building | Room |
|---|---|---|---|---|---|
| NETW-107-001RL | MW | 11:00 AM | 12:15 PM | MAS | 212 |
| NETW-107-001RL | F | 1:30 PM | 4:15 PM | MAS | 118 |

The generator groups rows by section code and turns each row into one block on the weekly grid. This is the single thing the old enrollment report got wrong, and the only design decision that's painful to fix after the fact.

Everything else in this file is a preference. Get this part right.

## Columns

Header names are matched loosely, so `Section Start Time`, `Start Time`, `Begin Time`, and `start` all resolve to the same field. Case, spaces, and punctuation are ignored. If a column doesn't match, add its header to `ALIASES` at the top of the script.

| Field | Needed | Notes |
|---|---|---|
| Section | **required** | The grouping key. `NETW-107-001RL`. |
| Days | yes | `M`, `MW`, `MWF`, `M, W`, `TuTh`, `M-W-F` all parse. `TH` and `Tu` are distinguished; a bare `T` reads as Tuesday. |
| Start Time / End Time | yes | `2:00 PM`, `14:00`, `1400`, or a real Excel time cell. A missing end time still works — it renders with a `≈` flag and a warning. |
| Building / Room | yes | Either one column or both; they're concatenated. `TBA`, `TBD`, `NONE`, `STAFF` are treated as empty. |
| Instructor | yes | See below. |
| Course Title | yes | Untruncated. The old report cut titles at 30 characters. |
| Credits, Course, Campus | recommended | Course and campus are derived from the section code when missing. |
| Part of Term | recommended | `15W`, `11W`, `7A`, `7B`. Without it everything is labeled `15W` — see `--default-pot`. |
| Start Date / End Date | recommended | What makes 7A/7B sections print honestly and what the `.ics` export needs to bound recurrence. |
| Instructional Method | optional | Text like "Online Asynchronous" or "Hybrid" is matched against keywords. Otherwise inferred from campus code and meeting pattern. |
| CRN | optional | Carried through as a stable join key. |
| Status | optional | Rows matching /cancel/ are dropped unless you pass `--keep-cancelled`. |

## Instructor names

Both `Qaissaunee, Michael` and `Michael Qaissaunee` work — the script flips `Last, First` automatically. Be consistent within a single scrape, or the same person appears twice in the picker with half their courses each.

Multiple instructors in one cell are split on `;`, `&`, ` and `, and `/`. A section with two instructors shows up on both people's sheets. Sections with no instructor are kept in the feed but appear under nobody's name, and the build reports how many there are.

## Running it

```bash
# 1. Look before you leap. Prints the column mapping, writes nothing.
python3 tools/build_schedule_data.py --inspect data/raw/26FA_schedule_20260901.xlsx

# 2. Build.
python3 tools/build_schedule_data.py data/raw/26FA_schedule_20260901.xlsx \
  --term 26FA --term-label "Fall 2026" \
  --out faculty-schedule/data/26FA/sections.json
```

Useful flags: `--pot 15W` keeps only 15-week sections, `--names as-is` disables name flipping, `--default-pot` sets the label when the sheet has no part-of-term column, `--keep-cancelled` keeps cancelled sections.

`tools/sample_scrape.xlsx` is a five-row example in the expected shape, including a multi-pattern section, a two-instructor section, an asynchronous section, and a cancelled one. `python3 tools/build_schedule_data.py --inspect tools/sample_scrape.xlsx` is a quick way to confirm your setup works before pointing it at real data.

## Read the four output lines

```
1628 sections · 503 instructors · 214 multi-pattern -> faculty-schedule/data/26FA/sections.json
  0 meeting times with no end time
  12 scheduled meetings with no room
  89 sections with no instructor (nobody's sheet will show them)
```

- **Sections** near 1,628 for a full 26FA scrape. A big shortfall means pagination dropped pages.
- **Multi-pattern** should be well above zero. If it's 0, the scraper is collapsing patterns into one row and you've lost the lab meetings.
- **No end time** should be 0. Anything else prints with a `≈`.
- **No instructor** was 89 in the enrollment report; a similar number is normal for unassigned sections.

Then open the tool, search a name you know, and check it against reality.

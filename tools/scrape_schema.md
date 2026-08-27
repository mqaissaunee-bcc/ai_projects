# The schedule feed: source format and known quirks

The scrape is now the only source. `build_schedule_data.py` reads the spreadsheet it produces and writes `sections.json`. Nothing else feeds the tool.

## The one structural rule

**One row per meeting pattern, not one per section.** A course that lectures MW at 11:00 in MAS 212 and labs Friday at 1:30 in MAS 118 must be two rows sharing a section code:

| Section | Days | Start Time | End Time | Building | Room |
|---|---|---|---|---|---|
| NETW-107-001RL | MW | 11:00 AM | 12:15 PM | MAS | 212 |
| NETW-107-001RL | F | 1:30 PM | 4:15 PM | MAS | 118 |

The generator groups rows by section code and turns each row into one block on the weekly grid. This is the single thing the old enrollment report got wrong, and the only design decision that's painful to fix after the fact.

Everything else in this file is a preference. Get this part right.

## What the 8/27 export actually looks like

The report has two sheets. The generator always takes the section-level one (`Individual Sects All`), never the consolidated summary that comes first.

Multiple meeting patterns are packed into a single row as parallel comma-separated lists, not as separate rows:

```
Meeting Days        'M T W TH, M T W TH'
Section Start Time  ' 9:00 AM,  10:15 AM'
Section End Time    ' 10:15 AM,  1:45 PM'
Room                'MAS 101, HOSP CLIN'
```

Commas separate patterns; spaces separate days within a pattern. The generator zips the lists positionally. 162 of 1,401 sections use this, up to three patterns each. Where a row lists fewer rooms than patterns (48 sections), the extras print blank rather than guessing, and the build warns.

If a future export switches to one row per meeting pattern instead, that also works — rows are grouped by section code and each row contributes its patterns.

### The instructor column mixes four conventions

```
Michael Qaissaunee                  First Last
Qaissaunee, M                       Last, Initial
Hansen, P; Healy, J; Cole, C        three people, semicolons
Cheryl Fencik, Gregory Augustino    two people, comma
```

The comma is doing two different jobs. The rule: a comma between two multi-token names separates people; a comma between two single tokens is Last-comma-First. Without this, `Cheryl Fencik, Gregory Augustino` collapses into one nonexistent person.

The same person also appears under two spellings — `Michael Qaissaunee` on five sections and `Qaissaunee, M` on a sixth. `canonicalize_names()` merges an initial form into a full form when exactly one full form shares the surname and initial, and leaves it alone plus warns when two people could match. On the 8/27 file this merged 80 variants, taking 589 raw names down to 479 real instructors. 186 instructors appear only in initial form and stay that way, which is correct — there is nothing to merge them with.

### No part-of-term column

This export is one part of term per file and carries no session column, so `--default-pot` supplies the label. Pass all four files at once:

```bash
python3 tools/build_schedule_data.py \
  data/raw/26FA_15W.xlsx data/raw/26FA_11W.xlsx data/raw/26FA_7A.xlsx data/raw/26FA_7B.xlsx \
  --pot-labels 15W,11W,7A,7B \
  --term 26FA --term-label "Fall 2026" \
  --out faculty-schedule/data/26FA/sections.json
```

Duplicate section codes across files are kept once, from the first file, with a warning.

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

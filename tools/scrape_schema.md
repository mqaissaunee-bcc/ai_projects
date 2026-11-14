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

## Labs: two columns to add to the scrape

A four-credit science course arrives as one section with a lecture pattern and
a lab pattern. Counted whole, a lecturer with five of them shows **25 contact
hours against a 15-hour load**. The lab is usually run by an instructional
assistant, so it belongs on neither the lecturer's grid nor their load.

Because the scrape is already **one row per meeting pattern**, it is in the
best possible position to say so. Two columns settle it.

### 1. Put each pattern's own instructor on its own row

Not the section's primary instructor repeated down the rows — the person who
actually teaches *that* pattern:

| Section | Days | Start | End | Room | Instructor | Component |
|---|---|---|---|---|---|---|
| BIOL-111-004RL | MW | 12:30 PM | 1:45 PM | ATC 103 | Fencik, Cheryl | LEC |
| BIOL-111-004RL | W | 2:00 PM | 3:45 PM | MAS 052 | Augustino, Gregory | LAB |

The generator writes each row's instructor onto its pattern as `m.in`, and the
tool leaves a pattern off the sheet, the grid and the contact-hour total when
it names somebody other than the person whose schedule it is. Fencik's five
sections go from 25 contact hours to 15.

This cuts both ways, which is why it is worth tagging every row and not only
the ones that disagree: a pattern named under the person whose sheet it is
is *confirmed theirs*, and the tool then stops offering to remove it.

Leave a row's Instructor blank rather than filling it with the lecturer's name
when the real one is unknown — a wrong name is worse than none. Where a row is
blank, nothing is tagged and every pattern is kept.

### 2. Capture the component / schedule type

`Component`, `Schedule Type` and `Meeting Type` all map to the same field. Any
of `LEC`, `LAB`, `LBA`, `Studio`, `Clinical`, `Practicum` is understood;
anything matching lab/laboratory/studio/clinical/practicum marks the pattern
`kind: "lab"`. That is a stated fact, so the tool says "Listed as a lab"
rather than "Looks like a lab", and the room guess below is skipped entirely
for that section.

### What happens without them

Two fallbacks, in order.

**A packed Instructor cell.** The 20-column `Individual Sects All` export puts
one name per pattern in a single cell, in the same order as the days, times and
rooms, with `;` between names written `Last, F` and `,` between names written
`First Last`:

```
Room:       MAS 053, MAS 042
Instructor: Robert Gant, Blake Jambor
```

Where the counts line up, the generator reads it positionally. In the
September report that covered 67 of 161 multi-pattern sections; the 13- and
14-column reports since then mostly list the lecturer alone — 8 of 160 in the
spring file — which is why the scrape is the better source.

**The rooms.** `mark_lab_patterns()` reads every section of a course together:
a room that only ever turns up as a later pattern, never as the one the course
opens with, is a dedicated lab room. BIOL-111 lectures sit in ATC 103 and its
labs in MAS 052. The pattern is flagged `m.lab`, which the tool *offers* for
removal and never acts on by itself — a studio course that simply changes
rooms looks identical from here. The build prints how many were flagged.

Neither fallback changes the published figures: `ch` on the section stays the
whole-section total, and the subtraction happens in the tool, per sheet.

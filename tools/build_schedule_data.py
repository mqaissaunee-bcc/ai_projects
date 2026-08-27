#!/usr/bin/env python3
"""
build_schedule_data.py — build the JSON feed consumed by faculty-schedule/index.html

Two sources, either or both:

  --scrape    scraped_meetings.json   real meeting patterns, rooms, end times
              (see tools/scrape_schema.md for the contract)
  --manifest  the enrollment dashboard manifest URL, for enrollment/capacity
              and as a fallback for sections the scrape missed

Scrape fields always win over the enrollment report. Meeting times that come
from the scrape are marked est=false; times derived from the enrollment report
(which carries a start time but no end time) are marked est=true and the app
flags them with a visible ≈ so nobody prints a guessed end time unknowingly.

Examples
--------
# scrape only — the target state
python3 tools/build_schedule_data.py --scrape scraped_meetings.json \
    --term 26FA --term-label "Fall 2026" \
    --out faculty-schedule/data/26FA/sections.json

# scrape plus enrollment counts
python3 tools/build_schedule_data.py --scrape scraped_meetings.json \
    --manifest https://mqaissaunee-bcc.github.io/AI_Examples/data/26FA/manifest.json \
    --term-label "Fall 2026" \
    --out faculty-schedule/data/26FA/sections.json

# enrollment only — end times estimated, no rooms (what shipped in v1)
python3 tools/build_schedule_data.py --manifest <url> --out sections.json
"""

import argparse, io, json, math, re, sys, urllib.request
from datetime import datetime, timezone

try:
    import openpyxl
except ImportError:
    openpyxl = None

DAY_MAP = {"M": "M", "MO": "M", "MON": "M",
           "T": "T", "TU": "T", "TUE": "T",
           "W": "W", "WE": "W", "WED": "W",
           "TH": "R", "R": "R", "THU": "R", "THUR": "R",
           "F": "F", "FR": "F", "FRI": "F",
           "SA": "S", "S": "S", "SAT": "S",
           "SU": "U", "U": "U", "SUN": "U"}
ONLINE_CAMPUS = {"DE"}
HYBRID_CAMPUS = {"ONLH"}
VALID_MODES = {"inperson", "online-async", "online-sync", "hybrid"}


# ---------- helpers ----------

def fetch(url):
    if re.match(r"^https?://", url):
        with urllib.request.urlopen(url) as r:
            return r.read()
    with open(url, "rb") as f:
        return f.read()


def to_min(t):
    """'2:00 PM', '14:00', '1400' -> minutes past midnight."""
    if t is None or t == "":
        return None
    t = str(t).strip().upper().replace(".", "")
    m = re.match(r"^(\d{1,2}):(\d{2})\s*(AM|PM)?$", t)
    if not m:
        m2 = re.match(r"^(\d{2})(\d{2})$", t)
        if not m2:
            return None
        h, mi, ap = int(m2.group(1)), int(m2.group(2)), None
    else:
        h, mi, ap = int(m.group(1)), int(m.group(2)), m.group(3)
    if ap == "PM" and h != 12:
        h += 12
    if ap == "AM" and h == 12:
        h = 0
    if h > 23 or mi > 59:
        return None
    return h * 60 + mi


def hhmm(mins):
    return None if mins is None else "%02d:%02d" % (mins // 60, mins % 60)


def parse_days(s):
    """Accepts 'M, W', 'MW', 'MWF', ['M','W'], 'TuTh'."""
    if not s:
        return []
    if isinstance(s, list):
        toks = [str(x) for x in s]
    else:
        s = str(s).strip().upper()
        if re.search(r"[,\s/]", s):
            toks = re.split(r"[,\s/]+", s)
        else:
            toks, i = [], 0
            while i < len(s):                      # walk two chars first: TH before T
                if s[i:i + 2] in DAY_MAP:
                    toks.append(s[i:i + 2]); i += 2
                elif s[i] in DAY_MAP:
                    toks.append(s[i]); i += 1
                else:
                    i += 1
    out = []
    for t in toks:
        k = DAY_MAP.get(t.strip().upper())
        if k and k not in out:
            out.append(k)
    return out


def estimate_minutes(credits, n_days):
    if not credits or credits <= 0 or n_days <= 0:
        return None
    per = (credits * 55) / n_days
    return max(50, min(int(math.ceil(per / 5.0) * 5), 240))


def infer_mode(campus, days, start):
    if campus in ONLINE_CAMPUS:
        return "online-sync" if days else "online-async"
    if campus in HYBRID_CAMPUS:
        return "hybrid"
    if not days and start is None:
        return "online-async"
    return "inperson"


def dept_of(course):
    m = re.match(r"^([A-Z]+)", course or "")
    return m.group(1) if m else "OTHER"


def norm_meetings(raw):
    """Scrape meeting list -> feed meeting list."""
    out = []
    for m in raw or []:
        s, e = to_min(m.get("start")), to_min(m.get("end"))
        room = m.get("room")
        bld = m.get("building")
        label = " ".join(x for x in [bld, room] if x) or None
        if label and re.fullmatch(r"(TBA|TBD|ONLINE|NONE)", label.strip(), re.I):
            label = None
        out.append({
            "d": parse_days(m.get("days")),
            "s": hhmm(s),
            "e": hhmm(e),
            "rm": label,
            "est": e is None,
        })
    return out


# ---------- sources ----------

def load_enrollment(manifest_url):
    """{section_code: record} from the newest snapshot of each part of term."""
    if openpyxl is None:
        sys.exit("openpyxl is required to read enrollment snapshots: pip install openpyxl")
    base = manifest_url.rsplit("/", 1)[0] + "/"
    manifest = json.loads(fetch(manifest_url))
    newest = {}
    for e in manifest.get("snapshots", []):
        pot = e.get("part_of_term") or "15W"
        if pot not in newest or e["date"] > newest[pot]["date"]:
            newest[pot] = e

    rows = {}
    for pot, entry in sorted(newest.items()):
        wb = openpyxl.load_workbook(io.BytesIO(fetch(base + entry["file"])), read_only=True)
        name = next((n for n in wb.sheetnames if re.search(r"individual\s*sect|query", n, re.I)), wb.sheetnames[0])
        it = wb[name].iter_rows(values_only=True)
        hdr = next(it)
        for r in it:
            d = dict(zip(hdr, r))
            code = (d.get("Section") or "").strip()
            if code and code not in rows:
                d["_pot"] = pot
                rows[code] = d
    return rows, manifest, {p: e["date"] for p, e in newest.items()}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scrape", help="scraped meetings JSON (see tools/scrape_schema.md)")
    ap.add_argument("--manifest", help="enrollment dashboard manifest URL")
    ap.add_argument("--out", default="sections.json")
    ap.add_argument("--term", default=None)
    ap.add_argument("--term-label", default=None)
    ap.add_argument("--pot", default=None, help="restrict output to one part of term, e.g. 15W")
    args = ap.parse_args()

    if not args.scrape and not args.manifest:
        sys.exit("Need --scrape, --manifest, or both.")

    scrape = json.loads(fetch(args.scrape)) if args.scrape else {}
    if isinstance(scrape, list):                      # tolerate a list of records
        scrape = {r["section"]: r for r in scrape if r.get("section")}

    enroll, manifest, as_of = ({}, {}, {})
    if args.manifest:
        enroll, manifest, as_of = load_enrollment(args.manifest)

    codes = sorted(set(enroll) | set(scrape))
    sections, warnings, name_drift = [], [], []

    for code in codes:
        r = enroll.get(code, {})
        sc = scrape.get(code, {})

        course = sc.get("course") or (r.get("Course") or "").strip() or code.rsplit("-", 1)[0]
        # the enrollment export truncates titles at 30 chars, so prefer the scrape
        t_enroll = (r.get("Course Title") or "").strip()
        t_scrape = (sc.get("title") or "").strip()
        title = t_scrape if len(t_scrape) >= len(t_enroll) else t_enroll

        credits = sc.get("credits")
        if credits is None:
            credits = r.get("Course Credit") or 0
        campus = sc.get("campus") or ((r.get("Location") or "").strip() or None)
        pot = sc.get("partOfTerm") or r.get("_pot") or "15W"
        if args.pot and pot != args.pot:
            continue

        days = parse_days(r.get("Meeting Days"))
        start = to_min(r.get("Section Start Time"))

        if sc.get("meetings"):
            meetings = norm_meetings(sc["meetings"])
            for m in meetings:
                if m["est"]:
                    warnings.append(f"{code}: scrape supplied no end time")
        elif days or start is not None:
            dur = estimate_minutes(credits, len(days) or 1)
            meetings = [{"d": days,
                         "s": hhmm(start),
                         "e": hhmm(start + dur) if (start is not None and dur) else None,
                         "rm": None,
                         "est": True}]
        else:
            meetings = []

        instructors = sc.get("instructors")
        if not instructors:
            instructors = [r["Instructor"].strip()] if r.get("Instructor") else []
        instructors = [i for i in instructors if i]
        # Name format drift between the scrape and the enrollment report splits one
        # person into two entries in the faculty picker. Catch it early.
        if sc.get("instructors") and r.get("Instructor"):
            if r["Instructor"].strip() not in instructors:
                name_drift.append(f"{code}: scrape says {instructors} but enrollment says {r['Instructor'].strip()!r}")

        mode = sc.get("mode")
        if mode not in VALID_MODES:
            if mode:
                warnings.append(f"{code}: unknown mode {mode!r}, inferring instead")
            first = meetings[0] if meetings else {}
            mode = infer_mode(campus, first.get("d"), to_min(first.get("s")))

        sections.append({
            "id": code,
            "c": course,
            "t": title,
            "cr": credits,
            "dept": dept_of(course),
            "campus": campus,
            "pot": pot,
            "mode": mode,
            "i": instructors,
            "enr": r.get("Enrolled Students"),
            "cap": r.get("Capacity"),
            "wl": r.get("Wait List"),
            "m": meetings,
            "sd": sc.get("startDate"),
            "ed": sc.get("endDate"),
            "crn": sc.get("crn"),
        })

    scraped_ids = set(scrape)
    if scraped_ids and enroll:
        missing = sorted(set(enroll) - scraped_ids)
        if missing:
            warnings.append(f"{len(missing)} sections in the enrollment report have no scrape record "
                            f"(end times estimated): {', '.join(missing[:5])}"
                            + (" …" if len(missing) > 5 else ""))
        extra = sorted(scraped_ids - set(enroll))
        if extra:
            warnings.append(f"{len(extra)} scraped sections are not in the enrollment report: "
                            f"{', '.join(extra[:5])}" + (" …" if len(extra) > 5 else ""))

    if name_drift:
        warnings.append(f"{len(name_drift)} sections where the scraped instructor name does not match the "
                        f"enrollment report — normalize one side or the picker will list the person twice:")
        warnings.extend("    " + d for d in name_drift[:5])

    est = sum(1 for s in sections for m in s["m"] if m["est"])
    faculty = sorted({n for s in sections for n in s["i"]})
    out = {
        "term": args.term or manifest.get("term"),
        "termLabel": args.term_label or args.term or manifest.get("term"),
        "generated": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "asOf": as_of,
        "meetingSource": "scrape" if scrape and not est else ("scrape+enrollment" if scrape else "enrollment"),
        "faculty": faculty,
        "sections": sections,
    }
    with open(args.out, "w") as f:
        json.dump(out, f, separators=(",", ":"))

    print(f"{len(sections)} sections · {len(faculty)} instructors · {est} estimated meeting times -> {args.out}")
    for w in warnings[:20]:
        print("  ! " + w)
    if len(warnings) > 20:
        print(f"  ! …and {len(warnings) - 20} more")


if __name__ == "__main__":
    main()

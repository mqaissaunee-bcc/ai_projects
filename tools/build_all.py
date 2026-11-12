#!/usr/bin/env python3
"""
build_all.py — rebuild every term's feed from the newest spreadsheet in data/raw/.

Reads faculty-schedule/data/terms.json, which says for each term which raw files
belong to it and how it should be built, then calls build_schedule_data.py.
Run from the repository root; this is what the GitHub Action runs on a push.

    python3 tools/build_all.py            # every term
    python3 tools/build_all.py 27SP       # one term
"""

import datetime, glob, json, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX = os.path.join(ROOT, "faculty-schedule", "data", "terms.json")
RAW = os.path.join(ROOT, "data", "raw")
BUILDER = os.path.join(ROOT, "tools", "build_schedule_data.py")


def raw_date(path):
    """The MMDDYY a report is named with, which beats the file's timestamp:
    copying or cloning rewrites mtimes, the name keeps the real order."""
    m = re.search(r"_(\d{2})(\d{2})(\d{2})\.[A-Za-z]+$", os.path.basename(path))
    if m:
        mm, dd, yy = (int(x) for x in m.groups())
        try:
            return (1, datetime.date(2000 + yy, mm, dd).toordinal())
        except ValueError:
            pass
    return (0, int(os.path.getmtime(path)))


def newest_raw(prefix):
    """The latest spreadsheet for a term, .xlsx or .csv."""
    hits = []
    for ext in ("xlsx", "xlsm", "csv"):
        hits += glob.glob(os.path.join(RAW, prefix + "*." + ext))
    hits = sorted(set(hits), key=raw_date)
    return hits[-1] if hits else None


def main():
    args = sys.argv[1:]
    force = "--force" in args
    args = [a for a in args if a != "--force"]
    only = args[0] if args else None
    with open(INDEX) as f:
        terms = json.load(f).get("terms", [])

    built, skipped, failed = [], [], []
    for t in terms:
        code = t["code"]
        if only and code != only:
            continue
        cfg = t.get("build") or {}
        if not cfg:
            skipped.append(f"{code}: no build settings in terms.json")
            continue
        raw = newest_raw(cfg.get("rawPrefix", code))
        if not raw:
            skipped.append(f"{code}: no spreadsheet in data/raw/ starting {cfg.get('rawPrefix', code)}")
            continue

        out = os.path.join(ROOT, "faculty-schedule", t["path"])
        # Rebuilding from an unchanged spreadsheet is not a no-op: where a feed
        # fills gaps from its own previous version, each run drifts a little and
        # invents "changed since" entries. Only build when the raw file is newer.
        feed_src = ""
        if os.path.exists(out):
            try:
                with open(out) as ff:
                    feed_src = json.load(ff).get("source", "") or ""
            except (IOError, ValueError):
                pass
        if not force and feed_src and os.path.basename(raw) in feed_src:
            skipped.append(f"{code}: the feed was already built from "
                           f"{os.path.basename(raw)} (use --force to rebuild anyway)")
            continue
        os.makedirs(os.path.dirname(out), exist_ok=True)
        cmd = [sys.executable, BUILDER, raw,
               "--pot-from-term", "--term", code, "--term-label", t.get("label", code),
               "--out", out]
        if cfg.get("calendar"):
            cmd += ["--calendar", os.path.join(ROOT, cfg["calendar"])]
        if cfg.get("creditsFrom"):
            cmd += ["--credits-from-course", os.path.join(ROOT, cfg["creditsFrom"])]
        if cfg.get("namesFrom"):
            cmd += ["--names-from", os.path.join(ROOT, cfg["namesFrom"])]
        # The feed being replaced is both the diff baseline and, where the export
        # is filtered or lacks credits, the source for what it leaves out.
        if os.path.exists(out):
            cmd += ["--previous", out]
            if cfg.get("fillMissing"):
                cmd += ["--fill-missing"]
            if cfg.get("carryCredits"):
                cmd += ["--carry-credits"]

        print(f"\n=== {code} from {os.path.basename(raw)} ===")
        r = subprocess.run(cmd)
        (built if r.returncode == 0 else failed).append(code)

    print("\nbuilt:   " + (", ".join(built) or "none"))
    for s in skipped:
        print("skipped: " + s)
    if failed:
        print("FAILED:  " + ", ".join(failed))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

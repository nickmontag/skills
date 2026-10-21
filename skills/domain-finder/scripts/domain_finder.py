#!/usr/bin/env python3
"""Domain finder: RDAP availability checking + LLM candidate generation.

Subcommands:
  check    Check availability for explicit names (name.tld, no scheme).
  generate Ask the local Hermes CLI for candidate names from a description,
           then check them via RDAP and report which are available.

Examples:
  domain_finder.py check myapp.com myapp.io myapp.dev
  domain_finder.py generate --description "a recipe-sharing app for dogs" \
      --tlds com,io,app,dev --count 15

Exit codes: 0 = at least one available name found, 1 = none available /
all errors, 2 = usage error.
"""

import argparse
import json
import re
import shlex
import subprocess
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

RDAP_BASE = "https://rdap.org/domain/"
# IANA bootstrap (data.iana.org/rdap/dns.json) has NO entries for these TLDs,
# so rdap.org returns bogus 404s (= "available") for them. Route them to the
# registry RDAP servers directly. Verified 2026-09: Identity Digital runs
# registry services for .io and .sh even though they're unlisted.
DIRECT_RDAP = {
    "io": "https://rdap.identitydigital.services/rdap/domain/",
    "sh": "https://rdap.identitydigital.services/rdap/domain/",
}
# TLDs with no known RDAP at all — rdap.org 404 is NOT trustworthy there.
NO_RDAP = {"so", "me", "gg", "at", "ai", "co", "fm", "tv"}
UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/128.0 Safari/537.36")
# Conservative: rdap.org throttles aggressive loops; keep modest by default.
DEFAULT_WORKERS = 4
DEFAULT_TIMEOUT = 10

LABEL_RE = re.compile(r"^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$")


def normalize(name: str):
    """Return (sld, tld) or None if not a plausible domain.

    A bare SLD with no dot is accepted when `tlds` is provided: it expands
    across the TLD list (caller handles the expansion; this validates the
    SLD shape so `check --file` + `--tlds` works on bare names).
    """
    name = name.strip().lower().replace("https://", "").replace("http://", "")
    name = name.rstrip("/").split("/")[0]
    name = name.split(":")[0]  # strip port
    if "." not in name:
        return None
    sld, _, tld = name.rpartition(".")
    if not (LABEL_RE.match(sld) and LABEL_RE.match(tld) and not sld.startswith("-")
            and not sld.endswith("-")):
        return None
    return sld, tld


def _browser_headers():
    return {"Accept": "application/rdap+json", "User-Agent": UA}


def whois_check(domain: str, timeout: int = 25):
    """whois-based check for TLDs with no RDAP (.me etc).

    Returns (status, detail) where status is one of:
    'registered' | 'available' | 'premium' | 'reserved' | 'error'
    Only 'available' means registrable at retail price — premium/reserved
    names are unregistered in the registry but held back by the registry's
    aftermarket program, so they must NOT count as available.
    """
    import subprocess
    try:
        r = subprocess.run(["whois", domain], capture_output=True,
                           text=True, timeout=timeout)
        out = r.stdout
    except FileNotFoundError:
        return "error", "whois CLI not installed"
    except subprocess.TimeoutExpired:
        return "error", "whois timed out"
    if "Domain Name:" in out or "Registry Domain ID" in out:
        return "registered", None
    low = out.lower()
    if "premium" in low or "aftermarket" in low:
        return "premium", out.strip().splitlines()[0][:100] if out.strip() else None
    if "reserved" in low and "not found" not in low:
        return "reserved", out.strip().splitlines()[0][:100]
    if "available for application" in low:
        return "reserved", "registry application program"
    if ("domain not found" in low or "not found" in low[:2000]
            or "no match" in low[:2000]):
        return "available", None
    return "error", (out.strip()[:100] or "empty whois output")


def rdap_check(domain: str, timeout: int = DEFAULT_TIMEOUT):
    """Query the authoritative RDAP server when known, rdap.org otherwise.

    Returns (status, detail).
    status: 'available' | 'registered' | 'unverifiable' | 'error'
    """
    tld = domain.rpartition(".")[2]
    base = DIRECT_RDAP.get(tld)
    if base is None and tld in NO_RDAP:
        return "unverifiable", "no RDAP for .%s — use whois/registry web check" % tld
    url = (base or RDAP_BASE) + domain
    req = urllib.request.Request(url, headers=_browser_headers())
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            data = json.load(r)
        registrar = ""
        for ent in data.get("entities", []):
            if "registrar" in ent.get("roles", []):
                names = ent.get("vcardArray", [None, []])[1] if ent.get("vcardArray") else []
                for item in names:
                    if item[0] == "fn":
                        registrar = item[3]
                        break
            if registrar:
                break
        events = {e.get("eventAction"): e.get("eventDate", "")[:10]
                  for e in data.get("events", [])}
        return "registered", {"registrar": registrar,
                              "created": events.get("registration"),
                              "expires": events.get("expiration")}
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return "available", None
        if e.code == 429:
            return "error", "rate-limited (429) — increase --delay or reduce workers"
        return "error", f"HTTP {e.code}"
    except Exception as e:  # noqa: BLE001
        return "error", str(e)


def check_names(names, workers=DEFAULT_WORKERS, delay=0.0):
    results = {}
    domains = [n for n in (x.strip().lower() for x in names) if n]

    def work(d):
        if delay:
            time.sleep(delay)
        tld = d.rpartition(".")[2]
        if tld in NO_RDAP:
            return d, *whois_check(d)
        status, detail = rdap_check(d)
        return d, status, detail

    with ThreadPoolExecutor(max_workers=workers) as pool:
        for d, status, detail in pool.map(work, domains):
            results[d] = (status, detail)
    return results


def generate_candidates(description: str, tlds, count: int, model=None,
                        provider=None, timeout=180, reference=None):
    """One-shot LLM call via the local `hermes` CLI. Returns list of names.

    `reference` is an optional path to a text/CSV name list given to the LLM
    as its seed/reference material — it is told to use those names (and
    variations on them) alongside its own ideas.
    """
    tld_str = ", ".join(tlds)
    ref_block = ""
    if reference:
        ref_names = load_name_file(reference, tlds)
        if ref_names:
            shown = "\n".join("- " + n for n in ref_names[:200])
            ref_block = (
                f"\nHere is a reference list of names to use as your seed "
                f"material. Check these ideas and generate variations on "
                f"them, as well as your own:\n{shown}\n"
            )
    prompt = (
        f"Brainstorm {count} short, brandable domain names for: {description!r}. "
        f"Rules: single words or tight compounds, lowercase letters and hyphens "
        f"only, 3-14 characters for the name part, pronounceable, no numbers. "
        f"Each must be a real, creative candidate relevant to the description — "
        f"NEVER placeholders like name1.com or example.com. "
        f"{ref_block}"
        f"Return ONLY a JSON array of {count} full domains using these TLDs: "
        f"{tld_str}. Example format: [\"puplate.com\", \"barkbistro.app\"]. No prose."
    )
    cmd = ["hermes", "chat", "-q", prompt, "--cli"]
    if model:
        cmd += ["-m", model]
    if provider:
        cmd += ["--provider", provider]
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except FileNotFoundError:
        sys.exit("error: `hermes` CLI not found on PATH")
    if out.returncode != 0:
        sys.exit(f"error: hermes chat failed: {out.stderr.strip()[:500]}")
    text = out.stdout
    matches = list(re.finditer(r"\[[^\[\]]*\]", text, re.S))
    # The CLI echoes the prompt (which contains an example array) — take the LAST
    # array, which is the model's answer.
    if not matches:
        sys.exit("error: no JSON array in LLM output:\n" + text[:800])
    m = matches[-1]
    try:
        # The CLI hard-wraps output mid-string, so strip ALL whitespace inside
        # the array (domains contain no spaces, so this is safe).
        raw = json.loads(re.sub(r"\s+", "", m.group(0)))
    except json.JSONDecodeError:
        sys.exit("error: could not parse LLM JSON array:\n" + m.group(0)[:500])
    valid = []
    placeholder = re.compile(r"^(name\d+|example|test|domain\d*|foo|bar|baz)\b")
    for item in raw:
        if isinstance(item, str) and normalize(item) \
                and not placeholder.match(normalize(item)[0]):
            valid.append(item.strip().lower())
    return valid


def load_name_file(path, tlds=None):
    """Load candidate names from a text or CSV file.

    Accepted formats:
    - one domain per line:                 myapp.com
    - one bare SLD per line (needs --tlds): myapp
    - CSV with a header row. Columns: either `domain` or `sld` (+ optional
      `tld`); any other columns are ignored. Bare `sld` rows expand across
      `tlds` when provided.

    Lines starting with # are comments. Returns a list of domain strings.
    """
    import csv
    out = []
    with open(path, newline="", encoding="utf-8") as f:
        sample = f.read(4096)
        f.seek(0)
        is_csv = "," in sample.splitlines()[0] if sample.splitlines() else False
        if is_csv:
            reader = csv.DictReader(
                ln for ln in f if not ln.lstrip().startswith("#"))
            cols = {c.strip().lower(): c for c in (reader.fieldnames or [])}
            for row in reader:
                if "domain" in cols and row.get(cols["domain"]):
                    out.append(row[cols["domain"]].strip())
                elif "sld" in cols and row.get(cols["sld"]):
                    sld = row[cols["sld"]].strip()
                    row_tld = (row.get(cols.get("tld", ""), "") or "").strip() \
                        if "tld" in cols else ""
                    if row_tld:
                        out.append(f"{sld}.{row_tld}")
                    elif tlds:
                        out.extend(f"{sld}.{t}" for t in tlds)
                    else:
                        print(f"skipping {sld}: bare SLD in CSV without "
                              f"--tlds or a tld column", file=sys.stderr)
        else:
            for ln in f:
                ln = ln.strip()
                if not ln or ln.startswith("#"):
                    continue
                out.append(ln.split()[0])  # allow trailing comments/whitespace
    return [n for n in out if n]


def print_results(results):
    available, registered, errors = [], [], []
    for d in sorted(results):
        status, detail = results[d]
        if status == "available":
            available.append(d)
        elif status == "registered":
            registered.append((d, detail))
        else:
            errors.append((d, detail))
    if available:
        print("AVAILABLE")
        for d in available:
            print(f"  + {d}")
    if registered:
        print("\nREGISTERED")
        for d, det in registered:
            bits = []
            if det and det.get("created"):
                bits.append(f"created {det['created']}")
            if det and det.get("expires"):
                bits.append(f"expires {det['expires']}")
            if det and det.get("registrar"):
                bits.append(det["registrar"])
            print(f"  - {d}" + ("  (" + ", ".join(bits) + ")" if bits else ""))
    if errors:
        print("\nUNVERIFIABLE / ERRORS")
        for d, err in errors:
            print(f"  ? {d}: {err}")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)

    pc = sub.add_parser("check", help="check explicit domain names")
    pc.add_argument("names", nargs="*", help="domains like myapp.com")
    pc.add_argument("--file", default=None,
                    help="read names from a .txt (one domain/SLD per line) "
                         "or .csv (columns: domain, or sld + optional tld)")
    pc.add_argument("--tlds", default=None,
                    help="expand bare SLDs from --file across these TLDs "
                         "(comma-separated)")
    pc.add_argument("--workers", type=int, default=DEFAULT_WORKERS)
    pc.add_argument("--delay", type=float, default=0.0,
                    help="per-request sleep seconds (anti-throttle)")
    pc.add_argument("--json", action="store_true")

    pg = sub.add_parser("generate", help="LLM-generate candidates, then check")
    pg.add_argument("--description", required=True)
    pg.add_argument("--reference", default=None,
                    help="path to a text/CSV name list the LLM should use as "
                         "its reference/seed list (checked alongside its own "
                         "ideas)")
    pg.add_argument("--file", default=None,
                    help="extra names from a text/CSV file, checked alongside "
                         "the LLM's ideas (same formats as `check --file`; "
                         "bare SLDs expand across --tlds)")
    pg.add_argument("--tlds", default="com,io,app,dev,net")
    pg.add_argument("--count", type=int, default=15)
    pg.add_argument("--model", default=None)
    pg.add_argument("--provider", default=None)
    pg.add_argument("--workers", type=int, default=DEFAULT_WORKERS)
    pg.add_argument("--delay", type=float, default=0.0)
    pg.add_argument("--json", action="store_true")

    args = ap.parse_args()

    file_names = []
    expand_tlds = [t.strip().lower()
                   for t in (getattr(args, "tlds", "") or "").split(",")
                   if t.strip()]
    if getattr(args, "file", None):
        file_names = load_name_file(args.file, expand_tlds)
        if not file_names:
            sys.exit("error: no usable names found in the file")

    if args.cmd == "check":
        raw_names = list(args.names) + list(file_names)
        # bare SLDs from the file expand across --tlds when given
        expanded = []
        for n in raw_names:
            if "." not in n and expand_tlds:
                expanded.extend(f"{n.strip().lower()}.{t}" for t in expand_tlds)
            else:
                expanded.append(n)
        bad = [n for n in expanded if not normalize(n)]
        if bad:
            print(f"skipping implausible names: {bad}", file=sys.stderr)
        names = [n for n in expanded if normalize(n)]
        if not names:
            sys.exit(2)
        results = check_names(names, args.workers, args.delay)
    else:
        tlds = [t.strip().lower() for t in args.tlds.split(",") if t.strip()]
        candidates = generate_candidates(args.description, tlds, args.count,
                                         args.model, args.provider,
                                         reference=getattr(args, "reference",
                                                           None))
        candidates += [n for n in file_names if n not in candidates]
        candidates = [c for c in candidates if normalize(c)]
        if not candidates:
            sys.exit("error: no candidates (LLM produced none / file empty)")
        print(f"checking {len(candidates)} candidates...", file=sys.stderr)
        results = check_names(candidates, args.workers, args.delay)

    if args.json:
        print(json.dumps({d: {"status": s, "detail": x}
                          for d, (s, x) in results.items()}, indent=2))
    else:
        print_results(results)
    sys.exit(0 if any(s == "available" for s, _ in results.values()) else 1)


if __name__ == "__main__":
    main()

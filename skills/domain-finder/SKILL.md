---
name: domain-finder
description: Use when checking domain availability or name ideas.
version: 2.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [domains, rdap, availability, naming]
    related_skills: []
---

# Domain Finder

## Overview

Availability checking + LLM candidate generation, hardened against the three
ways availability data lies. Script: `scripts/domain_finder.py` (stdlib only).

Check: `python3 ~/.hermes/skills/domain-finder/scripts/domain_finder.py check myapp.com myapp.io`
Generate: `... generate --description "..." --tlds com,io,app --count 15 [--model M --provider P]`

Flags: `--json`, `--workers N` (default 4), `--delay S`, `--model/--provider`. Exit 0 iff at least one name is genuinely available.

## Using a name list ("using this list")

Both subcommands accept lists from a file:

```bash
# text file: one domain or bare SLD per line, # comments allowed
python3 scripts/domain_finder.py check --file names.txt
python3 scripts/domain_finder.py check --file names.txt --tlds com,io   # bare SLDs expand across TLDs

# CSV with header row: either a `domain` column, or `sld` + optional `tld`
python3 scripts/domain_finder.py check --file names.csv

# give the list to the LLM as its reference/seed material for generation;
# its ideas and your list are all checked together
python3 scripts/domain_finder.py generate --description "..." \
    --reference seeds.txt --tlds com,io --count 10
python3 scripts/domain_finder.py generate --description "..." \
    --reference seeds.csv --file seeds.csv --tlds com,io   # force-check every listed name too
```

CSV example:

```csv
sld,tld
mind,sh
cyber,me
```

**Agent behavior:** when the user mentions a list in conversation ("check the domains in ~/data/domains.csv", "run these against .io"), resolve the path (`~` and relative paths both work), peek at the first lines to detect format, and run `check --file <path>` — the user should never need to know CLI syntax. If the file doesn't parse cleanly, fall back to reading it and passing names as arguments.

## Status vocabulary (what a result actually means)

- `available` — no registry record AND no premium/reserved marker. Only this means "registrable at retail."
- `registered` — record exists; detail may include registrar/expiry.
- `premium` — unregistered but held for aftermarket ($18k-$250k seen). NOT available.
- `reserved` — registry-held or application-program. NOT available.
- `unverifiable` / `error` — no data source; do not guess.

## Pitfall 1: rdap.org 404s lie for unbootstrapped TLDs

IANA's RDAP bootstrap (data.iana.org/rdap/dns.json) has NO entries for .io, .sh, .so, .me, .gg, .at and other ccTLDs. rdap.org then returns **bogus 404s** which read as available (cost us: bolt.io, forge.sh, nullpad.io, ~15 false positives).

- `DIRECT_RDAP` in the script routes .io/.sh to `rdap.identitydigital.services` (real registry RDAP, unlisted in bootstrap). Browser User-Agent required — plain UAs get 403.
- TLDs in `NO_RDAP` (so, me, gg, at, ai, co, fm, tv + any others) go through `whois_check()` instead.
- Rule: **never trust a 404 from a TLD missing from the IANA bootstrap.** Check the bootstrap before adding a TLD; add a direct route or use whois. Control-test one known-registered domain in that TLD first.

## Pitfall 2: "Domain not found" ≠ registrable

Registries (.me is the worst offender) hold attractive unregistered names in premium/aftermarket programs. WHOIS still says "Domain not found." im.me ($250k) and notice.me ($18k) both fooled a plain check.

- `whois_check()` scans output for: `premium`, `aftermarket`, `reserved`, `available for application` — any hit means NOT available. Only clean "Domain not found" counts.
- Weak spot: some registries (.sh observed) do not surface premium status in whois at all. A whois "available" on such TLDs is *probably* right for ordinary words but must be confirmed at the registrar checkout for anything short/desirable.
- Registrar search pages (Porkbun, Namecheap, GoDaddy) hard-block automated browsers. Don't burn time trying; ask the user to eyeball the checkout price for finalists.

## Pitfall 3: LLM output parsing

The `generate` path calls `hermes chat -q --cli`. Baked-in fixes:
1. The CLI **echoes the prompt** — take the LAST JSON array in stdout, not the first.
2. The CLI **hard-wraps mid-string** — strip all whitespace inside the array before `json.loads`.
3. Filter placeholder junk (`name1.com`, `example.com`) and require format validation before network calls.
4. Flash-tier models may return only 1-2 items despite `--count`; one retry with a reworded prompt is reasonable.

## TLD field guide (learned by testing, 2026-09)

- **Reliable registry-direct RDAP:** .io/.sh (Identity Digital). **No RDAP, whois only:** .me, .so, .gg, .at, .ai, .co, .fm, .tv, .mn, .tl, .gy, .vu, .sb, .ki, .mw, .bz. **Working RDAP + decent whois:** .is (ISNIC), .to (Tonic), .com/.net (Verisign), .dev/.app (Google).
- **Crowded (short names all premium/taken):** .io, .sh, .me, .co, .gg, .is. **Open seams:** .mn — 3-letter pronounceable SLDs were widely available at flat ~$41.50 (verified 163+); single letters showed available but are almost certainly premium-held (unverifiable).
- One-letter domains: registry-reserved or premium on essentially every TLD. Two-letter: swept 1,272 combos across .mn/.cx/.pw/.gs/.tl/.la — zero available. Three-letter: only realistic retail seam is unloved ccTLDs (.mn confirmed).
- Never infer availability from DNS; parked domains don't resolve.

## Search strategy that worked

1. Decide the shape first: real word? word+ish hack (stem + `i.sh`)? verb.me phrase? Each has different TLD fit.
2. Generate candidates (LLM or curated list) in batches of 20-40; check with `--workers 2 --delay 1-2` for whois TLDs, higher for RDAP.
3. For sweeps (hundreds of names), run as a **background terminal job** writing to a log; whois at ~1-2s/check means 1,000 names ≈ 30 min. Foreground calls time out at 600s.
4. Apply the **say-it-out-loud filter** before falling in love: only keep names that read as a natural spoken phrase ("correct me" passes, "argue me" fails).
5. Present finalists with per-TLD price context and the caveat that checkout is the only price truth.

## Verification Checklist

- [ ] TLD checked against IANA bootstrap; direct route or whois path chosen
- [ ] One control-test on a known-registered domain in that TLD
- [ ] Results show only clean "available" as available — no premium/reserved strings missed
- [ ] Batch runs used background jobs with logs, no foreground timeouts
- [ ] Finalists' prices confirmed by the user at a registrar checkout before purchase

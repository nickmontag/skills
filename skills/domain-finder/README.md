# domain-finder

Check whether domain names are actually registrable — not just "unregistered" — and generate candidate names from a plain-English description via an LLM.

## Why this exists

Domain availability data lies in three distinct ways, and each one silently produces false "available" verdicts:

1. **rdap.org returns bogus 404s** for TLDs missing from IANA's RDAP bootstrap (.io, .sh, .me, .gg, .at and others). It cannot route those queries, so it reports "no record" — which reads as available. Most of a naive check's results for those TLDs are fiction.
2. **"Domain not found" ≠ purchasable.** Registries hold attractive unregistered names in premium/aftermarket programs. The authoritative WHOIS genuinely says the domain doesn't exist; the checkout page says $18,000. WHOIS carries no pricing data, so a registry-level check cannot see this.
3. **LLM-generated candidates need defensive parsing.** CLI agents echo prompts back into stdout and hard-wrap output mid-string, which corrupts naive JSON extraction.

This tool routes each TLD to a data source that actually works (registry-direct RDAP where the bootstrap is missing, whois with premium/reserved string detection where RDAP doesn't exist) and classifies every name as `available`, `registered`, `premium`, `reserved`, or `unverifiable`. Only a clean "available" means registrable at retail.

## Install

It lives in the [skills](https://github.com/nickmontag/skills) repo. In Claude Code:

```
/plugin marketplace add nickmontag/skills
/plugin install domain-finder@nickmontag-skills
```

Or clone the repo and link this folder into your skills folder:

```bash
git clone https://github.com/nickmontag/skills ~/src/nickmontag-skills
ln -s ~/src/nickmontag-skills/skills/domain-finder ~/.claude/skills/domain-finder
```

For Codex, link into `~/.codex/skills/` instead. As a skill, the agent brainstorms names itself and runs `check`; the
script also works on its own from this folder (below).

## Quickstart

```bash
# Check specific names
python3 scripts/domain_finder.py check myapp.com myapp.io myapp.dev

# Generate candidates from a description, then check them
python3 scripts/domain_finder.py generate \
    --description "a recipe-sharing app for dogs" \
    --tlds com,io,app,dev --count 10 \
    --model <your-model> --provider <your-provider>
```

Requires Python 3.8+ (stdlib only) and the `whois` CLI for TLDs without RDAP. `generate` also needs the [Hermes](https://github.com/NousResearch/hermes-agent) CLI (`hermes`) on `PATH`.

Flags: `--json` (machine-readable), `--workers N`, `--delay S` (anti-throttle), `--model/--provider` (pass through to the `hermes` CLI used for generation). Exit code 0 iff at least one name is genuinely available.

## What "available" means here

| Status | Meaning |
|---|---|
| `available` | No registry record AND no premium/reserved marker. Registrable at retail. |
| `registered` | Record exists (registrar/dates parsed where available). |
| `premium` | Unregistered but held for aftermarket — observed range $18k-$250k. |
| `reserved` | Registry-held or application-program. |
| `unverifiable` | No working data source for that TLD; the tool refuses to guess. |

The final price truth is always the registrar checkout. This tool eliminates the false positives; it cannot see prices.

## Field notes (as of 2026-09)

- One-letter domains: registry-reserved or premium on essentially every TLD tested.
- Two-letter domains: 1,272 combinations swept across six low-profile ccTLDs — zero available.
- Three-letter domains: the only retail-rate seam found was on low-profile ccTLDs (e.g. .mn).
- Crowded TLDs where everything short is premium or taken: .io, .sh, .me, .co, .gg, .is.
- rdap.org must never be trusted for TLDs missing from data.iana.org/rdap/dns.json — check the bootstrap before adding a TLD, and control-test one known-registered domain first.

### Using a name list

```bash
python3 scripts/domain_finder.py check --file names.txt --tlds com,io
python3 scripts/domain_finder.py check --file names.csv
python3 scripts/domain_finder.py generate --description "..." --reference seeds.txt
```

`--file` reads names from a text file (one domain or bare SLD per line, `#` comments) or a CSV (`domain` column, or `sld` + optional `tld`). Bare SLDs expand across `--tlds`. On `generate`, `--reference` hands the list to the LLM as seed material (its ideas and your list are checked together); `--file` adds names to the check queue directly.

## Status

The RDAP/whois checking paths and the LLM generation path are exercised and working. The per-TLD routing table covers the TLDs listed in `SKILL.md`; new TLDs need a bootstrap check and possibly a direct route before results can be trusted (the tool returns `unverifiable` rather than guessing). Premium detection is reliable where registries surface premium strings in WHOIS (e.g. .me) and best-effort where they don't (e.g. .sh).

## License

MIT (see the [LICENSE](../../LICENSE) at the repo root)

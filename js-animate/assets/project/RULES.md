# Rules

The person's hard rules, in their words, with the date they said them. They override the plan, the storyboard and
any paraphrase of either: when writing a prompt, a spec or code, go back to these words, not to a summary of them.

Every rule names what enforces it: a check in `rules.mjs`, a built-in check in `tools/checks.mjs`, a guard in a
tool, or "by eye" plus where to look. A rule that nothing enforces tends to get broken under momentum.

| # | rule | the person's words (date) | enforced by |
|---|---|---|---|
| 1 | Nothing builds on an item that isn't approved | "…" | `checks.mjs` gate (`uses` in `shots.json`) |
| 2 | Every paid API call needs an OK in chat, with its cost | "…" | the API wrapper refuses a job without a recorded permission (`references/hybrid.md`) |
| 3 | Keep him in the shot | "…" | `rules.mjs` walker-in-frame |

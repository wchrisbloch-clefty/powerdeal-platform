# Knowledge files

§6 of the system prompt names seven reference files. This is where they go.

| | |
|---|---|
| Location | `knowledge/` at the repo root, beside `prompts/` and `skills/` |
| Filename | exactly as §6 names it — `competitive-matrix.md`, `vertical-playbook-refining.md` |
| Registry | `lib/skills/registry.ts` → `KNOWLEDGE` |
| Loader | `lib/skills/knowledge.ts` — server-only, reads verbatim |

## Why a separate directory from `skills/`

A skill is a procedure the model executes. A knowledge file is material it
consults. They have no frontmatter, no slug and no `SKILL-` prefix, so every
check that makes `skills/` safe — filename↔frontmatter agreement, slug identity,
§6 alias resolution — would have to be special-cased to let them through. A
directory with two sets of rules is a directory where the weaker set wins by
accident.

## Adding one

1. Drop the file in, named exactly as §6 names it.
2. Flip its `status` from `awaited` to `present` in `lib/skills/registry.ts`.
3. Run the suite.

Same procedure as `skills/`, and step 2 is required for the same reason: the
`awaited` set is pinned exactly, so a file arriving in step 1 **fails the build**
until someone registers it. That failure is the point — it is the moment the
loader, the size check and the caveat start applying to that file.

## The loader existed before the files did

Deliberately. The gap being closed was not "the files are missing" — it was
"doctrine references material nothing can reach". A file sitting in a directory
no code reads is that same gap wearing a different hat, and it is the gap the
skills spent two versions in.

The `present` path was recorded as unproven for exactly one commit. Six files
landed and it executes now.

## PowerBD.pdf was removed from doctrine, not supplied

It was opened. **It is not a PDF.** It is a ZIP with a `.pdf` extension holding
25 page images and extracted text of "PowerDeal Strategist — System Prompt v1.0"
— a screenshotted copy of the original system prompt, twelve versions stale:
trusted-OEM identity, the pre-v3.1 stage-gate table, no Bloom alignment, no
four-tier set, no relationship types.

Loading it would have put v1.0 doctrine in front of a current model with nothing
on the page saying which wins — worse than absent. **v3.1.11 removed the name
from §6 entirely**, a forcing function went red, and the registry entry was
deleted with it. It survives only in the changelog, recording why.

**Six is the final set.** The `retired` status stays on the type and carries
nothing; its formatter is tested directly, because a branch that only runs the
day something goes wrong is a branch that rots until that day.

## The check is on the bytes, not the extension

There is no `format` field. The extension is exactly what lied — a declared
`format: 'pdf'` would have routed a ZIP to a PDF path, and a PDF parser fails on
a ZIP with a confident error about PDF structure, which is the wrong answer to
the wrong question.

`looksBinary()` sniffs what was actually read: a NUL byte, or a wall of U+FFFD
replacement characters. One verdict for a ZIP, a PDF, a JPEG or a truncated
download — not text, keep it out of the prompt. It runs on every load, so it has
no dead branch and no extension to trust.

## competitive-matrix.md carries a binding caveat

Confirmed on the first real load: the file's Quick Reference table covers recips,
aero turbines, microturbines, MCFC, grid/ERCOT and battery+solar. **There is no
Tier 1B row.** The caveat is not a precaution, it is a true statement about what
a reader would otherwise miss.

**§6 owns the caveat text, and v3.1.11 says so in the line itself:** *"This
sentence is the canonical wording of that caveat; anything that displays it reads
it from here rather than keeping a copy."* There is no `caveat` field on the
registry entry — it held one for exactly one commit, and a rule written in
doctrine and restated in TypeScript is two rules that agree until the first edit.

That trailing parenthetical is **stripped** before display: it addresses whoever
writes the display code, not the model reading a competitive matrix. A mutation
that removed the strip was caught by nothing until an assertion was added for
it — `toContain` never breaks when a sentence is added.

`knowledgeBlock()` prints it **above** the content, not below. Same logic as the
inline-source rule: a warning printed after the material is read by the reader
who already doubted it, and the reader who needs it is the one who did not.

**Commit reference material as-is.** Do not edit it to match current doctrine —
that destroys the record of what it actually said, which is the only reason to
keep a superseded document at all. This is repo procedure, not doctrine, which
is why it lives here and not in the prompt.

## Status

Eight on disk, eight in §6. Six was the final set until v3.1.12 split
`vertical-playbooks.md` into three — one file became three, the shelf did not
grow.

| File | Status | Chars |
|---|---|---|
| `competitive-matrix.md` | present | 5,291 |
| `ercot-market-primer.md` | present | 2,756 |
| `permitting-playbook.md` | present | 3,620 |
| `vertical-playbook-refining.md` | present | 4,540 |
| `vertical-playbook-data-centers.md` | present | 4,614 |
| `vertical-playbook-industrial.md` | present | 3,710 |
| `objection-battlecards.md` | present | 9,718 |
| `reference-bundle.md` | present | 15,803 |

## Nothing loads the whole shelf

Each skill **declares** the files its own prose reasons over, in its frontmatter
(`knowledge: [...]` — see `skills/README.md`). `knowledgeBlocksForSkill(slug)`
returns exactly that, and callers pass a slug, never a filename: there is no way
to reach a knowledge file except through a skill that names it.

Declared, never retrieved. No similarity scoring picks the doctrine a model sees.

| | files | ~tokens |
|---|---|---|
| Whole shelf, loaded blind | 6 | 12,115 |
| Heaviest declared call (`four-lever-calculator`, `prospect-originator`) | 4 | 8,351 |
| Median call | — | 4,377 |
| `permitting-analyzer` | 1 | 928 |
| `stage-gate`, `business-case-engine` | 0 | 0 |

`four-lever-calculator` is both the heaviest and, by its own description, "the
primary deal-advancing tool — use it early and often." That is the strongest
argument for BACKLOG item 9: splitting `vertical-playbooks.md` by vertical would
take it under 6k without touching anything else.

Every file is declared by at least one skill, asserted in both directions — a
registered file nothing names is material the platform carries and can never
show a model, which is §6 naming a ghost, inverted.

## Vertical playbooks are declared per vertical, never wildcarded

v3.1.12 split `vertical-playbooks.md` into three. It carried refining, data
centers and industrial manufacturing in one file at ~2,700 tokens, six of the
seventeen skills declared it, and **not one of them needs more than one vertical
at a time** — a defense call carried hyperscaler clean-energy clauses and
refinery steam balance.

A skill still **declares all three.** The declaration stays static and
auditable, exactly as §6 requires; `selectPlaybook(deal.vertical)` drops the two
that do not apply at load. There is no `vertical-*` glob and no filename
pattern-match at runtime — a wildcard would put the one place this build has
deliberately kept literal back into guessing.

**"None" is a real answer and is said out loud.** §2 names four verticals and
three playbooks exist:

| Vertical | Playbook |
|---|---|
| `O&G-Down` | refining |
| `Data Center` | data-centers |
| `Industrial-Chemical` · `-Semicon` · `-Other` | industrial |
| `Defense` · `Defense/Special` | **none — named absent, never substituted** |
| `O&G-Up` · `O&G-Mid` | **none** — the refining playbook is DOWNSTREAM |
| `Other-*` | none |

`PLAYBOOK_FOR` has an entry for every member of `VERTICALS` and the suite
asserts it, so a new vertical fails the build here rather than falling through
a default into whichever playbook the code reached for. An unrecognised vertical
is reported as unrecognised, not defaulted.

Handing a defense account the data-center playbook because it is the nearest
neighbour is worse than handing it nothing: clauses written for someone else
read as authoritative doctrine to a model that cannot tell.

| | files | ~tokens |
|---|---|---|
| Heaviest declared call, before the split | 4 | 8,351 |
| Heaviest declared call, after (one vertical loaded) | 4 | ~6,000 |
| A defense deal on the same skill | 3 | ~4,900 |

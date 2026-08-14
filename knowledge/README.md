# Knowledge files

§6 of the system prompt names seven reference files. This is where they go.

| | |
|---|---|
| Location | `knowledge/` at the repo root, beside `prompts/` and `skills/` |
| Filename | exactly as §6 names it — `competitive-matrix.md`, `PowerBD.pdf` |
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

## PowerBD.pdf is never read as text

`readFileSync(pdf, 'utf-8')` does not throw. It returns mojibake with a few
legible strings in it — enough like content that a prompt would carry it and a
model would try to use it. The loader checks presence and size for the PDF and
nothing else. A caller that needs its contents needs a PDF extractor.

## competitive-matrix.md carries a binding caveat

Confirmed on the first real load: the file's Quick Reference table covers recips,
aero turbines, microturbines, MCFC, grid/ERCOT and battery+solar. **There is no
Tier 1B row.** The caveat is not a precaution, it is a true statement about what
a reader would otherwise miss.

**§6 owns the caveat text.** There is no `caveat` field on the registry entry —
it held one for exactly one commit, and a rule written in doctrine and restated
in TypeScript is two rules that agree until the first edit.
`parseKnowledgeCaveat()` reads it from the shipped prompt, the same way the skill
list is parsed rather than mirrored. Same discipline as the `tier-1b` and
`Both` → `Multiple` renames: one concept, one authority.

`knowledgeBlock()` prints it **above** the content, not below. Same logic as the
inline-source rule: a warning printed after the material is read by the reader
who already doubted it, and the reader who needs it is the one who did not.

**Commit reference material as-is.** Do not edit it to match current doctrine —
that destroys the record of what it actually said, which is the only reason to
keep a superseded document at all. This is repo procedure, not doctrine, which
is why it lives here and not in the prompt.

## Status

Six of seven are on disk. `PowerBD.pdf` has not been uploaded and stays
`awaited` — it fails the build the moment it appears unregistered.

| File | Status | Chars |
|---|---|---|
| `competitive-matrix.md` | present | 5,291 |
| `ercot-market-primer.md` | present | 2,756 |
| `permitting-playbook.md` | present | 3,620 |
| `vertical-playbooks.md` | present | 10,846 |
| `objection-battlecards.md` | present | 9,718 |
| `reference-bundle.md` | present | 15,803 |
| `PowerBD.pdf` | **awaited** | — |

The shelf is ~48k characters, roughly 12k tokens if every file were embedded at
once. **No prompt module embeds one yet**, so nothing pays that cost today —
but any module that reaches for the whole shelf should pull the files it needs
rather than all six.

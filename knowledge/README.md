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

## The loader exists before the files do

Deliberately. The gap being closed is not "the files are missing" — it is
"doctrine references material nothing can reach". A file sitting in a directory
no code reads is that same gap wearing a different hat, and it is the gap the
skills spent two versions in.

## PowerBD.pdf is never read as text

`readFileSync(pdf, 'utf-8')` does not throw. It returns mojibake with a few
legible strings in it — enough like content that a prompt would carry it and a
model would try to use it. The loader checks presence and size for the PDF and
nothing else. A caller that needs its contents needs a PDF extractor.

## competitive-matrix.md carries a binding caveat

It predates v3.1 and has no fourth-tier entry — and the tier it lacks has itself
been renamed since (`integrator` → `tier-1b`), so a reader consulting it cold
gets two-generations-stale framing with nothing on the page saying so.

The caveat is stored on the registry entry and `knowledgeBlock()` prints it
**above** the content, not below. Same logic as the inline-source rule: a warning
printed after the material is read by the reader who already doubted it, and the
reader who needs it is the one who did not.

**Commit the file as-is.** Do not edit reference material to match current
doctrine — that destroys the record of what it actually said, which is the only
reason to keep a superseded document at all.

## Status

All seven are `awaited`. None have landed.

# Skills

Seventeen skill files existed in the Claude project and none existed here. §6
named fifteen of them, in prose that matched six of the filenames — so every
domain call was telling the model it could reach capabilities that were nowhere
on disk, under names that would not have resolved anyway.

All seventeen are here, and **v3.1.11 rewrote §6 to the slugs**, so doctrine and
the filesystem now use one vocabulary.

## The convention

| | |
|---|---|
| Location | `skills/` at the repo root, beside `prompts/` |
| Filename | `SKILL-<slug>.md` |
| Frontmatter | must declare `name: <slug>`, matching the filename |
| Registry | `lib/skills/registry.ts` — every slug and its status |
| Loader | `lib/skills/load.ts` — server-only, reads the file verbatim |

The content rule is the brain's rule (GLOBAL RULE 6), one layer down: **a skill
is never generated or inferred in code.** It is read verbatim from a committed
markdown file, synced by hand from the Claude.ai project. A paraphrase in
TypeScript is a second copy of doctrine, and second copies drift — which is the
failure this repo has now hit twice.

## Adding a skill

1. Paste the file into `skills/SKILL-<slug>.md`, verbatim — trailing whitespace
   included. In markdown two trailing spaces are a line break, so "tidying" the
   paste edits the doctrine.
2. Add it to `SKILLS` in `lib/skills/registry.ts` with `status: 'present'`, or
   flip an existing `awaited` entry.
3. Run the suite.

Step 2 is not optional and not a formality. The suite pins the `awaited` set
*exactly*, so a file arriving in step 1 **fails the build** until step 2 happens.
That is deliberate: flipping the status is what switches on the frontmatter
check, the loader, and the §6 alias for that skill. A directory scan would have
absorbed the new file silently and none of those would have run.

## What the suite asserts

`tests/skills.test.ts`, in both directions:

- §6's skill list and the registry's slug set are **equal**, in both directions
  — parsed from the shipped prompt, never a second hardcoded copy. Rename a
  skill in the markdown and the suite fails; delete one and it fails too.
  There is no `section6Name` field any more: it recorded six prose/slug
  disagreements, and once v3.1.11 adopted the slugs every value duplicated the
  slug beside it. Set equality is stricter than the alias map it replaced.
- The `**Platform capabilities**` line matches `PLATFORM_CAPABILITIES`, and none
  of those names appears on the skills line. `document-forge` and `market-watch`
  are Buckets 3 and 5 — the skill dependency tables reference them in slug form,
  so they must resolve, but the loader must never demand a file for them.
- Every `present` skill has a readable file whose frontmatter declares its own
  slug. Filename and frontmatter are two independent claims about which skill a
  file is; a file copied from a sibling and renamed carries the wrong one.
- Every `awaited` skill has **no** file, and every file in this directory is a
  registered `present` skill.
- The parser returns a non-empty list. Without that, "every §6 name resolves"
  would be true of the empty set and the whole file would go green while
  doctrine named fifteen ghosts.

## No hard gate

A missing skill degrades output; it does not refuse it. The system prompt still
carries the methodology at lower resolution, so a brief generated without the
skill file is worse but useful — and a rep with a worse brief ten minutes before
a call is better off than a rep with a 503.

What is *not* allowed is silence. `loadSkill` returns the reason, `skillBlock`
puts it in the prompt, and the caller emits a header **before the model runs**
(see `meetingPrepDegradedHeader`) so the notice exists even when generation dies
halfway. A caveat the model was asked to write is a caveat that vanishes exactly
when it matters.

## Skills reference each other, and that resolves too

The dependency tables inside the skill files name sibling capabilities. Reading
all seventeen surfaced two that are **not skills**: `document-forge` and
`market-watch`. Both are real — `POST /api/forge` and the `market-watch` task —
so the references are correct and the category is wrong.

They are declared in `PLATFORM_CAPABILITIES`, and every backticked slug-shaped
identifier in every skill file must resolve to a skill or to one of them. Same
defect class as §6, one layer down: names pointing at nothing, which nobody
notices until a chain actually runs.

**v3.1.11 gave them their own §6 line**, which is the fix that matters — the
distinction is declared in doctrine rather than asserted here on the registry's
own authority. A private list is one step from an ignore list, and an ignore
list absorbs the next genuinely dangling reference silently.

## Outstanding

All seventeen skills are on disk and registered. `awaited` is now empty — which
is exactly when its pin earns its keep: the eighteenth file to arrive fails the
build until someone registers it.

`stage-gate` and `contract-negotiator` are **resolved**. The two "versions" of
each turned out to be byte-identical uploads of the same file — same MD5, no
diff, no version to pick. `versionsPending` carries nothing today; the field
stays because the next duplicate is a question of when.

`business-case-engine` and `meeting-prep` are **named in §6 now**. Both were
built and unreachable by name until v3.1.11 added them — the fifth instance in
this build of a working thing nothing could call.

The six knowledge files §6 references live in `knowledge/` — see that
directory's README. `PowerBD.pdf` was removed from doctrine entirely rather than
supplied; six is the final set.

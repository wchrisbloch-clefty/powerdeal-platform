# Skills

Nineteen skill files existed in the Claude project and none existed here. §6 of
the system prompt names fifteen of them, so every domain call has been telling
the model it can reach capabilities that are nowhere on disk — the same shape as
the brain sitting at v3.1.8 while doctrine was at 3.1.10, one layer further down.

This directory is where they land.

## The convention

| | |
|---|---|
| Location | `skills/` at the repo root, beside `prompts/` |
| Filename | `SKILL-<slug>.md` |
| Frontmatter | must declare `name: <slug>`, matching the filename |
| Registry | `lib/skills/registry.ts` — every slug, its §6 name, its status |
| Loader | `lib/skills/load.ts` — server-only, reads the file verbatim |

The content rule is the brain's rule (GLOBAL RULE 6), one layer down: **a skill
is never generated or inferred in code.** It is read verbatim from a committed
markdown file, synced by hand from the Claude.ai project. A paraphrase in
TypeScript is a second copy of doctrine, and second copies drift — which is the
failure this repo has now hit twice.

## Adding a skill

1. Paste the file into `skills/SKILL-<slug>.md`.
2. Flip its `status` from `awaited` to `present` in `lib/skills/registry.ts`.
3. Run the suite.

Step 2 is not optional and not a formality. The suite pins the `awaited` set
*exactly*, so a file arriving in step 1 **fails the build** until step 2 happens.
That is deliberate: flipping the status is what switches on the frontmatter
check, the loader, and the §6 alias for that skill. A directory scan would have
absorbed the new file silently and none of those would have run.

## What the suite asserts

`tests/skills.test.ts`, in both directions:

- Every name §6 lists resolves to a registry entry — **parsed from the shipped
  prompt file, never a second hardcoded copy.** Rename a skill in the markdown
  and the suite fails, rather than the model failing in front of a customer.
- Every registry entry that claims a §6 name still has one — so deleting a name
  from §6 fails too, instead of the remaining names all quietly still resolving.
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

## Outstanding

One skill is here. Sixteen are registered and awaited; see
`lib/skills/registry.ts` for the list and for the six cases where §6's name and
the file's slug differ.

Two registered skills — `business-case-engine` and `meeting-prep` — are **not
named in §6 at all**. The brain has no instruction to reach for either. That is
a doctrine edit, not a code change.

`stage-gate` and `contract-negotiator` each exist in two versions in the source
project. Their registry entries carry `versionsPending: 2`; the diff gets flagged
before either is committed. Two versions silently merged is a doctrine change
nobody reviewed.

The seven knowledge files §6 references (`competitive-matrix.md`,
`ercot-market-primer.md`, `permitting-playbook.md`, `vertical-playbooks.md`,
`objection-battlecards.md`, `reference-bundle.md`, `PowerBD.pdf`) are also
absent, and pinned the same way.

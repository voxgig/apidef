# Documentation style guide

How the Voxgig Apidef documentation is written. This guide is normative
for the root [`README.md`](./README.md) and every page under
[`docs/`](./docs/README.md) except the design proposals and the reviews —
20 pages, the ones a reader lands on from GitHub, npm and pkg.go.dev. It
exists so that a page written next year sounds like a page written this
year, and so that a reviewer can point at a rule instead of arguing taste.

It is a port of [jostraca/jostraca](https://github.com/jostraca/jostraca)'s
guide, by way of [voxgig/struct](https://github.com/voxgig/struct)'s,
which share an author and a house voice with this project. The structure
and most of the rules are those projects'. Where this one differs — the
spaced em dash, the working-document set, the shape of the four kinds —
the difference is recorded with the measurement behind it, because a
divergence nobody wrote down reads later as drift.

Three sources feed the guide, in a fixed priority order. The same order is
encoded in [`.vale.ini`](./.vale.ini), and every rule switched off there
names the reason and the count it produced:

    house voice  ->  Google  ->  Vale defaults

1. **This file.** Where it rules, it rules. The house voice is Richard
   Rodger's blog register, and the places it wins are listed with their
   reasons rather than left as silent exceptions: the spaced em dash,
   first-person plural in the tutorial, British spellings, and quotation
   punctuation outside the quotes.
2. The [Google developer documentation style
   guide](https://developers.google.com/style) for everything this file
   does not cover: second person, present tense, active voice,
   sentence-style capitalisation in headings, serial commas, one idea per
   sentence.
3. [Vale](https://vale.sh) defaults, which mostly means spelling.

Two gates check it, and both run in CI:

| Gate | Runs | Checks |
|---|---|---|
| `vale --minAlertLevel=error $(python3 tools/check_prose.py --files)` | `make scan-prose`, `.github/workflows/docs.yml` | Google's rules plus the banned list, at the levels set in `.vale.ini` |
| `python3 tools/check_prose.py` | `make scan-prose`, `make test`, and the same workflow | the banned list, the em-dash spacing and ration, the first-person rules, no emoji, no citations of a working document, that every relative link resolves, and that the page set is complete |

The banned list is read from one file by both, so they cannot drift. The
page set comes from one function, `tools/check_prose.py --files`, for the
same reason: a gate reading a smaller set than the other is a gate that
reports green on a page nobody checked.

A Google rule sitting at `warning` rather than `error` was tried at error
level first and found wrong for these pages; `.vale.ini` records what it
produced and why it was demoted.

## The structure: four kinds, enforced by placement

Every page under `docs/` is exactly one of four kinds, and the directory
it sits in decides what the page may do:

| Kind | Files | May | May not |
|---|---|---|---|
| Tutorial | `docs/tutorial/getting-started.md` | teach step by step, show output for every step, defer detail with a link | argue design, list every option, assume the reader's goal |
| How-to | `docs/how-to/*.md` | solve one named task, assume competence, link the reference | teach basics, explain design, drift into a second task |
| Reference | `docs/reference/*.md` | state facts exhaustively and dryly, pin claims to fixtures and tests | narrate, persuade, teach |
| Explanation | `docs/explanation/*.md` | argue, compare, admit trade-offs, tell the design's story | be the only place a fact lives |

`README.md` and `docs/README.md` are doorways and belong to no kind: they
route, give the quick start, and state no fact of their own that a page
below them does not also state.

One fact appears in all four kinds at different altitudes — met in the
tutorial, used in a how-to, specified in the reference, argued in the
explanation — but the normative statement lives in the reference and
everything else links to it. The spec-file path rule is the worked case:
the tutorial meets it in a callout, the library how-to uses it, the
configuration reference states it, and nothing else restates it.

**Documentation never names the framework.** The four kinds come from
`Diátaxis`, and that is a fact about how these pages were planned, not
one a reader needs in order to read them. Say **tutorial**, **how-to**,
**reference** and **explanation**, which are ordinary words that describe
themselves, and let the structure do the explaining. This guide and the
contributor guides are where the name belongs, because there it answers a
question somebody is actually asking.

### The TypeScript build owns the behaviour

This project has an axis jostraca does not: two implementations of one
compiler. The rule that falls out of it is the documentation half of the
rule the code already follows.

**Behaviour is documented once, and it is the TypeScript behaviour.** The
reference pages describe what `ts/` does, in its names and its types; the
Go port has no pages of its own, because a port that reproduces the
canonical build exactly has nothing of its own to say. Where Go must
compensate for a difference in the language — sorted map iteration in
place of insertion order — the explanation page names the compensating
code and the test that pins it. A second description of an operation or
a pass, written from the Go side, is a copy that goes stale the day the
canonical changes.

## Documentation does not cite a working document

**A documentation page never sends a reader to a plan, a review, a
decision record, or an agent instruction file.** Those are working
documents: written for the people changing this repository, argued rather
than stated, and stale the moment the code moves past them. A reader who
follows a link out of the documentation and lands in one has been handed
the project's notes in place of an answer.

The banned set, by name:

| Document | What it is |
|---|---|
| `AGENTS.md`, `CLAUDE.md` | instructions to contributors and agents working in the repository |
| `ADR.md` | the register of fundamental decisions, argued with their context and consequences |
| `TODO.md` | a scratch list of intended changes |
| `docs/design/` | proposals for changes not yet made |
| `docs/review/` | code reviews and parity-fix notes, dated, about the code as it was |
| any `*_PLAN.md` or `*_REVIEW.md`, and `BUILD_LOG.md` | the shapes this project has not needed yet, guarded in advance |

The ban covers the name as much as the link. "The full checklist is in
`AGENTS.md`" fails for the same reason the URL does: the reader still
cannot act on the sentence without leaving the documentation.

State the fact instead. "TypeScript is canonical; change it first, with a
test, then bring Go into parity" is what a reader needs, and a link to the
file that also says so adds nothing to it. The root README and the
documentation index both used to close by sending the reader to the agent
guide; both now state the rule. The model reference and the
classification page both cited a decision record for why a path is
emitted as typed segments rather than a braced string; both now say why
in the sentence. Where the fact belongs in the documentation and is
missing, write it into the page that owns it rather than pointing outside.

The rule runs one way. Working documents cite each other and cite the
documentation freely, because a decision record that does not show its
working is not a decision record. Only the direction out of documentation
is closed.

### What stays linkable, and why

| Linkable | Because |
|---|---|
| source and tests: `ts/src/`, `go/`, the shared fixtures `ts/test/*.tsv`, the goldens `ts/test/model-ref/` | code is the thing a claim is pinned to |
| the canonical model schemas under `model/` | a specification of the shape the pages describe |
| `.github/workflows/` and `ts/cmd/` | the release workflow and the packaging scripts are what the how-to pages describe, and a reader can act on them |
| this guide | normative rather than exploratory, and it names the working documents in order to ban them |

The rule behind the split: **a specification is citable, an argument is
not.**

`tools/check_prose.py` enforces this over the reader-facing pages. Vale
does not, because Vale cannot tell a working document from a page.

## The voice

The house voice is Richard Rodger's blog register, adapted per document
kind. The portable part of that voice is its *rhythm*, not its stock
phrases. Ten habits, with the register they apply in:

1. **Open with a concrete fact or a plainly stated problem, then a short
   dry beat.** Tutorial and how-to pages. Reference pages open by stating
   what the thing is.
2. **Introduce code with a short colon-terminated sentence** — "Run it:",
   "Minimal model:". Never "The following code snippet demonstrates".
   Everywhere.
3. **After a code block, point at the one interesting thing.** Do not
   recap the code. Everywhere.
4. **Parentheses carry definitions, caveats, and at most one dry aside per
   page.** Tutorial and how-to pages. In reference pages, parentheses
   carry facts only — a type, a default, a fixture name.
5. **A trade-off gets bolted on with a dash, and the dash earns its
   place.** One per paragraph at most, never two in a sentence.
6. **Alternate one long explanatory sentence with one short verdict
   sentence.** The short sentence is the payoff. Everywhere.
7. **Talk to the reader as "you", and route them** ("If you only want the
   model in memory, skip to…"). "We" appears only in the tutorial, walking
   through code together. "I" appears nowhere.
8. **Show that the code is real.** A pure function's behaviour is a row in
   `ts/test/<name>.tsv`, run by both suites, and the model a spec produces
   is a golden under `ts/test/model-ref/`. The examples on these pages are
   not executed by a gate, so a claim that has a test names it, and a
   listing shown as output is what the named spec produced: the tutorial's
   output is the petstore spec's, the reference examples are the solar
   spec's.
9. **Jokes are self-directed or about the industry's mundanity, and the
   register goes fully serious the moment correctness or a user's data is
   on the table.** Never joke about the reader, other tools, or a
   published release that cannot be taken back.
10. **Close by handing the reader something**: a link, a next step, one
    sentence. No summary paragraphs that restate the page.

Exclamation marks: at most one per page, in the tutorial only, on a
genuine payoff.

## Banned phrases and patterns

These read as generated filler. Do not use them, in any document,
including commit messages that quote the docs.

**The list itself lives in
[`.vale/styles/config/vocabularies/Apidef/reject.txt`](./.vale/styles/config/vocabularies/Apidef/reject.txt)**,
one regular expression per line. That file is the single source of truth:
Vale reads it in CI, and `tools/check_prose.py` reads the same file rather
than keeping a second copy, so the two gates cannot disagree about what is
banned. Add a phrase there and both pick it up. What follows is a reader's
summary of it, not a second list; every phrase is shown as code so that
quoting a banned phrase in this guide does not fail the gate.

The list is upstream's, unchanged, and it draws on two sources: that
project's original house list, and [claudisms.ai](https://claudisms.ai/),
a catalogue of the patterns that mark machine-written prose. **It was
measured against these pages before it was adopted.** Four entries fired,
once each: `comprehensive`, introducing the documentation index from the
README; `honest`, of the parity mechanisms; `not just`, in the argument
for flows; and `load-bearing`, of the split between the publish and tag
jobs. All four were rewritten, and nothing was dropped from the list to
make it pass.

**Filler and false emphasis**: `worth noting` · `important to note` ·
`it cannot be overstated` · `at its core` · `when it comes to` ·
`let's break it down` · `here's where it gets interesting` ·
`the point is` · `because it matters`.

**Inflated vocabulary**: `delve` · `dive into` · `robust` · `seamless` ·
`comprehensive` · `holistic` · `intricate` · `leverage` · `foster` ·
`shed light on` · `pave the way` · `pivotal` · `transformative` ·
`game-changing` · `cutting-edge` · `groundbreaking` · `testament to` ·
`paradigm shift` · `realm` · `landscape of` · `underscores the` ·
`lean into` · `throughline` · `double-click on` · `mature setup`.

**Consultant register**: `north star` · `key takeaways` ·
`best practices` (name the practice instead) · `at the end of the day` ·
`pressure-test` · `right-size` · `strategic imperative` ·
`three things to know` · `dispatches from` · `best operators` ·
`lessons learned`.

**Metaphor inflation**: `load-bearing` · `heavy lifting` ·
`is doing the work` · `different physics` · `hits hardest` ·
`quietly` (say `silently`, which is the term of art for a failure that
reports nothing).

**The contrast frame and its cousins**: `not just` · `not only X but Y` ·
`it's not about` · `the whole game` · `the entire point` ·
`the only thing that matters`. Say what the thing is.

**False singularity**: `the right way/answer/tool/question` ·
`the best thing you can do` · `if I had to pick` · `what struck me` ·
`stuck with me` · `struck a chord` · `hit a nerve` ·
`we've seen this movie before`.

**Reflective pose**: `sit with` · `worth exploring/considering/asking` ·
`keeps coming back to` · `that's the tell` · `where I landed`.

**Invented observation about people**: `most people` ·
`everyone I've worked with` · `a lot of folks` · `nobody I know`. If it
did not happen, do not claim to have noticed it.

**Signposting**: `let's explore` · `now let's turn to` · `moving on to` ·
`in today's rapidly evolving` · `reflecting a broader trend` ·
`great question`.

**`honest`, and every form of it**, is banned differently from the rest.
The word is fine English; it is on the list because it had become a tic
across the repositories that share this list, where it flattered a
sentence rather than said anything the sentence did not already say. It
had reached these pages once, in "three mechanisms keep the two
implementations honest"; the sentence now says "in step", which is what
the mechanisms do, and nothing was lost.

**The gate is absolute, and the lack of an inline exemption is the
point.** There is no `allow` comment and no suppression the second gate
would honour, because an escape hatch that exists is an escape hatch that
gets used. A use the author wants kept is approved by changing
`reject.txt`: one line, in one file, visible in review, which is where an
approval belongs.

### What is not banned, and why

Several entries on claudisms.ai are deliberately absent, because they name
things this project documents. A gate that fires on the subject matter is
a gate people learn to switch off. The same standard governs
`Apidef.WordChoice`, which carries three of Google's substitutions and
leaves the rest at warning.

| Not banned | Because |
|---|---|
| `canonical` | It is this project's word for the TypeScript build the Go package is a port of, and for the normalised name an entity gets. |
| `model` | The thing a build produces (`result.apimodel`), the input that describes it (`{ name, def }`), and the schemas under `model/`. |
| `guide` | The classification stage, its output, and the file a user edits to correct it. There is no other word for it. |
| `shape` | `shape` is the validation package the options go through, and the word for the form of a data structure. |
| `surface` | An action *surfaces* in the model as a point; the public API *surface* is what the reference describes. |
| `carry`, `hold` | A point carries the guide's `transform`; the context object holds the parsed spec. |

The rule behind the list: ban the phrase that adds nothing, never the word
that names a thing.

**Matching spans a line wrap.** These pages hard-wrap, and most of the
list is multi-word, so the gate joins each paragraph before matching:
`worth\nnoting` fails exactly as `worth noting` does. Upstream records
that the day its gate started reading paragraphs it found two phrases that
had been passing since the gate was written, each saved only by where its
line happened to break.

**Patterns** (not mechanically checkable, enforced at review):

- Announcing structure before delivering it ("There are three things to
  understand").
- Restating the question before answering it.
- A closing one-liner that restates the thesis.
- Stacked short declaratives (four or more in a row).
- Superlative self-ranking ("the most important thing", "the part that
  matters most").
- A list of `**Bold term**: explanation` pairs, which is the single most
  recognisable machine-written list. Write sentences, or a table.

## Punctuation rulings

**The em dash is spaced here**: `a dash — like this`. This is the one
place where the guide contradicts both Google and jostraca, and it is the
Voxgig convention rather than drift — 128 spaced dashes across the 20
pages when the gate was written, and not one unspaced. `Google.EmDash` is
therefore off, and `tools/check_prose.py` `em-dashes-are-spaced` enforces
the convention in the other direction: an unspaced dash fails.

Dashes stay **rationed to one aside per line**: either a single dash
before a trailing clause, or one matched pair around a parenthetical,
never both and never two asides. Three on a line is the stacking the
ration exists to stop. Prefer a comma or parentheses when the aside is
mild.

The rest:

- In a link list, separate the link from its gloss with a full stop, not a
  dash:

  ```markdown
  - [Debug a build](docs/how-to/debug-a-build.md). Warnings, debug output, and the `why_*` traces.
  ```

- **Every relative link must resolve, and stay inside the repository.**
  `tools/check_prose.py` checks the path, not the anchor, since a heading
  slug depends on the renderer; it reads both `[text](target)` and
  `[text][label]` with its definition. A target that resolves on a Linux
  runner but climbs out of the checkout resolves nowhere on GitHub or in a
  published package, so it fails too. Every link resolved the day the
  check was written; the links that came out were citations of working
  documents, which is the preceding section's rule, not this one's.
- No emoji in documentation. The documentation index used to open each of
  its four sections with one; it no longer does.
- Sentence-style capitalisation in headings (Google style), except where
  the heading names a proper noun or a code identifier: `TypeScript is
  canonical`, `` `ModelEntity` ``.
- British spellings (`-ise`, `-isation`) for new prose. Google style is US
  English and so is the dictionary; this is one of the places the house
  voice wins, and
  [`accept.txt`](./.vale/styles/config/vocabularies/Apidef/accept.txt)
  carries the British forms — **listed one by one**, never matched by
  suffix, because `\w+ise` accepts any word ending in those three letters
  and punches a hole straight through the spelling gate. A US spelling
  already on a page is not a defect, and a filename keeps whatever
  spelling it was created with.
- Quotation punctuation goes **outside** the quotes, against US
  convention, because putting a period inside a quoted `code span` is
  actively wrong when the quote is a literal.

## Terminology

- The project is **apidef** in prose, lowercase, as every page writes it,
  or **Voxgig Apidef** where a formal name is needed; the packages are
  `@voxgig/apidef` on npm and `github.com/voxgig/apidef/go` as a Go
  module.
- **entity** — a resource the model infers from the spec, and the thing
  that becomes a class in a generated SDK. Its name is **singular,
  always**: `pet`, never `pets`. A **field** is a wire name and keeps its
  spelling and its plurality; the two are both spelled `name:` in the
  model, so say which one you mean.
- **operation** — one of `load`, `list`, `create`, `update`, `remove` and
  `patch`. An operation has **points**, one per path and method that
  produces it, never "a path". An **action** is the non-CRUD trailing
  literal on an entity (`terraform` on `planet`); it is not an entity, and
  the pages do not call it one.
- **guide** — the classification stage, its output (`result.guide`, the
  regenerated `base-guide`), and the entry file a user edits to correct a
  wrong guess. It is the only correction surface, so say **guide** and
  not "config", "overlay" or "annotation".
- **the model** — `result.apimodel`, with its working tree at `main.kit`
  and its three collections `info`, `entity` and `flow`. The `{ name,
  def }` object a caller passes in is **the input model**; say so when
  the two could be confused.
- **spec** — the OpenAPI or Swagger document apidef reads; `def` is the
  key that names its file. A **schema** is one component inside it, never
  the whole document.
- **canonical** — the TypeScript implementation in `ts/`. Go is the
  **parity port**; **parity** is the property, and a **divergence** is a
  documented, pinned difference between the two. Never "reference
  implementation": the shared fixtures and the goldens are the reference.
- **the shared fixtures** — `ts/test/*.tsv`, one table per pure function,
  run by both suites; say **a row** for one case. **The goldens** are the
  reference models under `ts/test/model-ref/`.
- **stage** and **pass** — the five stages are the `ctrl.step` keys
  (`parse`, `guide`, `transformers`, `builders`, `generate`); the nine
  **transform passes** are the third stage. A **builder** renders, and
  **generate** writes.
- **validator token** — a field's `type` is `` `$STRING` ``, `` `$NUMBER`
  ``, `` `$BOOLEAN` `` or `` `$ANY` ``, never the OpenAPI type it came
  from. Say "the type" and show the token; do not say "string".

## Templates, kind by kind

**Tutorial** (`docs/tutorial/`): goal sentence → snippet → output → the
one observation → forward link. Every step's output shown.

**How-to** (`docs/how-to/`): title is the task in imperative or "-ing"
form; one sentence of situation; the recipe; one paragraph of what to
watch for; links to the reference for the constructs and to the tutorial
for the basics it assumes.

**Reference** (`docs/reference/`): definition, then behaviour, then edge
cases, then a pinned example. Every claim that has a fixture row, a
golden or a test can name it.

**Explanation** (`docs/explanation/`): the question, the answer, the
argument, the trade-off admitted. May quote history when the history is
the argument. This is where a divergence between the two implementations
is explained.

## Updating this guide

Change it the way behaviour changes: in the same commit as the first page
that follows the new rule, with the reasoning in the commit message.

To ban a phrase, add the regular expression to
[`reject.txt`](./.vale/styles/config/vocabularies/Apidef/reject.txt) and
summarise it in the preceding list. Both gates pick it up from that one
file; there is no second list to update, and `tools/check_prose.py` names
this file, so a drift is a build failure with a pointer.

To change a Google rule's level, edit [`.vale.ini`](./.vale.ini) and write
down what the rule produced on a clean run. "It was noisy" is not a
reason; "it maps `touch` to `tap`, and it objects to `snake_case`, which
this project names on purpose — 4 hits" is. A rule demoted without that
note reads later as an oversight, and gets re-promoted by someone
repeating the work.

To widen what the gates read, change the configuration block at the top
of `tools/check_prose.py`. Both gates take their file set from it, so
widening it once widens both — and a page added to the repository without
being added there is a page neither gate has ever read.

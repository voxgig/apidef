# Architecture Decision Record

This is the register of **fundamental** decisions for apidef: the small
set of choices that everything else in the repository is built on, and
that a contributor (human or agent) must not quietly reverse.

An entry belongs here when reversing it would change what the project
*produces* rather than how one part of it works. Ordinary design choices
— which data structure a pass uses, how a message is worded — live in the
code and in [`docs/`](docs/README.md), not here.

Each entry states the decision, the context that forced it, the
consequences we accept in exchange, and how the decision is enforced in
practice. Entries are append-only and numbered in order. A decision that
no longer holds is not deleted: its status changes to **Superseded by
ADR-NNN**, so the reasoning that led there stays readable.

| ADR | Decision | Status |
|-----|----------|--------|
| [ADR-001](#adr-001--entity-names-are-singular-always) | Entity names are singular, always | Accepted |
| [ADR-002](#adr-002--guideaon-is-the-only-correction-surface) | `guide.aon` is the only correction surface | Accepted |
| [ADR-003](#adr-003--the-model-carries-resolved-structure-not-templates-to-parse) | The model carries resolved structure, not templates to parse | Accepted |

---

## ADR-001 — Entity names are singular, always

**Status:** Accepted

### Context

An entity is **one record**. `client.Joke(id).load()` loads a joke, not a
collection of them, and every downstream artefact reads that way: the Go
type `Joke`, the TypeScript class `JokeEntity`, the file
`<slug>-joke.aontu`, the test fixture `JokeTestData.json`. A plural name
makes each of those a lie, and the lie is not local — sdkgen turns the
entity name into public class names across every one of its two dozen
targets, so a plural that reaches the model becomes a published API.

OpenAPI does not name entities. apidef infers them, and every source it
infers from is **naturally plural**: collection paths (`/jokes`,
`/categories`), response wrapper keys (`{"categories": [...]}`), schema
component names. Singularisation is therefore not a tidying step applied
at the end — it is part of deriving the name at all, and it has to happen
at *every* site that derives one.

That last clause is where this is easy to get wrong, in both directions.

**Over-stripping.** The failure that has actually happened, and whose
wreckage is still on disk: `houses → hous`, `prizes → priz`,
`phrases → phras`, `exercises → exercis`, `franchises → franchis`. A naive
"drop the trailing s" is not depluralization, and because it produces a
plausible-looking token nothing downstream rejects it; those names
reached generated SDKs and shipped. The residue is still visible as
orphaned model files in the freepublicapis corpus.

**Leaving the plural.** The opposite risk has not been observed in the
current pipeline, and the reason is worth writing down rather than
assuming: the entity name is derived by `canonize()`, which is
`depluralize(snakify(transliterate(...)))`, and the sites that can
REPLACE a path-derived name — a matched schema component — go through
`canonizeCmpName()`, which is `canonize()` again. The rule holds today
because very nearly every naming path routes through that one function —
the exception being `entityName()` in `ts/src/guide/graphql01.ts`, which
applies `depluralize(canonize(...))` and so depluralizes twice. That is
a property to preserve deliberately, not a coincidence to rely on: the
sources apidef infers names from are all naturally plural — collection
paths (`/jokes`, `/categories`), response envelope keys, schema
components — so any new naming path added without `canonize()` produces
a plural immediately, and it will look right to whoever adds it.

**What this is NOT about.** Field names are wire names: `canonizeField()`
preserves their case and plurality verbatim, unlike `canonize()` (ADR
context: `v7.0.0`, "field names are wire names"). It still transliterates
accents and strips characters no target language allows in an identifier
— `café` → `cafe`, `x-id` → `xid`, `$ref` → `ref` — and nothing maps
back, since `alias.field` is emitted empty. A field name is the wire name
modulo identifier sanitisation, not a byte-for-byte copy. A response of `{"categories": [...]}` has a field named
`categories`, plural, on an entity named `category`, singular, and both
are correct. Singularisation applies to the ENTITY name — the thing that
becomes a class — and must never be applied to a field, a path, or a
wire key. Confusing the two is the likeliest way to "fix" this decision
into a regression, since both are spelled `name:` in the model.

A measurement makes the convention concrete. Across a 508-API corpus,
1810 of 1814 entity `name:` declarations are singular — near-universal
and load-bearing. Two of the four exceptions (`exercis`, `franchis`) are
the over-stripping residue above; the other two are an entity named
`men`, which is a plural the rules did not catch. This ADR exists so the
next naming path added does not make it 1810 of 1815.

### Decision

**An entity name is singular. Always.**

1. Every site that derives an entity name — from a path segment, from a
   response wrapper key, from a schema component, from anything added
   later — routes the candidate through `depluralize()` before it becomes
   a name. There is no naming path exempt from this.

2. `depluralize()` is the single *source* of the rule — mirrored into
   `go/`, never re-derived there. A caller may not inline its own suffix
   handling, and a new plural form is fixed by extending `IRREGULARS` or
   the rule chain, never at a call site.

3. Depluralization is **conservative**. A word it cannot confidently
   reduce is left alone: `data → data`, `status → status`. A rule that
   over-strips — `status → statu`, `analysis → analysi` — is a worse
   defect than the plural it was trying to remove, because an
   over-stripped name is not obviously wrong to a reader.

   This is the standard, and the code meets it only in part. `status` is
   protected by the `-us` guard on the final `-s` rule; `analysis` is
   not, and `depluralize('analysis')` returns `analysi` today, as it does
   for the rest of the `-is`/`-as` family (`axis`, `basis`, `crisis`,
   `diagnosis`, `thesis`, `alias`, `canvas`) — already recorded as an
   open defect in
   [`docs/review/2026-07-code-review.md`](docs/review/2026-07-code-review.md).
   The gap is latent rather than shipped, since no entity in the corpus
   below is named for one, and by the third Consequence closing it
   renames public classes. It is written down here rather than quietly
   patched.

4. A spec whose real entity is genuinely plural — a resource that models
   a set rather than a member — is handled by the per-model
   `custom.plurals` override, not by skipping the rule.

### Consequences

We accept that:

- **The name may not match the spec's own spelling.** A path of
  `/categories` produces `category`, and the operation still targets
  `/categories`. Naming and routing are separate concerns; only the name
  is normalised.

- **English is assumed.** `depluralize` encodes English morphology, so a
  spec written in another language gets whatever the suffix rules make of
  it. `custom.plurals` is the escape hatch, and the alternative — no
  normalisation at all — is worse, because it makes the *common* case
  wrong to protect the rare one.

- **Changing the rule renames public classes.** Any change to
  `depluralize` is a breaking change to every SDK whose entity it
  touches, and must be treated as one rather than as a bug fix, however
  much it looks like tidying.

### Enforcement

- `depluralize()` in `ts/src/utility.ts` is the canonical implementation,
  and is exported so tests and downstream tools assert against the same
  rule. `Depluralize()` in `go/utility.go` is a parity port of it, with
  its own `irregularPlurals` table — not a second rule. A change to
  `IRREGULARS` or to the rule chain is not done until it has been made in
  both, and pinned in `ts/test/depluralize.tsv`, the shared fixture that
  `ts/test/tsv.test.ts` and `go/tsv_test.go` both execute. A case added
  only to `ts/test/utility.test.ts` does not exercise the Go port, and
  the two can diverge with the suites green.
- Its behaviour is pinned by `ts/test/depluralize.tsv` (87 rows) for the
  regular suffixes and the `IRREGULARS` table, and by
  `ts/test/utility.test.ts` for the `custom.plurals` override. What that
  corpus pins today is the PLURAL inputs — `statuses → status`,
  `analyses → analysis` — not the singular no-ops. Of the words that must
  NOT change, none is asserted directly: `data` is safe because it has no
  trailing `s`, `status` only via the `-us` guard, and `analysis` is not
  safe at all. Adding singular rows for all three is the first task this
  ADR creates; the `analysis` row will fail until the `-is` family is
  fixed, which is the point of adding it.
- A generated model whose ENTITY name differs from
  `depluralize(entityName)` is a defect in apidef, not in the spec that
  produced it — except for the `-is` singulars, because `depluralize` is
  not yet idempotent on its own `IRREGULARS` outputs
  (`analyses → analysis → analysi`). Any check written from this bullet
  must exempt them, or it will flag the correct name as the defect. The
  same assertion applied to a FIELD name would be a bug in the test, not
  a finding.


---

## ADR-002 — `guide.aon` is the only correction surface

**Status:** Accepted

### Context

apidef *infers*. It reads a spec that never names an entity and decides
which paths form a resource, which methods are CRUD, and which
operations are not resources at all. Inference is wrong sometimes, so
there must be a way to correct it — and the question this ADR settles is
**where that way lives**, because there were three candidates and each
one is individually reasonable.

1. **A vendor extension in the spec** — `x-voxgig-entity: false`,
   `x-voxgig-auth: exchange`. Deterministic, and it sits beside the thing
   it describes.
2. **An overlay document** — a separate file of patches applied to the
   spec before parsing, in the shape of the OpenAPI Overlay
   specification.
3. **`guide.aon`** — the file apidef already generates, already
   documents as the escape hatch, and already reads back on every run.

The decisive fact is **whose spec it is**. The specs apidef is pointed at
are, in the main, not ours: they are published by the API's owner,
fetched from a URL, and re-fetched when the API changes. An annotation
added to such a file is lost on the next fetch, and cannot be added at
all when the spec is served rather than stored. A correction surface
that only works on specs you control is not a correction surface — it is
a second way to write the spec, available exactly when you least need it.

The overlay avoids that, and is a real specification with real tooling.
But it buys the same capability `guide.aon` already has, in a second
file, with a second syntax, applied at a different pipeline stage — and
then every correction has two possible homes and a precedence question
between them. `guide.aon` had `active?: boolean` at entity, path, op and
field level before this decision was written; what it lacked was code
that read it, which is a bug, not an argument for a new mechanism.

### Decision

**All customisation and correction of apidef's inference happens in
`guide.aon`. apidef reads no vendor extensions (`x-*`) and no overlay
documents, and emits none.**

Heuristics are free to be as clever as the evidence allows, because
`guide.aon` is always there to overrule them. Two consequences follow,
and both are load-bearing:

- **A heuristic must never silently DROP anything.** A classification
  that removes an entity has to emit it with `active: false`, not omit
  it — an entity that is absent from `guide.aon` cannot be switched back
  on there, which would leave the user with no correction surface at all
  and hand the argument back to the vendor extension. Emit, deactivate,
  explain in a comment.
- **Generated defaults must be aontu DEFAULTS (`*value`), never concrete
  values.** aontu conflicts two concrete values rather than letting one
  win, so a concrete `active: false` in the generated `base-guide.aon`
  would make a user's `active: true` in `guide.aon` fail to unify instead
  of overriding it. The correction surface only works if what it
  overrides yields.

The first application is the **access-token exchange**: an operation
that issues credentials is not a resource, and `authExchangeOp()`
recognises it from four signals together — a secured spec, a
per-operation `security: []` clearing that requirement, a POST, and a
token-shaped success response. The entity is emitted deactivated, and
the exchange survives into the model as facts on
`info.security.exchange` for sdkgen's `secrets` feature to drive.

### Consequences we accept

- **A wrong heuristic is a wrong DEFAULT, not a wrong answer**, and the
  fix is one line in a file the user already has. But it is still a
  default: someone must notice. A heuristic that misfires quietly on a
  spec nobody inspects ships a wrong SDK, and no amount of correction
  surface prevents that — which is why the signals are conjunctions
  rather than any-of, and why each deactivation writes a comment saying
  what decided it.
- **We cannot express anything that has no `guide.aon` representation.**
  When a new kind of correction is needed, the guide model grows — that
  is the cost, and it is deliberately paid in the schema rather than in
  a new file format.
- **Specs we DO own gain nothing from owning them.** The elementdemo
  reference spec is ours, and an `x-voxgig-auth: exchange` in it would
  be simpler than the heuristic. We do not write one, because a
  reference API whose SDK generates only by virtue of an annotation no
  third-party spec carries stops being a test of the real path. It is
  meant to stress the generator the way an unowned spec would.

### Enforcement

- `authExchangeOp()` and `specSecuredByDefault()` in `ts/src/utility.ts`
  are the canonical detection, pinned by `ts/test/auth-exchange.tsv`
  (14 rows, both polarities) through `ts/test/tsv.test.ts`.
- `guideActive()` is the single reader of `active`, consumed by the
  entity, path, op and field transforms. A new suppression must route
  through it rather than filtering a list somewhere.
- The guide emitter (`ts/src/guide/guide.ts`) writes `active: *false` —
  the star is not decoration. A plain `active: false` there passes every
  test in this repo and breaks the override in the consumer's project,
  where the two concrete values meet.
- **Grep for `x-` before adding a spec-reading branch.** apidef reads
  `x-ref` (a `$ref` bookkeeping key of its own making, not a vendor
  extension) and nothing else. A genuine `x-*` read is a reversal of
  this ADR and needs an ADR of its own.

---

## ADR-003 — The model carries resolved structure, not templates to parse

### Context

A request path is fully known at parse time. apidef already splits it and
already applies the guide's parameter renames, emitting

```
orig:  "/element/{element_id}"
parts: ["element", "{id}"]
```

But `parts` carries `{id}` as a BRACED STRING, so every consumer has to
parse the braces back out. In the generated SDKs that happens on every
request: `preparePath` joins the parts into `"element/{id}"`, `makeUrl`
concatenates base/prefix/path/suffix into one string, and then builds a
fresh regular expression PER PARAMETER to take the braces out again.
`MakeUrlUtility` has carried `// TODO: use parts to avoid regexp?` for as
long as it has existed.

So structure computed once, here, is discarded and re-derived by regex on
every call — in thirteen hand-written implementations of the same brace
grammar, one per target language. That count is the argument. Three of
them have already drifted from the other ten in ways that shipped: the
`auth.basic` optspec differed in rust and zig, and ts, js and lua emitted
unquoted map keys for names the other nine quoted.

Three options were considered.

1. **Leave it.** The grammar is trivial, and each target's version is
   twenty lines. But "trivial and repeated twenty-two times" is precisely
   the shape that produced the divergences above, and the cost recurs on
   every request rather than once.

2. **Emit `segments` alongside `parts`**, so consumers migrate at their
   own pace. Rejected, and the reasoning is the load-bearing part of this
   entry — see the Decision.

3. **Emit `segments` only.** Chosen.

### Decision

**apidef emits each point's path as a typed segment vector. It emits no
brace-templated string for a consumer to parse, and never two
representations of the same fact.**

A segment is a literal or a variable, and nothing else:

```
segments: [ { lit: "element" }, { var: "id" } ]
```

A segment is a WHOLE path element or nothing: `{a}.{b}` is two parameters
glued together with a separator that belongs to neither, so it has no honest
`var` and stays a literal. Deciding otherwise would invent a parameter named
`a}.{b`, matching nothing in `args.params`. This is also what the braced form
did with it — the rename lookup was a whole-element match — so the rule is
not new, only now explicit.

Two things make option 2 wrong rather than merely redundant.

- **The string form is LOSSY.** `"{id}"` cannot represent a literal path
  segment that contains braces, and `parts` cannot distinguish one from a
  parameter reference. Round-tripping through it therefore loses
  information the parse already had. You do not keep the lossy
  representation alongside the faithful one; you delete it.
- **The model is committed data.** A consumer's `.sdk/model/` is checked
  in, and the point shape is baked into every generated SDK's `Config`.
  Duplication there is durable and shipped, and two representations of
  one path are two things that can disagree. Transitional duplication
  belongs in sdkgen's generation layer, which is rebuilt from source on
  every release, not in data that outlives it.

The transition is therefore sdkgen's to absorb: it derives the old
`parts` shape from `segments` in one generation-time helper, so targets
that have not migrated are untouched, and that helper is deleted when the
last one has.

**Scope: the PATH only.** The server URL keeps its own construction-time
substitution. A `base` is a runtime option a caller can override with a
literal, so making it a segment vector would change that option's
semantics — a separate decision, deliberately not taken here. The
consequence is accepted below.

### Consequences we accept

- **A breaking change to the model**, gated by the peer floor rather than
  by carrying both shapes. That mechanism is proven: apidef 8.1 shipped a
  new fact and consumers moved their floor to `>=8.1` rather than apidef
  emitting the old and new shapes together.
- **The model gets more verbose.** A vector of maps is bigger than a
  vector of strings. Paid once, in data, to remove parsing from
  twenty-two runtimes.
- **Two mechanisms survive**, because the scope is the path only: server
  variables are still substituted into `base` at construction by a regex
  in each target's `makeOptions`. This entry does not fix that, and a
  later one may.
- **A path segment carries no `src` tag.** Under this scope every
  variable segment resolves from the operation's parameters, so a tag
  would be a constant. It is omitted rather than reserved: if the server
  URL is ever brought into the same vector, the tag is added then, by the
  ADR that decides it.
- **The Go port must follow.** It is already behind on ADR-002's exchange
  facts, and this widens that gap until it is ported. The shared `.tsv`
  fixtures do not assert on `parts`, so the two ports can be moved
  independently without the suite hiding a divergence — but they must
  both move before the model schema can require the new shape.

### Enforcement

- `resolvePathList()` in `ts/src/transform/entity.ts` is the single
  construction site: the split, the rename application, and now the
  segment typing happen there and nowhere else.
- **`parts` must not come back.** Grep for it before adding a path
  representation, the way ADR-002 says to grep for `x-`. A second shape
  for one fact is a reversal of this entry and needs an ADR of its own.
- The point shape in `model/apidef.aon` declares `segments` and not
  `parts`, so a model carrying the old key fails unification in the
  consumer rather than being silently half-read.
- A new brace-parsing regular expression in a generated runtime is the
  symptom this entry exists to remove. In sdkgen, `makeUrl` and
  `preparePath` are the files to check.

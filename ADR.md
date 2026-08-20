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

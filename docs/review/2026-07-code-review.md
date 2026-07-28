# apidef code review — TypeScript, Go, and parity

**Date:** 2026-07-25 · **Scope:** `ts/src`, `go/`, the shared `*.tsv` fixture
mechanism, `go/validate_test.go`, CI, and the external `apidef-validate`
golden corpus.

Reviewed independently for TypeScript and Go, then reconciled. Every finding
below was reproduced by running code — commands and observed output are given
so each can be re-checked. Findings resting only on reading are labelled
**[code-read]**.

Baseline: both suites are green as reviewed — TS 438 tests pass, `go test
./...` passes. Nothing here is a failing test; it is all behaviour the tests
do not reach.

---

## 0. Status — what has since been fixed

Most of this review has been actioned; see `docs/review/2026-07-parity-fixes.md`
for the change log and measurements. In brief:

| finding | status |
|---|---|
| §4.1 prototype-key crash | **fixed** (TS) |
| §4.2 chained `$ref` | **fixed** (TS) |
| §4.3 `decircular` DAG expansion | **fixed** (TS) |
| §4.4 missing `apimodel` on early stop | **fixed** (TS) |
| §5.1 Go union types collapsing to `$ANY` | **fixed** (Go) |
| §5.2 rename replacing every occurrence | **fixed** (Go) |
| §5.3 discarded builder write errors | **fixed** (Go) |
| §5.5 missing `mergeCollectionPaths` | **fixed** (Go) |
| §5.9 per-call regexp compilation | **fixed** (Go) |
| §6.1 naming-primitive divergence | **fixed** (Go) + fixture added |
| §3.7 no fixture for snakify/camelify/kebabify | **fixed** (`name-parts.tsv`) |
| §3.1 Go ignores the guide overlay | **mitigated** — Go now refuses rather than silently diverging; a real fix needs a Go aontu |
| §6.2 remaining entity-classification gap | **open** — needs a maintainer decision, see the fixes doc |
| §3.2–3.6 harness/CI gaps | **open** |

Two claims in this review were wrong and are corrected in place (§3.7 on
`"Any"`, §5.1 on the args union shape), alongside the retraction already noted
in §2.

## 1. Verdict

The pipeline design is sound and the code is unusually well commented — most
non-obvious decisions carry a rationale comment, which made this review far
faster than it would otherwise have been.

The central problem is not in either implementation individually: **the parity
mechanism cannot detect the divergences that exist.** No test anywhere runs
both implementations on the same input and compares. As a result the two have
drifted substantially — on real specs they disagree about entity sets, field
names, field types and operation assignment — while every check stays green.

The largest single gap is that **Go never applies the user's guide overlay at
all** (§3.1). The whole documented customization surface — rename, hide, move,
deactivate, method override — is inert in the Go port, and the golden harness
is structurally blind to it because it only ever compares the *pre-overlay*
artifact.

Beyond that, three defects are serious in their own right:

- a valid spec whose schema is named `Constructor` crashes the TS build (§4.1);
- chained `$ref` aliases silently lose their schema, order-dependently (§4.2);
- `decircular()` expands the shared-structure DAG that `$ref` inlining
  deliberately builds into a tree — a 2.3 KB spec yields a 172 MB model, and
  2.5 KB exhausts a 2 GB heap (§4.3).

Priorities: (1) a real cross-language differential test, (2) the guide-overlay
gap, (3) the three TS correctness bugs, (4) the naming-primitive divergence,
(5) run Go in CI at all.

---

## 2. Method

```sh
cd ts && npm ci && npm run build && npm test     # 438 pass
cd go && go test ./...                           # ok
```

Differential harnesses written for this review (all under `/tmp`; nothing was
added to either repo):

- a 7,711-input sweep of every shared pure function, TS vs Go;
- an end-to-end model diff over the 14-spec `apidef-validate` corpus, TS vs Go,
  each language run from its own freshly-copied pristine guide tree;
- a Go CPU profile on the 8.8 MB github spec;
- targeted probes for `$ref` chaining, `decircular` growth, and prototype keys.

A twelve-dimension agent review ran alongside and contributed several findings
credited inline (§4.3, §5.5–5.9, §6.1). Its claims were re-verified here before
inclusion; those I could not reproduce are not listed.

Both repositories were left clean. One early harness run wrote into
`apidef-validate/v1/guide/`; it was reverted with `git checkout` and every
number below was re-measured afterwards.

**Retraction.** An earlier draft of this review stated that the checked-in
`*-base-guide.aontu` goldens were stale and that TypeScript had drifted from
them. That was wrong. Re-tested from a pristine tree, current TypeScript
regenerates them **byte-identically** (foo, cloudsmith, gitlab all `IDENTICAL`).
The real explanation for the observed `foo` mismatch is §3.1, which is a
stronger finding.

---

## 3. The parity mechanism (highest priority)

### 3.1 Go never applies the guide overlay — and the harness cannot see it

apidef has two guide artifacts:

- `<prefix>base-guide.aontu` — machine-generated from the heuristic;
- `<prefix>guide.aontu` — the user-editable overlay, which `@`-includes the
  base guide and layers customizations on top.

TypeScript unifies them. `ts/src/guide/guide.ts` imports `Aontu` (L7),
constructs it (L42), reads `<prefix>guide.aontu` (L63) and runs
`aontu.generate(src, opts)` (L93).

Go does not. `go/guide.go` references only `base-guide.aontu` (L71), and
`go/go.mod` has **no aontu dependency at all** — `jsonic/yaml`, `struct`,
`util`, `x/text`. The port is structurally incapable of applying an overlay.

This exactly explains the divergence on the project's own `foo` fixture. Its
overlay says:

```aontu
guide: entity: yike: hide({})
guide: entity: qiz:  move($.guide.entity.qaz)
guide: entity: xtra: { active: true }
```

| | entities |
|---|---|
| **TS** (overlay applied) | `bar bax foo `**`qiz`**` taf `**`xtra`**` zed` — correct |
| **Go** (overlay ignored) | `bar bax foo `**`qaz`**` taf `**`yike`**` zed` — raw heuristic |

`TestValidateGuide/guide-foo-1.0.0-openapi-3.1.0` **passes**, because it
compares Go against `base-guide.aontu` — the one artifact defined to be
*pre*-customization, and therefore the only one Go could match. The harness is
blind to the entire overlay layer by construction.

Same cause on codatplatform: its overlay carries `guide: entity: refresh_data:
hide({})`, and `refresh_data` is precisely the entity my end-to-end diff found
present **only in Go** (§6.2).

Verified not to be the cause elsewhere: the cloudsmith, gitlab, github and
learnworlds overlays contain no customizations (`guide:{}` or bare includes),
so their divergences in §6.2 are genuine heuristic and naming differences.

**Fix:** this is the review's top item. Either implement overlay unification in
Go, or — if that is impractical without an aontu port — make `Generate` fail
loudly when a `<prefix>guide.aontu` containing customizations is present, so
the gap cannot pass silently. Document it either way; `AGENTS.md`'s "must
reproduce TS behaviour exactly" currently implies otherwise.

### 3.2 No test compares the two implementations

`go/validate_test.go` is the only "parity" test and it never executes
TypeScript. It compares Go against checked-in artifacts. Combined with §3.1,
the one artifact it compares against is the one that cannot capture the
customization layer.

There is also **no end-to-end comparison of generated `.aontu` output in either
direction**, and the Go builder/generate stages are executed by zero tests.

### 3.3 `ts/test/model-ref/*.json` are generated by Go, not by TypeScript

```go
// go/validate_test.go:177
refDir := filepath.Join("..", "ts", "test", "model-ref")
…
if _, err := os.Stat(refFile); os.IsNotExist(err) {
    os.WriteFile(refFile, goJSON, 0644)   // "First run: create reference"
```

Nothing under `ts/` reads or writes that directory — the two lines above are
the only references in the repo. `TestValidateModelData` is therefore a
**Go-vs-Go** regression test. Useful as that; not a parity check; and its
location under `ts/test/` implies otherwise.

### 3.4 The comparisons that do run are written to tolerate divergence

| site | behaviour | what it hides |
|---|---|---|
| `EXTRA Go entity` | `t.Logf` (only *missing* is `t.Errorf`) | Go may invent any number of entities |
| `FIELD COUNT DIFF` | `t.Logf`, commented "Go may extract more fields than TS which is acceptable" | a permanent parity waiver |
| `stripKeys(ent, "active")` | strips a Go-only field before comparing | a real structural difference |
| `normalizeForCompare` | collapses `` `$ARRAY` ``/`` `$OBJECT` `` → `` `$COMPOSITE` ``, commented as handling "non-deterministic field type values from map iteration order" | a *known* nondeterminism normalised away rather than fixed |

Vacuous passes too: petstore's `store` logs `0 fields match` — zero on both
sides compares equal and reports success.

### 3.5 About 150 lines of `validate_test.go` are dead

Verified by grepping call sites (each appears only at its own definition):
`deepEqualNormalized` (L311), `structuralEqual` (L370) and `countFields`
(L445) are never called; `normalizeForCompare`, `fieldNames`, `opNames` and
`pointCount` are reachable only from those. Only `sortMapKeys` and `jsonEqual`
are live — and `sortMapKeys` (L282), documented as "recursively sorts map keys
for deterministic JSON output", is a no-op: it builds an unordered
`map[string]any`, and `encoding/json` already sorts map keys. Go does not flag
unused functions, so this compiles silently.

This matters beyond tidiness: `structuralEqual` and `deepEqualNormalized` are
the *stronger* comparisons someone wrote and never wired up. The harness reads
as more thorough than it is.

### 3.6 CI never runs Go

`.github/workflows/build.yml` sets `defaults.run.working-directory: ts` and
runs only `npm ci`, `npm run build`, `npm test`. No `go build`, no `go test`,
no `make all`. **The entire Go port and every golden comparison are
local-only.** (`make check-model` is effectively covered, since
`ts/test/model-mirror.test.ts` asserts the same drift inside the npm suite.)

### 3.7 The TSV fixtures miss the functions where the two actually differ

16 fixtures, ~318 data rows, covering 15 pure functions — roughly a quarter of
the exported entry points, and **0%** of the guide heuristic, the nine
transform passes and the builders. Specifically not covered:

- **`snakify` / `camelify` / `kebabify`** — the root cause of the largest
  naming divergence (§6.1), with no fixture at all;
- **`Validator` with an array argument** — the one branch where the two differ
  structurally (§5.1). The TSV harness is string→string and *cannot express*
  an array input, so the format itself blocks coverage of the divergent branch;
- `GetModelPath`; `Nom` beyond 9 rows.

`canonize.tsv` illustrates the pattern: it has `API_Keys → api_key` (underscore
already present, where both agree) but not `APIKeys` — the shape that diverges.

`validator.tsv` additionally pins an oddity worth a look: rows `unknown → Any`
and `foo → Any`, where every real validator token is backticked
(`` `$STRING` ``, `` `$ANY` ``). **Corrected from an earlier draft:** this is
not an unresolvable identifier — the goldens emit `type: "Any"` as a quoted
string, which is valid aontu. Both implementations agree on it, so it is not a
parity issue; the open question is only whether sdkgen's sentinel → language
type table recognises the literal `"Any"`. Left unchanged.

### 3.8 Loader asymmetry and no header validation **[code-read]**

`ts/test/tsv.test.ts` splits on `/\r?\n/`, with a comment recording the
Windows-only CI failure that motivated it. `go/tsv_test.go:loadTsv` splits on
`"\n"` only. `.gitattributes` (`*.tsv text eol=lf`) currently protects Go, but
the guard lives outside the loader. Neither loader validates the header row;
the Go loader silently pads missing columns, so a renamed column yields empty
expectations rather than an error — and for any function that can return `""`,
that passes.

### 3.9 Nothing enforces the stated invariants **[code-read]**

No check verifies that `// Mirrors src/…` comments point at files that still
exist, that every `ts/src/*.ts` has a Go counterpart, or that committed
`ts/dist` matches a fresh build.

Measured on that last point: `cd ts && npm ci && npm run build` with the pinned
`typescript@7.0.2` and committed `package-lock.json` leaves **24 `.js.map`
files modified**. The emitted `.js` is byte-identical; only `mappings` differ —
`utility.js.map` 39,464 → 39,410 characters, 38 of 1,163 generated lines. The
committed artifact was produced by a different compiler than the one now
pinned. CI runs the build but never diffs it against what is committed.

---

## 4. TypeScript findings

### 4.1 **[critical]** A spec with a schema named `Constructor` crashes the build

`IRREGULARS` (`ts/src/utility.ts:137`), `CUSTOM_PLURALS` (`:238`) and
`VALID_CANON` (`:~920`) are plain object literals used as lookup maps, so a
prototype key resolves to an inherited value rather than `undefined`:

```
depluralize("constructor")  => THROW: target.toLowerCase is not a function
depluralize("__proto__")    => THROW: target.toLowerCase is not a function
canonize("constructor")     => THROW: target.toLowerCase is not a function
validator("__proto__")      => Object.prototype        (an object, not a token)
validator("constructor")    => function Object() { [native code] }
```

`CUSTOM_PLURALS["constructor"]` yields `Object`, which is truthy, so
`if (customExact)` passes and `matchCase(word, Object)` calls `.toLowerCase()`
on a function. End-to-end, on an ordinary OpenAPI 3.0 document containing
`components.schemas.Constructor`:

```
TS  ok: false | steps: ["parse"]
    TypeError: target.toLowerCase is not a function
      at matchCase (dist/utility.js:207) / depluralize (:267)
      at canonize (:807) / canonizeCmpName (:835)
      at Task.MeasureRef (dist/guide/heuristic01.js:194)

Go  ok: true  | steps: [parse guide transformers] | entities: [constructor]
```

`canonize` runs on every path segment and schema name, so this is reachable
from any spec. `constructor`, `toString`, `valueOf` and `hasOwnProperty` are
all plausible names in a language-tooling or metaprogramming API.

**Fix:** back all three tables with `Object.create(null)` or `Map`. `Map` is
preferable — `CANONIZE_CACHE` in the same file already uses it, so the
codebase's own precedent is correct; these three predate it. Add TSV rows for
`__proto__`, `constructor`, `prototype`, `toString`.

### 4.2 **[critical]** Chained `$ref` silently loses the schema, order-dependently

`addXRefsAndResolve` (`ts/src/parse.ts:149`) replaces a `$ref` node with
`{ ...resolved, 'x-ref': xref }`. If the target is *itself* a bare `$ref`, the
copy retains a `$ref` **string** key — and the recursion that follows only
descends into object-valued keys, so the chain is never followed. Because
`resolvePointer` reads a root the walk is concurrently mutating, whether this
bites depends on document order:

```
paths BEFORE components  ->  BROKEN (bare $ref, no properties)
components BEFORE paths  ->  RESOLVED ok
```

`paths` first is the conventional ordering. On the failing path the schema
arrives downstream as `{ $ref, x-ref }` with no `properties`, so every field is
silently dropped — no warning, `ok: true`. Go resolves it correctly in both
orderings. `codatplatform` in the corpus has exactly such an alias.

**Fix:** follow bare-`$ref` targets iteratively in `resolvePointer` with a
visited set on the *pointer string* (which also terminates cycles), then
inline. Warn when a `$ref` survives resolution. Add a fixture spec with an
alias chain in both key orderings.

### 4.3 **[critical]** `decircular()` expands the shared-structure DAG into a tree

`$ref` inlining deliberately shares nested children — the comment at
`ts/src/parse.ts:106-114` says so explicitly, and notes a deep clone is
"deliberately avoided" because self-referential schemas would make it
non-terminating. But `parse.ts:103` then calls `decircular(parsed)`, which
expands that DAG. Size becomes O(fanout^depth):

| depth | fanout | spec bytes | parsed JSON | time | heap |
|---:|---:|---:|---:|---:|---:|
| 4 | 3 | 982 | 26 KB | 11 ms | 13 MB |
| 8 | 3 | 1,638 | 2.1 MB | 56 ms | 24 MB |
| 10 | 3 | 1,968 | 19 MB | 422 ms | 71 MB |
| 12 | 3 | 2,304 | **172 MB** | 4,136 ms | 521 MB |
| 13 | 3 | ~2,500 | — | — | **FatalProcessOutOfMemory** (2 GB heap) |

A 2.3 KB spec produces a 172 MB model — 75,000× expansion — and 2.5 KB
exhausts a 2 GB heap. Growth is exactly 9× per two levels, i.e. pure tree
expansion of a shared DAG.

No spec in the corpus triggers this (github and gitlab both complete), so it is
latent rather than live. But component reuse across nesting levels is the
normal shape of a large API, and the failure mode is an unrecoverable OOM with
no diagnostic. *(Surfaced by the agent review; reproduced and quantified here.)*

**Fix:** `decircular` is there to make the result JSON-serialisable. Replace it
with cycle-breaking that preserves sharing — mark revisited nodes with a
pointer/reference marker rather than cloning — or drop it and only serialise
defensively at the `opts.debug` write site, which is the only place the model
is stringified.

### 4.4 **[medium]** `generate()` never returns `apimodel` on an early stop

`ts/src/apidef.ts:220, 237, 252` (the `transformers`/`builders`/`generate`
early returns) all return `{ ok, steps, start, end, ctrl, guide }` — **no
`apimodel`**. But `AGENTS.md` documents:

> **Stop early:** … `generate:false` builds the model in memory without writing
> files.

and shows `result.apimodel.main.kit.entity`. Measured: with `generate:false`,
`result.apimodel` is `undefined`; the only way to get the model from TS is to
run the full pipeline and write files.

Go returns `ApiModel` from all three early returns (`go/apidef.go:164-165,
191-192, 209-210`) — which is why `go/validate_test.go` can read
`result.ApiModel` with `builders:false, generate:false`. That test could not
have been written against the TypeScript.

**Fix:** add `apimodel: ctx.apimodel` to the three TS early returns.

### 4.5 **[medium]** Shared bugs in the naming and field layer

Found by the agent review, confirmed here by reading and by the differential
sweep (both languages agree, so these are shared defects rather than
divergences):

- **`depluralize` strips the final `s` from `-is`/`-as` singulars**
  (`ts/src/utility.ts:362`): `analysis → analysi`, `alias → alia`,
  `canvas → canva`. The guard list covers `-ss` and `-us` only. Visible in my
  sweep output (`APIanalysis → ap_ianalysi` in TS, `apianalysi` in Go).
- **`!!fielddef.required` on an array** (`ts/src/transform/field.ts:100`): a
  nested object property carrying its own `required: [...]` array is truthy,
  so the *parent* field is marked required.
- **`findFieldDefs` drops `allOf` response fields when the operation also has a
  requestBody** (`ts/src/transform/field.ts:168`).

### 4.6 **[low]** Other

- `ok` is inconsistent across early stops: `parse:false` → `ok:true`;
  `guide:false` → `ok:false`; the rest → `ok:true` (`apidef.ts:112, 204, 220…`).
  Go mirrors this exactly, so it is a shared wart, not a divergence — but it
  makes `result.ok` unusable as a success signal for partial runs.
- `$ref` sibling keys are discarded: `{ ...resolved, 'x-ref': xref }` drops
  anything beside `$ref`, which OpenAPI 3.1 and JSON Schema 2020-12 both
  permit. **[code-read]**
- Transform stages hand off through undeclared `$`-suffixed fields grafted onto
  the guide (`entity.ts:195` `paths$`, `:238` `relations$`; `operation.ts:64`
  `opm$`). `cleanTransform` strips `$` keys from `apimodel` only, so
  `result.guide` — returned to callers — carries `paths$[].def`, a live
  reference into the whole parsed spec. `ctx.work` exists for exactly this and
  is unused. *(Agent finding; code confirmed.)*

---

## 5. Go findings

### 5.1 **[critical]** `Validator` cannot represent unions, so nullable types collapse to `` `$ANY` ``

```ts
// ts/src/utility.ts:928 — canonical
function validator(torig: undefined | string | string[]): any {
  …
  else if (Array.isArray(torig)) return [CANON_ONE, torig.map(validator)]
```
```go
// go/utility.go:475 — port
func Validator(torig any) string {
  switch v := torig.(type) {
  case string: …
  default:     return "`$ANY`"      // arrays land here
  }
}
```

The return type was narrowed from `any` to `string`, so the array branch is
unreachable. OpenAPI 3.1's `type: [string, "null"]` — the standard nullable
form — degrades to `` `$ANY` ``. Measured on `learnworlds`: **18 entities**
differ, e.g.

| field | TS | Go |
|---|---|---|
| `affiliate.billing_info` | `` ['`$ONE`', ['`$OBJECT`','`$NULL`']] `` | `` `$ANY` `` |
| `assessment.grade` | `` ['`$ONE`', ['`$NUMBER`','`$NULL`']] `` | `` `$ANY` `` |
| `bundle.description` | `` ['`$ONE`', ['`$STRING`','`$NULL`']] `` | `` `$STRING` `` |

**Corrected from an earlier draft:** the flat
`['`$ONE`', '`$NULL`', type]` shape at `go/transform_args.go:117` is *not* a
divergence — `ts/src/transform/args.ts:98` builds exactly the same flat shape
for the `nullable` case. TS genuinely has two union shapes (validator's nested
one and args.ts's flat one) and Go matched both. Left unchanged.

**Fix:** return `any` and mirror the array branch, using `CanonOne` (already
defined at `go/utility.go:469`). Normalise the `transform_args.go` shape.

### 5.2 **[high]** Parameter rename replaces every occurrence; TS replaces only the first

```go
// go/transform_entity.go:70
for i, p := range parts {
    if p == "{"+oldName+"}" { parts[i] = "{" + newStr + "}" }
}
```
```ts
// ts/src/transform/entity.ts:179
const pI = parts.indexOf('{' + param.key$ + '}')
if (pI >= 0) parts[pI] = '{' + param.val$ + '}'
```

Go rewrites all matching segments; TS rewrites the first. Go also applies
renames sequentially over the same mutated slice in `sortedKeys` order, so a
rename whose target is another rename's key chains. On a path with a repeated
parameter this produces a wrong request URL — the agent review's example is
`GET /groups/{group_id}/badges/{group_id}`, with the badge id dropped.

**Fix:** mirror the `indexOf`-first semantics, and apply renames against a
snapshot of the original parts so they cannot chain.

### 5.3 **[high]** All builder write errors are discarded

`go/builder.go:68` and `:74` call `os.WriteFile(...)` and ignore the return
value. A permission or disk failure yields `OK: true`, zero warnings, and zero
files written. TS goes through jostraca, which reports `written`/`merged` and
drives `result.reload`.

**Fix:** collect write errors and surface them through the warner, and give the
Go result the equivalent of jostraca's file report.

### 5.4 **[high]** `TopTransform` is a fraction of its TS counterpart

`go/transform_top.go` is **101 lines**; `ts/src/transform/top.ts` is **464**.
Go handles `info` and `servers` only; the server-URL validation and the
auth/security/summary/website logic are absent. *(Agent finding; line counts
and content confirmed here.)*

### 5.5 **[high]** Guide-layer omissions **[code-read, agent findings]**

- `mergeCollectionPaths` has no Go equivalent (`go/guide.go:317`), so
  collection paths stay on a different entity than in TS.
- `renameParams` (`go/guide.go:750`) never applies the implicit snake_case
  placeholder rename that TS applies.

Both plausibly contribute to the §6.2 classification gaps; I confirmed the
absences by reading but did not isolate their individual contribution.

### 5.6 **[medium]** Go keeps genuine `$ref` cycles

TS calls `decircular` (which is its own problem, §4.3); Go
(`go/parse.go:85`) does not break cycles at all, so a self-referential `allOf`
schema recurses to an unrecoverable stack overflow. The two languages fail in
opposite directions on the same input class. *(Agent finding.)*

### 5.7 **[medium]** Package-global custom-plural state races

`go/utility.go:101` holds custom plurals in package globals, mirroring the TS
module-level design. TS is documented as single-model-per-process; Go offers no
such excuse, and concurrent `Generate` calls will interleave plural
configuration and silently produce wrong entity names. *(Agent finding.)*

### 5.8 **[medium]** `ResolveElements` fails soft where TS fails hard **[code-read]**

TS: `guide.control[kind][subkind]` throws a `TypeError` on a malformed guide.
Go: the chained `, _ :=` assertions yield `nil`, `orderStr` becomes `""`,
`elementNames` is empty, and the stage **silently does nothing**. This pattern —
single-line `, _ :=` swallowing a structural error — recurs throughout the Go
transforms and is worth a sweep.

Relatedly, `go/resolver.go:resolveElement` returns *"custom element loading not
supported in Go"* unconditionally, so any guide using a `custom*` element works
in TS and hard-fails in Go. That is a fair consequence of Go having no runtime
plugin story, but it is an unqualified functional gap that `AGENTS.md` does not
mention.

### 5.9 **[low]** Hand-rolled standard-library replacements and hot regexps

- `go/resolver.go:78-108` reimplements `strings.Split`/`strings.TrimSpace`.
  `trimSpace` handles only ASCII space/tab/CR/LF, whereas TS's `.trim()` and
  `/\s*,\s*/` strip all Unicode whitespace — so a guide `order` string
  containing NBSP or U+2028 parses differently.
- `go/utility.go:341` (`Kebabify`) calls `regexp.MustCompile("-+")` on every
  call. Hoist it, as the file already does for `fileExtRE` and friends.

---

## 6. Reconciliation — where TS and Go actually disagree

### 6.1 Root cause: the Go port reimplements a *third-party dependency*

TypeScript imports its naming primitives:

```ts
// ts/src/utility.ts:4
import { snakify, camelify, kebabify, each } from 'jostraca'
```

Go reimplements them (`go/utility.go:313-345`, on a local `partify`).
Differential over 7,711 inputs:

| primitive | divergent | example |
|---|---:|---|
| `snakify` | **662** | `APIKeys` → TS `api_keys`, Go `apikeys` |
| `camelify` | **1010** | `APIKeys` → TS `ApiKeys`, Go `Apikeys` |
| `kebabify` | **662** | `ABc` → TS `a-bc`, Go `abc` |

Two distinct rule differences, isolated by the agent review and consistent with
my sweep:

1. Go's `partify` collapses acronym runs unconditionally, swallowing the first
   letter of the following word; jostraca guards with `(?![a-z])`.
2. Go merges **any** single-character part into the next; jostraca merges only a
   single *uppercase* letter followed by a non-uppercase part.

Propagation to the functions built on them:

| function | divergent / 7711 |
|---|---:|
| `canonize` | 699 |
| `canonizeCmpName` | 699 |
| `validator` | 7 |
| `depluralize` | 2 (the prototype-key crashes, §4.1) |
| `cleanComponentName`, `sanitizeSlug`, `slugToPascalCase`, `transliterate`, `normalizeFieldName`, `stripSchemaNamespace`, `ensureMinEntityName`, `inferFieldType`, `inferTypeFromValue` | **0** |

The clean columns are the ones with TSV fixtures; the divergent ones are the
ones without. Note the sharpest version of this, from the agent review:
**`canonize` *has* a fixture and passes on both sides, yet still diverges** —
the fixture rows simply avoid the shapes that differ.

This is the deepest structural point in the review: **cross-language parity is
only as strong as the parity of the shared dependencies.** `jostraca`'s naming
functions are upstream code that Go has forked by hand, with no fixture and no
version relationship between the two. Any `jostraca` release can widen the gap
silently. `camelify` feeds `fixName`'s PascalCase form, so it determines
generated SDK **class names**.

**Fix:** add `snakify.tsv`, `camelify.tsv`, `kebabify.tsv` from a generated
corpus, exercised by both suites; treat them as the contract with `jostraca`
and re-run on every bump.

### 6.2 End-to-end model divergence on the real corpus

Both implementations over `apidef-validate`, each from its own freshly copied
pristine guide tree, compared on the entity model (`active` stripped):

| spec | TS ents | Go ents | TS-only | Go-only | field-set | field-type | op-set |
|---|---:|---:|---:|---:|---:|---:|---:|
| solar | 2 | 2 | 0 | 0 | 0 | 0 | 0 |
| petstore | 4 | 4 | 0 | 0 | 0 | 0 | 0 |
| taxonomy | 4 | 4 | 0 | 0 | 0 | 0 | 0 |
| **foo** | 7 | 7 | **2** | **2** | 0 | 0 | 0 |
| statuspage | 18 | 18 | 0 | 0 | **1** | 0 | 0 |
| pokeapi | 48 | 48 | 0 | 0 | 0 | 0 | 0 |
| shortcut | 37 | 37 | 0 | 0 | **2** | 0 | **2** |
| dingconnect | 17 | 17 | 0 | 0 | 0 | 0 | 0 |
| **cloudsmith** | **140** | **75** | **66** | 1 | 1 | 0 | 1 |
| contentfulcma | 39 | 39 | 0 | 0 | 0 | 0 | **1** |
| **learnworlds** | **41** | **29** | **12** | 0 | 0 | **18** | 0 |
| **codatplatform** | **29** | **22** | **8** | 1 | **2** | 0 | **2** |
| gitlab | 276 | 276 | **2** | **2** | 1 | 0 | **2** |
| **github** | 268 | 268 | 0 | 0 | **8** | 0 | **5** |

The four specs the parity test actually checks (solar, petstore, taxonomy, foo)
are the four cleanest — and even `foo` diverges.

**Attribution:**

- *Guide overlay ignored by Go (§3.1)* — all of `foo`; `refresh_data` on
  codatplatform.
- *Naming primitives (§6.1)* — gitlab `api_entities_mr_note` vs
  `api_entities_mrnote`, `api_entities_ssh_key_with_user` vs
  `api_entities_sshkey_with_user`; statuspage `metric` fields
  `y_axis_min/max/hidden` vs `yaxis_min/max/hidden`.
- *Union types (§5.1)* — learnworlds' 18 field-type diffs.
- *Classification* — the substantive remainder. TS promotes trailing action
  segments to standalone entities where Go does not: cloudsmith has
  `/files/{owner}/{repo}/{identifier}/abort/`, `…/complete/`, `…/copy/`,
  `…/disable/`, `…/enable/`, `…/quarantine/`, and TS emits entities named
  `abort`, `complete`, `copy`, `disable`, `enable`, `quarantine`. That is 66
  TS-only entities on one spec, with an empty overlay so §3.1 is ruled out.
  Given the pipeline's own vocabulary — `guide` classifies paths into
  "entities/ops/**actions**" — a trailing verb after an id ought to be an
  *action* on the parent, so Go looks closer to intent here. The judgement is
  the maintainer's; what is not in question is that the same spec yields two
  very different SDKs. §5.5's missing `mergeCollectionPaths` is a candidate
  cause.
- *Entity assignment* — shortcut: the same 5 fields and 4 ops (`create`,
  `list`, `load`, `update`) attach to `comment` in Go and `threaded_comment` in
  TS. contentfulcma: `organization.load` exists only in Go.

### 6.3 Direction of the fixes

The project rule is *"Never make Go diverge from TS. If Go looks more correct,
fix TS first."* Note that **Go is the more correct side** for §4.1
(prototype-key crash), §4.2 (chained `$ref`) and arguably for classification —
while **TS is the more correct side** for §3.1 (guide overlay), §5.1 (unions),
§5.2 (rename), §5.3 (write errors) and §5.4 (top transform).

So the mirroring runs in both directions here. The rule holds; it is just being
exercised more often in the direction the docs treat as the exception.

---

## 7. Recommended fix for the parity mechanism

The TSV format did its job for what it covers — every fixture-covered function
is byte-identical across languages. Its limits are that it is string→string and
pure-function only, so it cannot reach unions, the naming primitives, or
anything above the utility layer.

In dependency order:

1. **A real differential test.** One command that runs both implementations
   over the corpus, serialises each entity model to canonical JSON, and diffs.
   The harness written for this review is about 120 lines total (a Node script
   and a Go `main`) and found everything in §6.2 on its first run. Check the
   *TypeScript* output in as the golden and assert Go against it, so it is also
   obvious when the canonical side moves.
2. **Close or fail loudly on the guide-overlay gap** (§3.1), and make the
   differential run with overlays applied.
3. **Run Go in CI** (§3.6) and gate on the differential.
4. **Fixtures for `snakify`/`camelify`/`kebabify`** (§6.1) — the highest
   value-per-line addition available.
5. **Extend the fixture format for non-string arguments.** A JSON-valued
   column (as `infer-type-from-value.tsv` and `nom.tsv` already do for inputs)
   would let `validator.tsv` cover the array branch. Both loaders already parse
   JSON in selected columns, so this is small.
6. **Delete or wire up the dead comparators** (§3.5); promote the `Logf`
   tolerances to `Errorf` (§3.4); move `model-ref/` out of `ts/test/` and
   rename it to say it is a Go snapshot (§3.3).
7. **Mechanical invariant checks** (§3.9): `// Mirrors src/…` targets exist;
   every `ts/src/*.ts` has a Go counterpart; `git diff --exit-code ts/dist`
   after a clean build.

---

## 8. Performance

Same stages both sides (`parse` + `guide` + `transformers`), single process per
language over the 14-spec corpus:

| spec | TS ms | Go ms |
|---|---:|---:|
| solar | 94 | 10 |
| petstore | 83 | 14 |
| taxonomy | 64 | 7 |
| foo | 35 | 5 |
| statuspage | 238 | 154 |
| pokeapi | 107 | 27 |
| shortcut | 264 | 195 |
| dingconnect | 50 | 49 |
| cloudsmith | 840 | 518 |
| contentfulcma | 240 | 66 |
| learnworlds | 351 | 165 |
| codatplatform | 213 | 113 |
| gitlab | 2247 | 835 |
| **github (8.8 MB)** | **5154** | **2885 – 6709** |

Go is 4–20× faster on small and mid-size specs but its advantage collapses on
the largest, with run-to-run variance over 2×. The CPU profile explains why:

```
runtime.scanobject              29.2% cum
runtime.memmove                  8.8%
runtime.memclrNoHeapPointers     8.6%
struct/go._walkDescend          14.2% cum
struct/go.Items                  8.2% cum
```

Roughly **45% of Go's time on the largest spec is GC and memory traffic**, not
algorithm — `map[string]any` as the universal model currency boxes every
scalar and allocates every nested node, and the tree is walked repeatedly
across nine transform passes.

The agent review localised two specific culprits worth confirming with your own
profiler before acting:

- `selectCmpXrefs`/`Find` (`go/utility.go:681`, called from `guide.go:326`)
  walking the fully-dereferenced spec through the generic sorted `vs.Walk` —
  reported as 614 ms / 287 MB / 5.1 M allocs on github against 99 ms / 1.6 MB
  for an equivalent plain scan. This is consistent with `_walkDescend` at 14.2%
  in my profile.
- `validateSource` (`go/parse.go:303`) regex-stripping every comment from the
  whole 8.8 MB source purely to answer "is this blank?" — reported at 237 ms
  and 32 MB. The TS side answers the same question with a non-allocating
  `RE_HAS_CONTENT.test(source)`; the comment there explicitly says it avoids
  "creating a full string copy", so the port lost the point of the design.

On the TS side, the agent review flags `formatJSONIC` being evaluated eagerly
as an argument to a `debugpath()` that discards it
(`ts/src/guide/heuristic01.ts:627`), reported at 11% (github) to 23% (gitlab)
of wall time. I did not independently confirm the percentages, but the pattern
— an expensive formatter evaluated before a call that may drop it — is worth
checking directly, and is a one-line fix (pass a thunk) if it holds.

Cheapest first, otherwise:

- pre-size maps and slices where the count is known (`make(map[string]any, n)`)
  — much of `memclr`/`memmove` is map growth;
- hoist package-level regexps (§5.9);
- fuse the read-only transform passes, or build an index once, to cut
  `_walkDescend` directly. Nine sequential full traversals
  (`ts/src/apidef.ts:221-229` and the Go equivalent) is the same structural
  cost on both sides;
- longer term, typed structs for the hot inner nodes (fields, ops) instead of
  `map[string]any` would remove most of the boxing — a large change that should
  follow the differential test, not precede it.

---

## 9. Smaller notes

- `generate()` reports start and end times but `steps` is a flat `string[]`
  with no per-stage timing. Given nine transform passes, per-stage timings in
  the result would make regressions visible without a profiler.
- `peerDependencies` are all `">=0"` (`jsonic` `">=2"`, `shape` `">=10"`). For
  a package whose output depends on `jostraca`'s naming functions (§6.1), an
  unbounded range on `jostraca` is a live parity risk, not just a supply-chain
  one.
- `apidef-validate/v1/diff-ts-go.md` is a committed Node stack trace from a
  missing `compare-ts-go.mjs`. Someone started building exactly the
  differential recommended in §7; the script did not survive.

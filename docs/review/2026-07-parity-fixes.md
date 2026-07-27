# Parity fixes — 2026-07

Change log for the work actioning
[`2026-07-code-review.md`](./2026-07-code-review.md). Every number below was
measured by running both implementations; the method is in §2 of the review.

Both suites are green: **TS 624 pass** (was 438 — the new fixture adds 186),
**`go test ./...` ok**.

---

## 1. Measured outcome

### Shared pure functions

A 7,686-input sweep across the 17 functions both implementations expose:

| | divergences |
|---|---:|
| before | **1407** |
| after | **0** |

Every one of `snakify`, `camelify`, `kebabify`, `canonize`, `canonizeCmpName`,
`depluralize`, `validator` (including the union branch), `inferFieldType`,
`cleanComponentName`, `sanitizeSlug`, `slugToPascalCase`, `transliterate`,
`normalizeFieldName`, `stripSchemaNamespace`, `ensureMinEntityName` now agrees
character-for-character.

### End-to-end, over the `apidef-validate` corpus

Entity model compared structurally (`active` stripped), each language run from
its own pristine guide tree:

| | TS-only entities | Go-only | field-set | field-type | op-set |
|---|---:|---:|---:|---:|---:|
| before (14 specs) | 97 | 6 | 15 | 18 | 13 |
| after (12 comparable specs) | **77** | **0** | **5** | **0** | **5** |

Eight of the twelve comparable specs — solar, petstore, taxonomy, statuspage,
pokeapi, dingconnect, contentfulcma, gitlab — are now **structurally identical**
between the two implementations. gitlab (276 entities) and github (268) both
went to zero entity-name divergence.

The remaining two specs (`foo`, `codatplatform`) are no longer compared because
Go now *refuses* them rather than silently producing a different model — see
§3.1.

---

## 2. TypeScript (canonical) fixes

**Prototype-key crash** (`ts/src/utility.ts`) — `IRREGULARS`,
`CUSTOM_PLURALS` and `VALID_CANON` are indexed by spec-derived names but were
plain object literals, so `TABLE['constructor']` returned the inherited Object
member. A valid spec with `components.schemas.Constructor` crashed the build at
the guide stage with `target.toLowerCase is not a function`. All three are now
null-prototype; a `NULL_PROTO_NOTE` in the file explains the rule for new
tables. Go was already correct here.

**Chained `$ref`** (`ts/src/parse.ts`) — `resolvePointer` now follows alias
chains (`$ref` → `$ref`) to their end, with a visited set on the pointer string
so a cyclic alias terminates. Previously the intermediate node was inlined, its
`$ref` *string* key was never followed by the object-valued recursion, and the
schema reached the transforms with no `properties` — dropping every field
silently, and only when `paths` preceded `components` in the document. Go was
already correct.

**`decircular` DAG expansion** (`ts/src/parse.ts`) — replaced with an in-place
`decycle`. `@voxgig/util`'s `decircular` allocates a fresh object per *visit*,
so a component reachable by k paths was copied k times and the result was the
tree expansion of the DAG that `$ref` inlining deliberately shares:

| spec bytes | before | after |
|---:|---|---|
| 1,968 | 19 MB, 422 ms | 67 nodes, 6 ms |
| 2,304 | 172 MB, 4,136 ms | 77 nodes, 6 ms |
| ~2,500 | **OOM** (2 GB heap) | fine |
| 7,008 (depth 40) | unreachable | 217 nodes, 16 ms |

Only cycle-closing edges are rewritten, with `decircular`'s marker string so
the output shape is unchanged. Node prototypes are normalised during the same
walk, preserving the plain-object contract `decircular` provided as a side
effect (the YAML parser returns null-prototype objects; `parse()`'s result is
public).

**`apimodel` on early stops** (`ts/src/apidef.ts`) — the
transformers/builders/generate early returns now include `apimodel`, so the
documented `generate:false` "build the model in memory without writing files"
recipe works. Go already did this.

---

## 3. Go parity fixes

**Naming primitives** (`go/utility.go`) — `partify` now reproduces jostraca's
exactly. Two rules had drifted:

1. jostraca guards acronym collapsing with `(?![a-z])`, so the run's last
   uppercase letter is left to start the next word — `APIaddress` →
   `ap_iaddress`, not `apiaddress`.
2. jostraca merges a single segment into the next only when it is a single
   *uppercase* letter — so `1_2_3` stays `1_2_3` rather than becoming `12_3`.

`Camelify` also upper-cases the first **rune** rather than the first byte
(`part[:1]` split multibyte characters, so `Ünicode` became invalid UTF-8) and
uses full Unicode case mapping via `x/text/cases`, matching JS `toUpperCase`
(`ß` → `SS`; Go's `strings.ToUpper` leaves it).

Visible end-to-end: gitlab's `api_entities_mr_note` /
`api_entities_ssh_key_with_user` and statuspage's `y_axis_min/max/hidden` now
match TS instead of `api_entities_mrnote` / `sshkey_with_user` / `yaxis_*`.

**Union types** (`go/utility.go`, `go/transform_field.go`,
`go/transform_args.go`) — `Validator` returns `any` and handles the type-ARRAY
branch, so OpenAPI 3.1's `type: [string, "null"]` keeps its union instead of
degrading to `` `$ANY` ``. `InferFieldType` follows. Three call sites had been
asserting `type` to string and discarding arrays before `Validator` ever saw
them; they now pass the raw value. `ValidatorString`/`InferFieldTypeString`
serve the string-only call sites and the TSV fixtures.

learnworlds' 18 divergent entities went to 0.

**Parameter rename** (`go/transform_entity.go`) — replaces only the first
matching path segment, as TS's `indexOf` does. Rewriting every occurrence could
emit `/groups/{group_id}/badges/{group_id}` under a chained rename, dropping an
argument from the generated URL.

**`mergeCollectionPaths`** (`go/transform_entity.go`) — ported from
`ts/src/transform/entity.ts`; it was absent entirely. It moves `/X` onto the
entity owning `/X/{id}`, preferring the shallowest owner, and merges
op/action/rename sets when the target already holds the path. This closed
codatplatform's and github's op-set divergences and contentfulcma's
`organization.load`.

**Builder write errors** (`go/builder.go`) — all eight `os.WriteFile` /
`os.MkdirAll` calls went through unchecked, so a build that wrote nothing still
reported `OK` with an empty warning list. They now route through
`writeGen`/`mkdirGen`, which record failures as pipeline warnings.

**Hot regexps** (`go/utility.go`) — `NormalizeFieldName` compiled two regexps
per call and `Kebabify` one; hoisted to package level.

---

## 4. Parity mechanism

**`ts/test/name-parts.tsv`** (62 rows × 3 columns) pins
`snakify`/`camelify`/`kebabify` — previously untested on either side despite Go
hand-porting all three, and the root cause of the largest divergence. Rows were
generated from jostraca (the canonical source) and cover the exact rule classes
that had drifted: acronym runs with and without a following lowercase, single
uppercase vs digit vs lowercase merge candidates, separators, and Unicode
casing. Exercised by `ts/test/tsv.test.ts` and `go/tsv_test.go`.

This doubles as the contract to re-run on any `jostraca` upgrade — the point
being that cross-language parity is only as strong as the parity of the shared
dependencies.

---

## 5. Open — and why

### The guide overlay (review §3.1) — mitigated, not fixed

TS unifies `<prefix>guide.aontu` over the heuristic result via aontu. That
overlay is where every documented customization lives: entity rename, hide,
move, activate, per-path deactivation, method override, param rename, response
transform. **Go has no aontu** — it is not a dependency and the module is not
reachable from this environment — so the port cannot apply it.

Hand-porting an aontu subset was rejected deliberately: reimplementing a
dependency by hand is precisely what produced the `partify` divergence this
work just spent its largest effort undoing.

Instead, `BuildGuide` now **refuses** when the overlay carries customizations,
naming the file and the first offending line. A bare overlay (comments, the two
`@`-includes, or `guide:{}`) is unaffected. Verified against the corpus: it
fires on exactly `foo` and `codatplatform` — the only two specs with real
customizations — and nowhere else.

Silently ignoring the overlay meant `foo` produced `qaz`/`yike` in Go against
TS's `qiz`/`xtra`, with no signal. A loud failure is the honest behaviour until
a Go aontu exists. **The real fix requires porting or vendoring aontu for Go.**

### Entity classification (review §6.2) — needs a decision, not a port

77 TS-only entities remain, concentrated in cloudsmith (65) and learnworlds
(12). These are not a mechanical porting gap. TS promotes trailing action
segments to standalone entities — cloudsmith's
`/files/{owner}/{repo}/{identifier}/abort/` yields an entity named `abort`,
likewise `complete`, `copy`, `disable`, `enable`, `quarantine` — and Go does
not.

A minimal repro (`/files`, `/files/{id}`, `/files/{id}/abort`,
`/files/{id}/complete`) does **not** reproduce it: TS emits just `file` with
`create,list,load`. So the trigger is some further property of those specs, and
closing the gap means first deciding which behaviour is intended.

Given the pipeline's own vocabulary — the guide classifies paths into
"entities / ops / **actions**" — a trailing verb after an id looks like it
should be an *action* on the parent entity, which would make Go closer to
intent and TS the side to change. But that is a product decision about
generated SDK shape, and per the project's canonical-TS rule it should be made
deliberately rather than inferred from a diff. Flagging it rather than picking.

Remaining smaller items in the same category: shortcut assigns the same 5
fields and 4 ops to `comment` (Go) vs `threaded_comment` (TS); gitlab has 2
`head` ops only in Go, though the `METHOD_IDOP` and `METHOD_CONSIDER_ORDER`
tables are byte-identical, so the difference is downstream; github has 2
field-set differences.

## 6. Dependency currency

Everything is now at latest except one package, which is blocked:

| | version | note |
|---|---|---|
| aontu | 0.48.2 | was 0.48.1 |
| @voxgig/struct | 0.2.2 | was 0.2.1 |
| @voxgig/util | 0.5.4 | was 0.5.1 |
| shape | 10.1.3 | was 10.1.0 |
| jostraca, jsonic, @jsonic/yaml, diff, ordu, pino, pino-pretty, typescript | latest | unchanged |
| **@types/node** | **25.9.5** | **held back** — see below |
| github.com/voxgig/util/go | v0.1.5 | was v0.1.2 |
| jsonicjs/yaml/go, voxgig/struct/go, golang.org/x/text, jsonicjs/jsonic/go | latest | unchanged |

**`@types/node` is pinned at 25.9.5 deliberately.** 26.x removes
`TransferListItem` from the `worker_threads` namespace, and `thread-stream`
(reached through `pino` → `pino-pretty`) still references it:

```
node_modules/thread-stream/index.d.ts(96,73): error TS2694:
  Namespace '"worker_threads"' has no exported member 'TransferListItem'
```

`tsc --build` fails on that. Revisit when `thread-stream` updates its typings.

**Two things worth knowing about the npm side.**

First, a footgun: plain `npm update` **downgrades aontu from 0.48.x to 0.46.0**
on any Node older than 24, because aontu 0.48 declares
`engines: { node: '>=24' }` and the peer range was the unbounded `>=0`. That
is a silent downgrade of the package that performs guide unification. The
aontu peer range is therefore now `^0.48.2` rather than `>=0` — **the one
outward-facing change here**, since it tightens the published peer contract.
Revert that single line if the loose range is wanted; the lockfile pin alone
would still give dev and CI the right version, but the footgun would return.

The other six peer ranges are left at `>=0`/`>=2`/`>=10`. That inconsistency
is deliberate — bounding them all is the review's §9 recommendation and a
decision about the published contract, not a mechanical update.

Second, and more consequential: because the peer ranges are loose but the
lockfile pins them, **CI tests against versions no consumer necessarily
gets**. `npm ci` resolves aontu 0.48.2, shape 10.1.3, `@voxgig/util` 0.5.4;
an installing consumer resolves whatever `>=0` yields for them. For a package
whose output depends on `jostraca`'s naming functions (§4), that gap is a
parity risk as much as a supply-chain one.

Verified after all updates: shared pure functions still at **0** divergences,
and the end-to-end corpus table in §1 is **unchanged**. `ts/dist` was rebuilt
clean from the pinned toolchain, which also settles the reproducibility gap
noted in review §3.9.

### Harness and CI (review §3.2–3.6) — untouched

Still open, and still the highest-leverage remaining work: there is no test
that runs both implementations and compares, CI never runs Go, `model-ref/` is
a Go-generated snapshot living under `ts/test/`, ~150 lines of
`validate_test.go` are dead, and several comparisons are `t.Logf` where they
should be `t.Errorf`. The harness used for this work (a ~120-line Node script
plus a Go `main`) is the shape §7 of the review recommends.

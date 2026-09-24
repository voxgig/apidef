# The canonical build and the parity port

apidef exists twice: a TypeScript implementation under `ts/` and a Go
implementation under `go/`. This page explains the relationship between them,
why it is set up this way, and the rules for changing either side.

## TypeScript is canonical

> **`ts/` is the single source of truth.** `go/` is a parity port that must
> reproduce TypeScript behavior exactly.

The TypeScript build is the one published to npm and the one every behavioral
decision is made in. The Go port is a faithful translation that downstream
Go tooling can embed without shelling out to Node.

This direction is deliberate and one-way. When behavior changes:

1. **Change the TypeScript first** (`ts/src/...`). Decide what is correct
   there, with tests.
2. **Then bring Go into parity** (`go/...`) so it produces identical output.
3. **Keep the shared fixtures correct for both** (`ts/test/*.tsv`).

Never "fix" the Go side in a way that diverges from TypeScript. If Go appears
more correct, the fix belongs in TypeScript first; Go follows.

## How parity is enforced

Three mechanisms keep the two implementations in step:

### 1. Shared TSV fixtures

The pure functions — pluralization, canonicalization, slug handling, type
inference, validator mapping — are tested from the *same* tab-separated tables
in `ts/test/*.tsv`. The TypeScript suite runs them via `ts/test/tsv.test.ts`;
the Go suite runs the very same files via `go/tsv_test.go` (which reads
`../ts/test/<name>.tsv`). A behavior change must update the table once, and
both languages are then checked against it.

### 2. Golden model snapshots

`go/validate_test.go` compares the Go model output against reference JSON
snapshots in `ts/test/model-ref/`. (These golden runs read an external
`../../apidef-validate` checkout and `t.Skip` when it is absent, so they do
not block a normal `go test`.)

### 3. `Mirrors src/...` comments

Most Go source files carry comments pointing at the exact TypeScript code they
track, e.g. `// Mirrors src/transform/field.ts:117-144`. When you touch either
side, keep these references accurate — they are the map a reviewer uses to
check that the port still matches.

Where the two languages genuinely cannot behave identically (Go maps are
unordered, JavaScript object keys are insertion-ordered, etc.), the Go code
documents the compensating logic — for example `sortedKeys(...)` to impose a
deterministic order, or an `x-examples-order` annotation captured during parse.

## Text is UTF-16 in one build and UTF-8 in the other

A JavaScript string is a sequence of UTF-16 code units; a Go string is bytes,
read as UTF-8. Four rules keep a spec's text the same in both builds, so the
files they write carry the same bytes:

| Where | TypeScript | Go |
|---|---|---|
| an ill-formed byte sequence in the spec file | Node decodes it to one `U+FFFD` per maximal ill-formed subsequence | `wellFormedUTF8` in `go/parse.go` decodes it the same way (`ts/test/utf8-decode.tsv`) |
| a lone surrogate, such as an unpaired `\ud800` escape | replaced with `U+FFFD` once `jsonic` returns | the parser already reads `U+FFFD` |
| a pair of `\u` escapes that spell one character | the parser reads the character | the parser reads the character, in JSON and in a YAML double-quoted scalar alike (`ts/test/parse-resolve.tsv`) |
| sorting strings | `sort()` and `<` compare code units | `sortUTF16` and `lessUTF16` in `go/utility.go` do the same (`ts/test/sort-order.tsv`) |

The sorting rule matters wherever a supplementary character, an emoji for
instance, meets one in `U+E000` to `U+FFFF`, `U+FFFD` included. By byte, the
emoji sorts last; by code unit, first. The reference counts are the
exception, sorted by code point in both builds so that both cut the same
edge of a reference cycle.

The lone surrogate is the one rule where the TypeScript changed to meet the
Go. A lone surrogate is not a character. TypeScript used to keep it and write
it as a `\ud800` escape inside every quoted string, and a reader built on
UTF-8, the Go parser among them, reads that escape back as `U+FFFD`. So the
model meant one name to the TypeScript tools and another to the Go ones.

## Why not generate one from the other?

Transpiling TypeScript to Go (or vice versa) would couple the two to a tool
that does not understand the idioms that matter here — deterministic ordering,
`$ref` aliasing, the relaxed `jsonic` output format. A hand-written port,
pinned by shared fixtures and golden snapshots, stays idiomatic on both sides
while still being provably equivalent on the inputs that matter.

## Practical workflow

```sh
# 1. change TypeScript, prove it
( cd ts && npm run build && npm test )

# 2. mirror into Go, prove parity
( cd go && go build ./... && go test ./... )

# 3. everything at once
make all
```

See [Work on the codebase](../how-to/work-on-the-codebase.md) for the full
contributor loop.

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

Three mechanisms keep the two implementations honest:

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

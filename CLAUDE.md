# apidef

`@voxgig/apidef` — Voxgig SDK generator. Transforms an OpenAPI/Swagger spec
into an internal API model (entities, operations, fields, flows) that
downstream tools (sdkgen) turn into SDKs.

The full agent guide is [`AGENTS.md`](./AGENTS.md); comprehensive human docs
are in [`docs/`](./docs/README.md). The essentials are below.

## Canonical implementation

**TypeScript (`ts/src/`) is the canonical, reference implementation.** The Go
package (`go/`) is a parity port that must reproduce TS behaviour exactly.

When changing behaviour:

1. Update the TypeScript in `ts/src/` first (it is the source of truth).
2. Then bring `go/` into parity with the new TS behaviour.
3. Keep the shared, language-agnostic fixtures in `ts/test/*.tsv` correct for
   both — they are executed by the TS suite (`ts/test/tsv.test.ts`) and the Go
   suite (`go/tsv_test.go`).

Go source files carry `Mirrors src/...` comments pointing at the TS code they
track; keep those accurate when you touch either side.

## Pipeline

`parse` → `guide` (heuristic classification of paths into entities/ops/
actions) → `transform/*` (build the internal apimodel) → `builder/*` (emit
aontu model source) → `generate` (write files via jostraca).

Entry point: `ts/src/apidef.ts` (`ApiDef` / `ApiDef.makeBuild`).

## Build & test

The npm package lives in `ts/` (`ts/package.json`); `go/` is the parallel Go
project. Run `npm` from `ts/`; `make all` from the repo root drives both.

```sh
cd ts && npm run build   # tsc --build src test  -> ts/dist/, ts/dist-test/
cd ts && npm test        # node --test dist-test/**/*.test.js
make all                 # TS build+test AND Go build+test
cd go && go test ./...
```

`ts/dist/` and `ts/dist-test/` are committed; rebuild and commit them when
`ts/src/` or `ts/test/` changes. CI (`.github/workflows/build.yml`) runs the
npm suite on Node 24.x + latest across Linux/macOS/Windows. Local Node may be
older; the `shape` peer dep wants Node >=24.

The Go `validate_test.go` golden comparisons read an external
`../../apidef-validate` checkout and `t.Skip` when it is absent.

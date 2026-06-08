# apidef

`@voxgig/apidef` — Voxgig SDK generator. Transforms an OpenAPI/Swagger spec
into an internal API model (entities, operations, fields, flows) that
downstream tools (sdkgen) turn into SDKs.

## Canonical implementation

**TypeScript (`src/`) is the canonical, reference implementation.** The Go
package (`go/`) is a parity port that must reproduce TS behaviour exactly.

When changing behaviour:

1. Update the TypeScript in `src/` first (it is the source of truth).
2. Then bring `go/` into parity with the new TS behaviour.
3. Keep the shared, language-agnostic fixtures in `test/*.tsv` correct for
   both — they are executed by the TS suite (`test/tsv.test.ts`) and the Go
   suite (`go/tsv_test.go`).

Go source files carry `Mirrors src/...` comments pointing at the TS code they
track; keep those accurate when you touch either side.

## Pipeline

`parse` → `guide` (heuristic classification of paths into entities/ops/
actions) → `transform/*` (build the internal apimodel) → `builder/*` (emit
jsonic model source) → `generate` (write files via jostraca).

Entry point: `src/apidef.ts` (`ApiDef` / `ApiDef.makeBuild`).

## Build & test

```sh
npm run build      # tsc --build src test  -> dist/, dist-test/
npm test           # node --test dist-test/**/*.test.js
make all           # TS build+test AND Go build+test
cd go && go test ./...
```

`dist/` and `dist-test/` are committed; rebuild and commit them when `src/`
or `test/` changes. CI (`.github/workflows/build.yml`) runs the npm suite on
Node 24.x + latest across Linux/macOS/Windows. Local Node may be older; the
`shape` peer dep wants Node >=24.

The Go `validate_test.go` golden comparisons read an external
`../../apidef-validate` checkout and `t.Skip` when it is absent.

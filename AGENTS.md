# AGENTS.md — agent guide for `@voxgig/apidef`

## Temporary local tool development

Prefer local symlinks to sibling tool checkouts when developing or testing
unreleased Voxgig tools together. Link to the actual package root (for example,
`apidef/ts` or `sdkgen/ts`), build that checkout, and verify that the consumer
resolves the linked code. Use existing validator local-path options where
available.

Do not create or copy `.zip`, `.tgz`, or `npm pack` snapshots into SDK projects
or ad hoc `vendor/` folders just to use local changes. Keep temporary links in
ignored dependency directories; keep machine-specific paths and temporary
`file:` dependencies out of committed manifests and lockfiles. Shared builds
and CI should use published versions or explicitly check out and build the
required source revisions.

Archives are appropriate when testing package contents or installation from a
packed release. Put those artifacts in a temporary test directory and clean
up artifacts created by the test afterward; do not scatter them across repos.

Context for AI coding agents working **on** this repo or using apidef **as a
tool**. Human-readable docs are in [`docs/`](./docs/README.md); this file is
the orientation layer.

Fundamentals are recorded in [`ADR.md`](./ADR.md): decisions everything else
is built on, which must not be quietly reversed. **ADR-001 — entity names are
singular, always**, is the one most easily broken by accident, because every
source apidef infers a name from is naturally plural. **ADR-002 — `guide.aon`
is the only correction surface**: apidef reads no `x-*` vendor extensions and
no overlay documents, so a heuristic must EMIT a rejected classification with
`active: *false` rather than dropping it — anything dropped cannot be switched
back on.

## What this tool does

apidef compiles an OpenAPI 3 / Swagger 2.0 spec into an internal **API model**
— entities, operations, fields, and flows — that downstream tooling (`sdkgen`)
turns into client SDKs. It *infers* structure OpenAPI leaves implicit: which
paths form a resource, which methods are CRUD, how params map to identifiers.

Pipeline: `parse → guide → transform×9 → builder → generate`. Entry point:
[`ts/src/apidef.ts`](./ts/src/apidef.ts).

**Building an SDK end-to-end?** apidef is the *spec → model* step of a larger
pipeline. To go from an OpenAPI spec to a tested, published SDK, start at
[`create-sdkgen/AGENTS.md`](https://github.com/voxgig/create-sdkgen/blob/main/AGENTS.md) (scaffold → generate →
test → publish); this guide covers how apidef turns your spec into the model
that drives it.

## ⚠️ The one rule that matters most

**TypeScript (`ts/`) is the canonical implementation. Go (`go/`) is a parity
port that must reproduce it exactly.** When changing behavior:

1. Change `ts/src/...` first; add/extend a test.
2. Update shared fixtures `ts/test/*.tsv` if a pure function changed. BOTH
   languages execute every row — the TypeScript suite through
   `ts/test/tsv.test.ts`, the Go suite through `go/tsv_test.go` — which is
   what makes a fixture the shared contract rather than one language's test.
3. Mirror the change into `go/...`; corresponding filenames and shared
   tests identify the matching implementation. Follow COMMENT-POLICY.md
   when a surprising difference needs a short explanation.
4. Rebuild and commit `ts/dist` + `ts/dist-test` (committed artifacts).
5. `make all` must be green.

Never make Go diverge from TS. If Go looks more correct, fix TS first.

## Commands

```sh
cd ts && npm run build      # tsc --build src test  ->  ts/dist, ts/dist-test
cd ts && npm test           # node --test dist-test/**/*.test.js   (canonical suite)
cd ts && TEST_PATTERN=foo npm run test-some   # run a subset
cd go && go test ./...                        # the Go parity suite
make all           # TS build+test AND Go build+test  (run before declaring done)
```

The npm package lives in `ts/` (run `npm` there); `go/` is the parallel Go
project. `make all` from the repo root drives both.

Node 24+ (the `shape` peer dep wants it). `go/validate_test.go` golden tests
read an external `../../apidef-validate` checkout and `t.Skip` without it.

## Repository map

```
ts/src/        canonical source
  apidef.ts      pipeline entry (ApiDef, makeBuild, generate)
  parse.ts       parse + $ref resolution
  guide/         heuristic path→entity/op classification
  transform/     9 ordered passes: top,entity,operation,args,select,field,flow,flowstep,clean
  builder/       render model -> aontu files
  utility.ts     pure helpers (depluralize, canonize, validator, formatJSONIC, …)
  types|model|desc|def.ts   shapes & types
ts/test/       *.test.ts, shared *.tsv fixtures, solar/petstore/taxonomy specs, model-ref/ goldens
ts/dist*/      built JS (committed, published)
ts/bin/        voxgig-apidef CLI
ts/cmd/        standalone-executable packaging (node-sea / deno / bun)
ts/package.json  the npm package manifest (ts/ is the package root)
ts/model/      mirror of model/ (published as @voxgig/apidef/model/*)
go/            Go parity port (flat package) + *_test.go
go/model/      mirror of model/ (go:embed, package model)
model/         CANONICAL aontu model schemas: apidef.aon, guide.aon
docs/          full documentation (tutorial / how-to / reference / explanation)
               docs/design/ and docs/review/ are working documents, not pages
STYLE-GUIDE.md how the reader-facing pages are written; tools/check_prose.py
               and .vale.ini gate them (see "Prose follows STYLE-GUIDE.md")
```

The shared aontu model (`apidef.aon`, `guide.aon`) is canonical at
top-level `model/` and mirrored into `ts/model/` (for npm) and `go/model/`
(for the Go module) — each packaging system can only ship files under its own
root. Edit `model/`, then `make sync-model`; `make check-model` (and the TS
suite) fail on drift.

## Using apidef as a tool

```js
const { ApiDef } = require('@voxgig/apidef')
const build = await ApiDef.makeBuild({ folder: '/proj/model', outprefix: 'petstore-' })
const result = await build(
  { name: 'petstore', def: 'petstore.yml' },   // model
  { spec: { base: '/proj/model' } },            // build
  {},
)
result.apimodel.main.kit.entity   // { pet: { op, fields, id, relations, … } }
```

- **Prerequisites:** the spec must declare `servers[0].url`, and a guide entry
  file must exist at `<folder>/guide/<outprefix>guide.aon` (two `@`-includes:
  `@voxgig/apidef/model/guide.aon` and `./<outprefix>base-guide.aon`). See
  [Configuration → The guide file](./docs/reference/configuration.md#the-guide-file).
- **Spec file path rule:** the spec is read from `<build.spec.base>/../def/<model.def>`,
  **not** verbatim. Output goes to `options.folder`.
- **Stop early:** set `ctrl.step.{parse,guide,transformers,builders,generate}`
  to `false` to halt after the previous stage (e.g. `generate:false` builds the
  model in memory without writing files).
- **Override naming:** `model.main.custom.plurals = { axes: 'axe' }` fixes
  mis-singularized entity names.
- Reference: [API](./docs/reference/api.md), [Configuration](./docs/reference/configuration.md),
  [Model](./docs/reference/model.md).

## Conventions & gotchas

- **Commit `ts/dist` and `ts/dist-test`** whenever `ts/src` or `ts/test`
  changes (`cd ts && npm run build` regenerates them).
- **Validator tokens, not OpenAPI types:** field/arg `type` is `` `$STRING` ``,
  `` `$NUMBER` ``, `` `$BOOLEAN` ``, `` `$ANY` ``, … not `"string"`.
- **`$ref` inlining shares structure:** resolved refs share nested children;
  treat inlined schemas as read-only (mutating one leaks to every reference).
- **Determinism in Go:** map iteration is sorted (`sortedKeys`) to match
  JS insertion order; preserve this when porting.
- **Fixtures are LF:** `*.tsv`/`*.aon` are forced to LF (`.gitattributes`).
- **Soft failure:** the pipeline records warnings (`apidef-warnings.txt`)
  rather than aborting; `result.ok`/`result.steps` report how far it got.
- Commit messages: clear and descriptive; do not include model/tool identifiers.

## Prose follows STYLE-GUIDE.md

[`STYLE-GUIDE.md`](STYLE-GUIDE.md) is normative for the reader-facing pages:
the root `README.md` and every page under `docs/` except `docs/design/` and
`docs/review/`, which are working documents. Two gates enforce it and both
run in CI (`.github/workflows/docs.yml`) and under `make test`:

| Gate | Checks |
|---|---|
| `vale --minAlertLevel=error $(python3 tools/check_prose.py --files)` | Google's rules plus the banned list, at the levels in `.vale.ini` |
| `python3 tools/check_prose.py` | the banned list across line wraps, em-dash spacing and ration, first person, no emoji, no citations of a working document, resolving relative links, a complete page set |

`make scan-prose` runs both (Vale where installed). The banned list is
`.vale/styles/config/vocabularies/Apidef/reject.txt`, read by both gates.
The page set is the configuration block at the top of
`tools/check_prose.py`; a new documentation page must be reachable from it
or neither gate reads it.

Three things trip agents most often: a page must not name or link
`AGENTS.md`, `CLAUDE.md`, `ADR.md`, `TODO.md`, or anything under
`docs/design/` or `docs/review/` (state the fact instead); the em dash is
spaced (` — `) and rationed to one aside per line; and a word Vale's
dictionary does not know goes into `accept.txt` one entry at a time, never
as a suffix pattern.

## Releasing

**NOTHING IS EVER PUBLISHED FROM A WORKSTATION. The release is performed by
GitHub Actions over OIDC trusted publishing, and the way you start it is a
WORKFLOW DISPATCH.**

```bash
make publish V=8.6.0              # npm only
make publish GOV=0.7.0            # Go module only
make publish V=8.6.0 GOV=0.7.0    # both, one dispatch
```

`make publish` guards, bumps, builds, tests, commits, pushes `main`, waits for
the remote to actually show the pushed SHA, then dispatches `publish.yml`
pinned to it. The workflow publishes to npm over OIDC and writes BOTH tags —
`vX.Y.Z` for npm, `go/vX.Y.Z` for the module — in a `tag` job that runs git
and nothing else. This section is the short form; the full description, with
every guard and the recovery paths, is
[docs/how-to/release-and-tag.md](./docs/how-to/release-and-tag.md), and the
Makefile and `.github/workflows/publish.yml` are the mechanism itself.

To drive the dispatch by hand — same mechanism, without the bump:

```bash
gh workflow run publish.yml --ref main \
  -f npm=true -f go=false -f expect_sha=$(git rev-parse HEAD)
```

### Never do these

| Don't | Why |
| --- | --- |
| `npm run repo-publish` / `repo-publish-quick` from a checkout | Still in `ts/package.json` and still the obvious-looking route, but they publish over a token and bypass OIDC entirely: no provenance, long-lived credential. Emergencies only. |
| `make publish-go` as the normal Go route | Its own header says "prefer the publish workflow". It commits to the CURRENT branch and tags THAT commit, so from a feature branch it publishes an immutable module version nobody reviewed — and `proxy.golang.org` caches it forever. |
| Hand the release back as "run this locally yourself" | The release is a dispatch. If a local command is unavailable to you, prepare the commit and dispatch the workflow — do not convert a CI release into a manual one. |
| Push a `v*` tag as the normal route | `publish.yml` accepts it, but that path is the FALLBACK for a tag pushed by hand and skips every guard `make publish` runs. |

`--ref main` is a moving target, and `git push` returns BEFORE the ref is
visible to every GitHub read path — so a dispatch fired immediately after a
push can resolve the commit *before* the release commit, and `expect_sha`
refuses by naming the very SHA you just pushed. `make publish` polls
`git ls-remote` until the remote agrees. If you dispatch by hand, do the same.

Keep the two ports in step: a change that touches both `ts/src` and `go/`
needs both a `vX.Y.Z` and a `go/vX.Y.Z` release, or downstreams see the fix in
one runtime only. Verify after publishing: `npm view @voxgig/apidef version`
and `GOPROXY=https://proxy.golang.org go list -m github.com/voxgig/apidef/go@vx.y.z`.

Downstream goldens: `apidef-validate` pins this package and records its
generated output, so a release that changes generated output needs a goldens
refresh there (`v1/package.json`, `v1/go/go.mod`) as a follow-up.

## Where to read more

- New to the tool? [docs/tutorial/getting-started.md](./docs/tutorial/getting-started.md)
- Changing the code? [docs/how-to/work-on-the-codebase.md](./docs/how-to/work-on-the-codebase.md)
- Why it's built this way? [docs/explanation/](./docs/explanation/architecture.md)
- Machine index: [llms.txt](./llms.txt)

## Source code comments

Follow [COMMENT-POLICY.md](COMMENT-POLICY.md): comments are sparse and terse,
only for intricate or surprising code. Names carry intent; documents carry
requirements. Run `make comments comments-test` after editing source.

Durable implementation rationale is in [COMMENT-NOTES.md](COMMENT-NOTES.md).

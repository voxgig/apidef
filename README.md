# @voxgig/apidef

> Voxgig SDK generator — turn an OpenAPI/Swagger spec into a structured API
> model.

`@voxgig/apidef` reads an OpenAPI 3 (or Swagger 2.0) specification and produces
an **internal API model**: a normalized description of the *entities*,
*operations*, *fields*, and *flows* implied by the spec. It infers the things
OpenAPI leaves implicit — which paths form a resource, which methods are
create/read/update/delete, how parameters map to identifiers — and emits an
editable model that downstream tooling (notably `sdkgen`) turns into client
SDKs.

```
OpenAPI / Swagger  ──▶  apidef  ──▶  entities · operations · fields · flows  ──▶  SDKs
```

## Install

```sh
npm install @voxgig/apidef
```

Requires **Node.js 24+**. Several Voxgig libraries are peer dependencies
(`jostraca`, `aontu`, `jsonic`, `@jsonic/yaml`, `@voxgig/struct`,
`@voxgig/util`, `shape`); npm installs them automatically.

## Quick example

```js
const { ApiDef } = require('@voxgig/apidef')

const build = await ApiDef.makeBuild({ folder: '/proj/model', outprefix: 'petstore-' })

const result = await build(
  { name: 'petstore', def: 'petstore.yml' },   // model: name + spec file
  { spec: { base: '/proj/model' } },            // build: spec read from base/../def/
  {},
)

const entities = result.apimodel.main.kit.entity
// entities.pet.op -> { load, list, create, update, remove }
// entities.pet.fields -> [ { name:'id', type:'`$STRING`', req:true }, … ]
```

A full walk-through is in [the getting-started tutorial](./docs/tutorial/getting-started.md).

## Documentation

Comprehensive docs live in [`docs/`](./docs/README.md):

- **[Tutorial](./docs/tutorial/getting-started.md)** — learn by generating your first model.
- **How-to guides** — [library](./docs/how-to/use-as-a-library.md) ·
  [CLI](./docs/how-to/use-the-cli.md) ·
  [naming](./docs/how-to/customize-entity-naming.md) ·
  [pipeline control](./docs/how-to/control-the-pipeline.md) ·
  [debugging](./docs/how-to/debug-a-build.md) ·
  [contributing](./docs/how-to/work-on-the-codebase.md)
- **Reference** — [API](./docs/reference/api.md) ·
  [CLI](./docs/reference/cli.md) ·
  [configuration](./docs/reference/configuration.md) ·
  [model](./docs/reference/model.md) ·
  [guide](./docs/reference/guide.md) ·
  [pipeline](./docs/reference/pipeline.md)
- **Explanation** — [architecture](./docs/explanation/architecture.md) ·
  [classification heuristics](./docs/explanation/classification-heuristics.md) ·
  [the internal model](./docs/explanation/the-internal-model.md) ·
  [canonical build & parity port](./docs/explanation/canonical-and-parity.md)

## Two implementations

apidef ships a canonical **TypeScript** implementation (`ts/`, the published
package) and a **Go** parity port (`go/`) that reproduces it exactly. TypeScript
is the source of truth; Go follows. See
[the parity explanation](./docs/explanation/canonical-and-parity.md).

## Build & test

```sh
cd ts && npm run build   # tsc --build src test  ->  ts/dist, ts/dist-test
cd ts && npm test        # node --test dist-test/**/*.test.js
make all                 # TypeScript build+test AND Go build+test (from repo root)
```

The npm package lives in `ts/`; run `npm` there. `go/` is the parallel Go
project. `make all` from the repo root drives both.

## For AI coding agents

This repository ships agent-oriented context files: [`AGENTS.md`](./AGENTS.md),
[`CLAUDE.md`](./CLAUDE.md), and [`llms.txt`](./llms.txt). Start with
`AGENTS.md`.

## License

[MIT](./LICENSE)

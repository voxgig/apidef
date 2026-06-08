# Reference: programmatic API

The package entry point is `@voxgig/apidef` (CommonJS, `ts/dist/apidef.js`).

```js
const { ApiDef, parse, formatJSONIC, depluralize,
        sanitizeSlug, slugToPascalCase, getModelPath, nom, KIT } = require('@voxgig/apidef')
```

## `ApiDef(options)` → `{ generate }`

Construct an apidef instance. Returns an object with a single method,
`generate`.

```js
const apidef = ApiDef(options)
const result = await apidef.generate(spec)
```

### `ApiDefOptions`

| option | type | default | meaning |
|--------|------|---------|---------|
| `folder` | `string` | — | output directory for generated model files |
| `outprefix` | `string` | `''` | filename prefix for generated files |
| `def` | `string` | — | default spec filename (overridable per build) |
| `debug` | `boolean \| string` | `'info'`¹ | enable debug output; truthy also writes `<def>.full.json` |
| `strategy` | `string` | `'heuristic01'` | guide classification strategy |
| `fs` | `fs`-like | `node:fs` | filesystem implementation (for testing / virtual FS) |
| `pino` | pino instance | — | logger to use instead of the built-in pretty logger |
| `meta` | `object` | `{}` | arbitrary metadata passed through to the build |
| `why` | `{ show?: boolean }` | — | include classification `why_*` traces in output |

¹ The CLI defaults `debug` to `'info'`; the library constructor leaves it
unset unless you pass it.

## `apidef.generate(spec)` → `Promise<ApiDefResult>`

Run the pipeline once. `spec` is an object:

| key | type | meaning |
|-----|------|---------|
| `model` | `object` | the input model — at minimum `{ name, def }`; see [Configuration](./configuration.md) |
| `build` | `object` | `{ spec: { base, … } }` — `base` anchors spec-file resolution |
| `ctrl` | `object` | `{ step: { parse, guide, transformers, builders, generate } }` — which stages to run |
| `now` | `number` | optional fixed timestamp (deterministic generation) |

`generate` never throws; failures are returned as `{ ok: false, err }` and
also appended to `apidef-warnings.txt`.

## `ApiDef.makeBuild(options)` → `Promise<build>`

The integration entry point used by the Voxgig build pipeline
(`voxgig-model`/`jostraca`). Returns an async **build function** tagged with
`build.step = 'pre'`.

```js
const build = await ApiDef.makeBuild({ folder, outprefix, debug })
const result = await build(model, buildSpec, ctx)
```

The build function signature is `build(model, build, ctx)`:

- `model` — `{ name, def }` (and any `main.custom`, see below).
- `build` — `{ spec: { base, buildargs?: { apidef?: { ctrl } }, … }, log? }`.
  - `build.spec.base` anchors spec resolution (the def is read from
    `<base>/../def/<model.def>`).
  - `build.spec.buildargs.apidef.ctrl` supplies the step flags.
  - `build.log`, if present, is used as the logger.
- `ctx` — reserved; pass `{}`.

The instance is created lazily on first call and reused, so per-model state
(custom plurals) is installed and cleared on each `generate`.

## `ApiDefResult`

| field | type | meaning |
|-------|------|---------|
| `ok` | `boolean` | success |
| `steps` | `string[]` | stages that ran (`parse`,`guide`,`transformers`,`builders`,`generate`) |
| `apimodel` | `object` | the built model (`main.kit.{info,entity,flow}`) — see [model](./model.md) |
| `guide` | `object` | the classification result — see [guide](./guide.md) |
| `reload` | `boolean` | true if files were written/merged (downstream re-resolve hint) |
| `start` / `end` | `number` | timestamps (ms) |
| `ctrl` | `object` | the resolved control flags |
| `err` | `Error \| null` | populated when `ok` is false |
| `ctx` | `object` | the full pipeline context (debugging) |
| `jres` | `object` | the `jostraca` generation result (written/merged file lists) |

## Other exports

### `parse(kind, source, meta)` → `Promise<object>`

Parse and `$ref`-resolve a spec without running the rest of the pipeline.

- `kind` — `'OpenAPI'` (the only supported kind).
- `source` — the spec text (YAML or JSON string).
- `meta` — `{ file }` used in error messages.

Rejects on: unknown kind (`/unknown/`), non-string source (`/string/`), empty
or comment-only source (`/empty/`), malformed JSON/YAML (`/JSON/`, `/syntax/`),
or a document with neither `openapi` nor `swagger` (`/Unsupported/`). On
success, returns the parsed object with `components` ensured, every `$ref`
inlined, and the original pointer preserved as `x-ref`.

### Utilities

| export | signature | purpose |
|--------|-----------|---------|
| `formatJSONIC(value, opts?)` | `(any) => string` | render a value as `jsonic` source (used for model files and warnings) |
| `depluralize(word)` | `(string) => string` | singularize, honoring the irregular table and any installed custom plurals |
| `sanitizeSlug(s)` | `(string) => string` | normalize a string to a safe slug |
| `slugToPascalCase(s)` | `(string) => string` | slug → PascalCase |
| `getModelPath(obj, path, opts?)` | `(obj, 'a.b.c') => any` | safe dotted-path lookup |
| `nom(s)` | `(string) => string` | name normalization helper |
| `KIT` | `'kit'` | the model sub-key constant (`apimodel.main[KIT]`) |

Exported TypeScript types include `ApiDefOptions`, the `Model*` model types
(`ModelEntity`, `ModelOp`, `ModelPoint`, `ModelArg`, `ModelField`,
`ModelEntityFlow`, …), the `*Desc` guide-description types, and the OpenAPI
`*Def` types. See [`ts/src/model.ts`](../../ts/src/model.ts),
[`ts/src/desc.ts`](../../ts/src/desc.ts), and [`ts/src/def.ts`](../../ts/src/def.ts).

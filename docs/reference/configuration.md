# Reference: configuration & inputs

apidef's behavior is driven by three input objects passed to `generate` (or to
the `makeBuild` build function): the **model**, the **build spec**, and the
**control** flags. This page documents each, plus how the spec file is located
on disk.

## The model

The model describes *what* to build. It is validated against an open shape
(extra keys allowed). Recognized keys:

| key | type | meaning |
|-----|------|---------|
| `name` | `string` | the API/project name; also seeds generated identifiers |
| `def` | `string` | the spec **filename** (resolved as below) |
| `main.custom.plurals` | `object` | per-model plural → singular overrides for naming |
| `main.kit` / `main.def` / `main.api` | `object` | reserved model sub-trees populated by the pipeline |

Minimal model:

```js
{ name: 'petstore', def: 'petstore.yml' }
```

Model with a naming override (see
[Customize entity naming](../how-to/customize-entity-naming.md)):

```js
{
  name: 'fitness',
  def: 'fitness.yml',
  main: { custom: { plurals: { axes: 'axe', data: 'datum' } } },
}
```

## The build spec

The build spec describes *where* and *how*. apidef reads these keys from
`build.spec`:

| key | type | meaning |
|-----|------|---------|
| `base` | `string` | anchor directory for spec-file resolution (see below) |
| `buildargs.apidef.ctrl` | `object` | the control flags (when using `makeBuild`) |
| `log` | `object` | logging configuration |
| `fs` | `fs`-like | filesystem override |
| `dryrun` | `boolean` | parse/transform without writing files |

(The full shape — `path`, `use`, `res`, `require`, `watch`, … — is defined by
`OpenBuildShape` in [`ts/src/types.ts`](../../ts/src/types.ts); unrecognized
keys are passed through.)

## How the spec file is located

> The spec file path is **not** taken verbatim from `model.def`. It is resolved
> relative to the build base as:
>
> ```
> <build.spec.base>/../def/<model.def>
> ```

So with `base: '/proj/model'` and `def: 'petstore.yml'`, apidef reads
`/proj/def/petstore.yml`. Generated output, by contrast, is written to
`options.folder`. A conventional layout therefore is:

```
proj/
  def/petstore.yml     # input  (base/../def/)
  model/               # output (options.folder), also used as base
    guide/<prefix>guide.jsonic   # the guide entry file (see below)
```

> The spec **must declare at least one server** (`servers[0].url`); the `top`
> transform treats a missing server URL as a fatal error.

## The guide file

The classification (guide) stage reads a guide entry file from:

```
<options.folder>/guide/<outprefix>guide.jsonic
```

You author this file once. It pulls in apidef's guide schema and the
heuristic classification that apidef regenerates on every run
(`<outprefix>base-guide.jsonic`):

```jsonic
@"@voxgig/apidef/model/guide.aontu"
@"<outprefix>base-guide.jsonic"
```

Within a single run the base-guide is written *before* this file is read, so a
cold start works in one pass as long as the guide entry file exists. The
`@voxgig/apidef/model/guide.aontu` reference is resolved from `node_modules`,
so apidef must be installed in the project. Any classification overrides go
below the includes; the file is merged, never clobbered, on re-runs.

## Control flags (`ctrl.step`)

The pipeline runs in five gated stages. Each flag defaults to **true**; set a
flag to `false` to stop *after the previous* stage. They must be enabled in
order — disabling an early stage short-circuits the rest.

```js
ctrl: {
  step: {
    parse: true,        // read + $ref-resolve the spec        -> result.ctx.def
    guide: true,        // classify paths into entities/ops    -> result.guide
    transformers: true, // build the in-memory apimodel        -> result.apimodel
    builders: true,     // render model -> jsonic descriptors
    generate: true,     // write the files to disk
  }
}
```

Common combinations:

| goal | flags |
|------|-------|
| full build (write files) | all `true` (the default) |
| inspect the model in memory, write nothing | `generate: false` |
| inspect classification only | `transformers: false` |
| just parse + `$ref`-resolve | `guide: false` |

When using `makeBuild`, these live at
`build.spec.buildargs.apidef.ctrl.step`. When calling `generate` directly, pass
them as `spec.ctrl`.

See [Run only part of the pipeline](../how-to/control-the-pipeline.md) for
worked examples, and [Pipeline stages](./pipeline.md) for what each stage
produces.

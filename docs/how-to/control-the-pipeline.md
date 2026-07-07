# How to run only part of the pipeline

The pipeline has five gated stages — `parse`, `guide`, `transformers`,
`builders`, `generate` — each defaulting to on. Set a flag to `false` to stop
after the previous stage. This is useful for inspection, testing, and speed.

The flags live at `ctrl.step` when calling `generate`, or at
`build.spec.buildargs.apidef.ctrl.step` when using `makeBuild`.

## Build the model in memory, write nothing

The most common case — get `result.apimodel` without touching disk:

```js
ctrl: { step: { generate: false } }
```

## Inspect classification only

Stop after the guide to see how paths were classified, before any model is
built:

```js
ctrl: { step: { transformers: false } }
// -> result.guide  (entities, ops, actions, renames, why_* traces)
```

The guide stage still reads your `<prefix>guide.aontu`
([see configuration](../reference/configuration.md#the-guide-file)), so it must
exist. `result.guide` is the *resolved* guide (heuristic plus your overrides);
the raw heuristic classification is written to `<prefix>base-guide.aontu` on
disk regardless — useful to read directly when you are bootstrapping the guide
file or diagnosing a `PATH MISMATCH`.

## Parse and resolve `$ref`s only

```js
ctrl: { step: { guide: false } }
// -> result.ctx.def  (parsed spec, refs inlined). ok is false by design.
```

This stops *before* the guide stage, so it needs no guide file. (For a one-shot
parse without constructing a build at all, use the
[`parse` export](./use-as-a-library.md#just-parse-a-spec).)

## Worked example

```js
const build = await ApiDef.makeBuild({ folder: '/proj/model' })

const result = await build(
  { name: 'petstore', def: 'petstore.yml' },
  { spec: {
      base: '/proj/model',
      buildargs: { apidef: { ctrl: { step: {
        parse: true,
        guide: true,
        transformers: true,
        builders: false,   // stop here: build the model, don't render/write
        generate: false,
      } } } },
  } },
  {},
)

console.log(result.steps)   // [ 'parse', 'guide', 'transformers' ]
```

## Notes

- The stages are sequential: disabling an early stage short-circuits every
  later one (the `ok` flag may be `false` when you stop before `transformers`,
  by design — check `result.steps` for what actually ran).
- See [Configuration](../reference/configuration.md#control-flags-ctrlstep)
  for the flag table and [Pipeline stages](../reference/pipeline.md) for what
  each stage produces.

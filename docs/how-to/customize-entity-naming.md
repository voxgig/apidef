# How to customize entity naming (plurals)

apidef singularizes collection names to derive entity names: `planets` →
`planet`, `categories` → `category`. English pluralization is irregular, so a
built-in table handles the common exceptions (`people` → `person`, `indices` →
`index`, `analyses` → `analysis`, and many more).

When your API uses a word the generic rules get wrong, override it **per
model** with `custom.plurals`.

## Add an override

Put a plural → singular map at `model.main.custom.plurals`:

```js
const result = await build(
  {
    name: 'fitness',
    def: 'fitness.yml',
    main: { custom: { plurals: {
      axes: 'axe',     // default would singularize "axes" to "axis"
      data: 'datum',
      foos: 'foo',
    } } },
  },
  { spec: { base: '/proj/model' } },
  {},
)
```

## How a word is resolved

`depluralize` consults sources in this order, first match wins:

1. **Custom plurals** — exact match (case-insensitive), then the longest
   matching suffix. `axes → axe`; with `widgets → widget`, also
   `user_widgets → user_widget`.
2. **Built-in irregular table** — `people → person`, `caches → cache`, etc.
3. **Suffix rules** — `-ies → -y`, `-oes → -o`, `-es`/`-s` stripping, etc.
   A `-ves` plural becomes `-f` or `-fe` only for the words that take it
   (`wolves → wolf`, `knives → knife`); any other drops the `-s` alone
   (`objectives → objective`).

Casing is reapplied from the input, so `Axes → Axe` and `AXES → AXE`.

## Notes and gotchas

- Keys are matched lowercased; values are used verbatim. Non-string or empty
  values are ignored, so a half-finished entry can't blank out a name.
- Overrides are scoped to a single `generate` call and cleared afterward —
  two models built in the same process do not leak plurals into each other.
- The override is also the right fix for a word that *over-strips*. For
  example `shoes`/`canoes`/`oboes` are handled in the built-in table (they
  would otherwise hit the `-oes → -o` rule). If you hit a similar word the
  built-ins miss, add it to `custom.plurals` rather than renaming your API.

## Names that differ only in case or underscores

A schema named `UseCase` gives the entity `use_case`, and a path segment
`/usecases` gives `usecase`. PHP and case-insensitive file systems cannot tell
the two apart, so apidef merges them into the spelling with the most words,
`use_case`, which keeps the paths of both. To keep a path apart, switch it off
on the merged entity with `active: false` in `guide.aontu` and list it under an
entity of another name.

## Verifying the result

Build with `generate: false` and read back the entity names:

```js
console.log(Object.keys(result.apimodel.main.kit.entity))
```

If a name is still wrong, you can also override the classification directly in
your `guide.aontu` — see
[Correcting the guide](../reference/guide.md#correcting-the-guide).

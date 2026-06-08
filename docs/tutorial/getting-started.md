# Getting started

By the end of this tutorial you will have installed `@voxgig/apidef`, run it
over a small OpenAPI specification, and looked at the API model it produces.
You do not need to know anything about the internals — we will explain just
enough as we go.

## 1. Install

apidef is published to npm. It targets **Node.js 24+** and is a CommonJS
package.

```sh
mkdir my-sdk && cd my-sdk && npm init -y
npm install @voxgig/apidef
```

Installing into your project matters: apidef's guide file (step 4) references
`@voxgig/apidef/model/...` and resolves it from `node_modules`.

## 2. Lay out the project

apidef reads a spec file and a *guide* file, and writes model source files
into an output folder. Create this structure:

```
my-sdk/
  def/
    petstore.yml                 # the OpenAPI spec (input)
  model/
    guide/
      petstore-guide.jsonic      # the guide entry file (you write this, step 4)
  generate.mjs                   # the script (step 5)
```

> **Why `def/` and `model/`?** apidef resolves the spec file *relative to the
> build base*, as `<base>/../def/<your-def-file>`. Our build base is
> `my-sdk/model`, so the spec is looked up at `my-sdk/model/../def/`, i.e.
> `my-sdk/def/`. Generated files are written under the output folder
> (`my-sdk/model`). See [Configuration](../reference/configuration.md) for the
> exact rule.

## 3. Write a tiny spec

Put this in `my-sdk/def/petstore.yml`. Note the `servers` entry — apidef
requires at least one server URL.

```yaml
openapi: 3.0.0
info:
  title: Petstore
  version: 1.0.0
servers:
  - url: https://api.example.com/v1
paths:
  /pets:
    get:
      responses:
        '200':
          content:
            application/json:
              schema:
                type: array
                items: { $ref: '#/components/schemas/Pet' }
    post:
      responses:
        '200':
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Pet' }
  /pets/{pet_id}:
    get:
      responses:
        '200':
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Pet' }
    put:
      responses:
        '200':
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Pet' }
    delete:
      responses:
        '200': { description: deleted }
components:
  schemas:
    Pet:
      type: object
      required: [id, name]
      properties:
        id: { type: string }
        name: { type: string }
        weight: { type: number }
```

## 4. Write the guide file

The **guide** is how apidef records its path-classification — and how *you*
override it when a heuristic guesses wrong. On every run apidef writes its
automatic classification to `<prefix>base-guide.jsonic`; your
`<prefix>guide.jsonic` pulls that in (and the guide schema) so the build can
read it.

Put exactly this in `my-sdk/model/guide/petstore-guide.jsonic`:

```jsonic
@"@voxgig/apidef/model/guide.jsonic"
@"petstore-base-guide.jsonic"
```

The prefix (`petstore-`) matches the `outprefix` we set in the next step. You
write this two-line file once; the `base-guide` it includes is regenerated on
every run. (Later, you can add overrides below these includes — see
[How path classification works](../explanation/classification-heuristics.md).)

## 5. Generate the model

Put this in `my-sdk/generate.mjs`:

```js
import { ApiDef } from '@voxgig/apidef'

const root = new URL('.', import.meta.url).pathname  // my-sdk/

const build = await ApiDef.makeBuild({
  folder: root + 'model',     // where generated files are written
  outprefix: 'petstore-',     // filename prefix (matches the guide file)
})

const result = await build(
  { name: 'petstore', def: 'petstore.yml' },   // the model: name + spec file
  { spec: { base: root + 'model' } },           // build: base resolves def at base/../def
  {},
)

console.log('ok:', result.ok, 'steps:', result.steps)

const entities = result.apimodel.main.kit.entity
for (const name of Object.keys(entities)) {
  const e = entities[name]
  console.log(`\nentity ${name}`)
  console.log('  ops:   ', Object.keys(e.op).filter(o => e.op[o]))
  console.log('  fields:', e.fields.map(f => `${f.name}${f.req ? '*' : ''}:${f.type}`))
}
```

Run it:

```sh
node generate.mjs
```

## 6. Read the output

You should see:

```
ok: true steps: [ 'parse', 'guide', 'transformers', 'builders', 'generate' ]

entity pet
  ops:    [ 'create', 'list', 'load', 'remove', 'update' ]
  fields: [ id*:`$STRING`, name*:`$STRING`, weight:`$NUMBER` ]
```

Notice what apidef did *without being told*:

- It grouped `/pets` and `/pets/{pet_id}` into a single **`pet`** entity, and
  singularized the name (`pets` → `pet`).
- It classified the HTTP methods into CRUD **operations**: `GET /pets` → `list`,
  `GET /pets/{pet_id}` → `load`, `POST` → `create`, `PUT` → `update`,
  `DELETE` → `remove`.
- It pulled **fields** out of the `Pet` schema, inferred their types
  (`` `$STRING` ``, `` `$NUMBER` ``), and marked the `required` ones (`*`).
- It renamed the `{pet_id}` path parameter to the entity's canonical `id`.

This automatic classification is the *guide* stage — see
[How path classification works](../explanation/classification-heuristics.md).

## 7. Look at the generated files

apidef also wrote model source files under `my-sdk/model/`:

```
model/
  api/    petstore-api-info.jsonic        # title, version, servers
  entity/ petstore-pet.jsonic             # the pet entity
          petstore-entity-index.jsonic    # barrel that @-includes each entity
  flow/   petstore-BasicPetFlow.jsonic    # a basic CRUD test flow
          petstore-flow-index.jsonic
  guide/  petstore-guide.jsonic           # your guide (kept)
          petstore-base-guide.jsonic      # the regenerated heuristic classification
```

These are [`jsonic`](https://github.com/jsonicjs/jsonic) files — a relaxed
JSON dialect. They are the hand-off point to `sdkgen`, which turns them into
an actual SDK. apidef *merges* into existing files on re-runs, so edits you
make are preserved.

## Where to next

- Returning the model in-memory vs. writing files, and the full options:
  [Use apidef as a library](../how-to/use-as-a-library.md).
- The complete shape of `result.apimodel`:
  [The internal API model](../reference/model.md).
- What each `steps` stage does: [Pipeline stages](../reference/pipeline.md).
- When the automatic naming gets a word wrong:
  [Customize entity naming](../how-to/customize-entity-naming.md).
```

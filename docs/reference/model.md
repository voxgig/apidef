# Reference: the internal API model

The model is `result.apimodel`. Its working tree is `main.kit` (the constant
`KIT` is `'kit'`), with three collections:

```
apimodel.main.kit
├─ info    { title, version, servers? }
├─ entity  { <name>: ModelEntity }
└─ flow    { <FlowName>: ModelEntityFlow }
```

TypeScript types are in [`ts/src/model.ts`](../../ts/src/model.ts).

## `info`

| field | type | meaning |
|-------|------|---------|
| `title` | `string` | from `spec.info.title` |
| `version` | `string` | from `spec.info.version` |
| `servers` | `{ url }[]` | from `spec.servers`; URLs missing a scheme are prefixed `https://` |

## `ModelEntity`

| field | type | meaning |
|-------|------|---------|
| `name` | `string` | canonical singular name |
| `fields` | `ModelField[]` | the data shape |
| `op` | `ModelOpMap` | `{ load, list, create, update, remove, patch }` (each `ModelOp` or `undefined`) |
| `id` | `{ field, name }` | which field identifies an instance |
| `relations` | `{ ancestors: string[][] }` | ancestor entity chains (nesting) |
| `alias` | `{ field: {} }` | field-name aliases (reserved; currently empty) |
| `active` | `boolean` | included in output |

### `ModelField`

| field | type | meaning |
|-------|------|---------|
| `name` | `string` | canonical field name |
| `type` | `string` | validator token — `` `$STRING` ``, `` `$NUMBER` ``, `` `$BOOLEAN` ``, `` `$ANY` ``, … |
| `req` | `boolean` | required (from the schema's `required[]`) |
| `active` | `boolean` | included in output |
| `op` | `{ [opname]: { req, type } }` | per-operation overrides when `req`/`type` differ for a specific op |

## `ModelOp`

| field | type | meaning |
|-------|------|---------|
| `name` | `string` | `load`/`list`/`create`/`update`/`remove`/`patch` |
| `points` | `ModelPoint[]` | every concrete path/method producing this op |

### `ModelPoint`

| field | type | meaning |
|-------|------|---------|
| `orig` | `string` | the source path string |
| `parts` | `string[]` | the path split into segments (params as `{name}`, post-rename) |
| `method` | `string` | HTTP method |
| `rename` | `{ param: { [orig]: target } }` | parameter renames applied to this path |
| `args` | `{ params: ModelArg[] }` | the call arguments |
| `select` | `{ exist: string[], $action? }` | which instance(s) this point targets |
| `transform` | `{ req, res }` | request/response envelope handling (defaults `` `reqdata` `` / `` `body` ``) |
| `relations` | `array` | per-point relation links |
| `active` | `boolean` | included in output |

### `ModelArg`

| field | type | meaning |
|-------|------|---------|
| `kind` | `string` | `'param'` (path parameter) |
| `name` | `string` | canonical argument name (e.g. `id`) |
| `orig` | `string` | original wire name (e.g. `planet_id`) |
| `reqd` | `boolean` | required |
| `type` | `string` | validator token |
| `active` | `boolean` | included in output |

## `ModelEntityFlow`

A flow is an ordered, assertable exercise of an entity.

| field | type | meaning |
|-------|------|---------|
| `name` / `key$` | `string` | flow name (e.g. `BasicPlanetFlow`) |
| `entity` | `string` | the entity it exercises |
| `kind` | `string` | `'basic'` for the generated CRUD round-trip |
| `param` | `object` | flow-level parameters |
| `step` | `ModelEntityFlowStep[]` | the ordered steps |
| `active` | `boolean` | included in output |

### `ModelEntityFlowStep`

| field | type | meaning |
|-------|------|---------|
| `op` | `string` | the operation to invoke |
| `input` | `object` | inputs supplied to the op |
| `data` | `object` | the record data for create/update |
| `match` | `object` | which instance the step addresses |
| `valid` | `array` | assertions to run afterward (e.g. `ItemExists`, `TextFieldMark`) |
| `spec` | `array` | mutation specs applied during the step |
| `active` | `boolean` | included in output |

## Worked example (abridged)

The solar `planet` entity:

```jsonic
entity: planet: {
  name: planet
  id: { field: id, name: id }
  fields: [
    { name: id,       req: false, type: `$STRING`,  active: true }
    { name: name,     req: false, type: `$STRING`,  active: true }
    { name: diameter, req: false, type: `$NUMBER`,  active: true }
    # …
  ]
  op: {
    list: { name: list, points: [ {
      method: GET, orig: "/api/planet", parts: [ api, planet ]
      args: { params: [] }
      select: {}
      transform: { req: `reqdata`, res: `body` }
      active: true
    } ] }
    load: { name: load, points: [ {
      method: GET, orig: "/api/planet/{planet_id}", parts: [ api, planet, "{id}" ]
      rename: { param: { planet_id: id } }
      args: { params: [ { kind: param, name: id, orig: planet_id, reqd: true, type: `$STRING`, active: true } ] }
      select: { exist: [ id ] }
      transform: { req: `reqdata`, res: `body` }
      active: true
    } ] }
    # create / update / remove …
  }
}
```

A corresponding flow:

```jsonic
flow: BasicPlanetFlow: {
  entity: planet, kind: basic
  step: [
    { op: create, input: { id: planet_n01 }, data: { id: planet_n01 } }
    { op: list,   valid: [ { apply: ItemExists, spec: { id: planet_n01 } } ] }
    { op: update, input: { id: planet_n01 }, spec: [ { apply: TextFieldMark, def: { mark: Mark01-planet_n01 } } ] }
    { op: load,   match: { id: planet_n01 }, valid: [ { apply: TextFieldMark, def: { mark: Mark01-planet_n01 } } ] }
    { op: remove, match: { id: planet_n01 } }
    { op: list,   valid: [ { apply: ItemNotExists, def: { id: planet_n01 } } ] }
  ]
}
```

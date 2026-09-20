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
| `fields` | `Record<string, ModelField>` | the data shape, keyed by each field's `n` |
| `op` | `ModelOpMap` | `{ load, list, create, update, remove, patch }` (each `ModelOp` or `undefined`) |
| `id` | `{ field, name }` | which field identifies an instance |
| `relations` | `{ ancestors: string[][] }` | ancestor entity chains (nesting) |
| `alias` | `{ field: {} }` | field-name aliases (reserved; currently empty) |
| `active` | `boolean` | included in output |

### `ModelField`

| field | type | meaning |
|-------|------|---------|
| `n` | `string` | canonical field name, matching its map key |
| `h` | `string` | human title derived from `n`, such as `created_at` → `Created At` |
| `t` | `string` | validator token — `` `$STRING` ``, `` `$NUMBER` ``, `` `$BOOLEAN` ``, `` `$ANY` ``, … |
| `r` | `boolean` | required (from the schema's `required[]`) |
| `a` | `boolean` | included in output |
| `op` | `{ [opname]: { req, type } }` | per-operation overrides when `req`/`type` differ for a specific op |
| `sh` | `string?` | the property's `description`, reduced to one sentence |
| `ro` | `boolean?` | the spec says a client must not send this field |
| `wo` | `boolean?` | the spec says the field is never returned |
| `de` | `boolean?` | the spec marks the property deprecated |
| `fo` | `string?` | the property's `format`, trimmed (`date-time`, `password`, …) |

The last five are present only when the spec states them, and the three flags
only when the spec states them **true**. Each defaults to false in OpenAPI, so
an absent key and an explicit `false` carry the same information.
That distinction matters: an absent key means the spec said nothing, never
that apidef dropped it.

Where two schemas for one field disagree — a response marking a field
`readOnly` and a request body listing it as ordinary — the first declaration
wins in operation precedence order, which reads the response first. A spec
that does both contradicts itself, and believing the restriction costs a
caller one field they might have been able to send, while believing the
omission sends a value the server rejects.

## `ModelOp`

| field | type | meaning |
|-------|------|---------|
| `name` | `string` | `load`/`list`/`create`/`update`/`remove`/`patch` |
| `points` | `ModelPoint[]` | every concrete path/method producing this op |

### `ModelPoint`

| field | type | meaning |
|-------|------|---------|
| `orig` | `string` | the source path string |
| `segments` | `PathSegment[]` | the resolved path: `{ lit }` for a literal element, `{ var }` naming one of `args.params`. Renames are already applied, and there is no braced string to parse: the model carries resolved structure, never a template |
| `method` | `string` | HTTP method |
| `rename` | `{ param: { [orig]: target } }` | parameter renames applied to this path |
| `args` | `{ params: ModelArg[] }` | the call arguments |
| `select` | `{ exist: string[], $action? }` | which instances this point targets |
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
  fields: {
    id:       { n: id, h: Id, r: false, t: `$STRING`, a: true }
    name:     { n: name, h: Name, r: false, t: `$STRING`, a: true }
    diameter: { n: diameter, h: Diameter, r: false, t: `$NUMBER`, a: true }
  }
  op: {
    list: { name: list, points: [ {
      method: GET, orig: "/api/planet"
      segments: [ { lit: api } { lit: planet } ]
      args: { params: [] }
      select: {}
      transform: { req: `reqdata`, res: `body` }
      active: true
    } ] }
    load: { name: load, points: [ {
      method: GET, orig: "/api/planet/{planet_id}"
      segments: [ { lit: api } { lit: planet } { var: id } ]
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

## Operation contracts

Each operation point can carry `contract: { version: 2, id, source }`.
The identifier is the method and original path; `source` is `openapi3`,
`swagger2`, or `graphql`. Version 2 identifies the shape without a JSON
payload; version 1 consumers must migrate. Consumers should reject unknown
contract versions.

Contracts contain identity only. Request and response schemas, parameters,
and security details come from the API specification. JSON contract payloads
are no longer generated, including when an older caller passes `contractJson`.
Docgen reads this information directly from the OpenAPI specification.

An operation's `live` guide entry is copied to `point.live`. It provides
input recipes and semantic bindings that the definition cannot express.
GraphQL invocations remain on `point.graphql`, and entity fields remain
available independently. The `contract` guide entry can replace request,
response, parameter, or security facts through the resolved capability. It does not add facts to
the point contract.

In TypeScript, `resolvedSpec(result)` or `resolvedSpec(buildctx)` returns the
capability. Call `operation(method, path)` to read merged specification facts
with guide corrections and `factSources` attribution. The Go equivalents are
`ResolvedSpecFrom(result)` and `ResolvedSpec.Operation(method, path)`; the
latter returns facts and an error. Both use the parsed definition and read the
current guide. The capability version remains 1, independently of the point
contract version.

If multiple guide operations correct the same method and path, supply an
entity and operation selector: `{ entity: "item", op: "load" }` in TypeScript,
or `OperationSelector{Entity: "item", Op: "load"}` in Go. An ambiguous lookup
without a selector fails instead of choosing one correction.

See [the contract tests](../../ts/test/contract.test.ts) for identity-only
output and recursive-schema coverage.

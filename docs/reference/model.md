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

The shared `%op-points` type defines each item in an operation's `points`
list. Required attributes use one character; optional metadata uses two.

| field | type | meaning |
|-------|------|---------|
| `a` | `boolean` | included in output; defaults to `true` |
| `k` | `string` | transport kind; defaults to `http`, or `graphql` |
| `m` | `string` | HTTP method |
| `o` | `string` | source path or GraphQL root field |
| `s` | `PathSegment[]` | resolved path: `{ lit }` for a literal element, `{ var }` naming one of `g.params`; renames are already applied |
| `r` | `{ param, query, header, cookie }` | argument renames, keyed by original name |
| `g` | `{ params, query, header, cookie }` | argument lists using `%point-args` |
| `q` | `{ exist: string[], $action? }` | which instances this point targets |
| `t` | `{ req, res }` | request/response envelope handling (defaults `` `reqdata` `` / `` `body` ``) |
| `co` | `object?` | operation contract identity |
| `li` | `boolean` or `object`, optional | live invocation hint |
| `gq` | `object?` | GraphQL document, variables, and pagination |

### `ModelArg`

Required attributes use one character; optional metadata uses two.

| field | type | meaning |
|-------|------|---------|
| `k` | `string` | argument kind: `param`, `query`, `header`, or `cookie` |
| `n` | `string` | canonical argument name (for example, `id`) |
| `r` | `boolean` | required |
| `t` | `any` | validator token or validator expression |
| `a` | `boolean` | included in output; defaults to `true` |
| `or` | `string?` | original wire name (for example, `planet_id`) |
| `ex` | `any?` | advertised parameter example or schema default |

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

Flow steps use `%flow-step`, declared in `main.kit.type`. All step attributes
are required; `a` defaults to `true`.

| field | type | meaning |
|-------|------|---------|
| `o` | `string` | the operation to invoke |
| `i` | `object` | inputs supplied to the op |
| `d` | `object` | the record data for create/update |
| `m` | `object` | which instance the step addresses |
| `v` | `array` | assertions to run afterward (e.g. `ItemExists`, `TextFieldMark`) |
| `s` | `array` | mutation specs applied during the step |
| `a` | `boolean` | included in output |

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
      m: GET, o: "/api/planet"
      s: [ { lit: api } { lit: planet } ]
      g: { params: [] }
      q: {}
      t: { req: `reqdata`, res: `body` }
      a: true
    } ] }
    load: { name: load, points: [ {
      m: GET, o: "/api/planet/{planet_id}"
      s: [ { lit: api } { lit: planet } { var: id } ]
      r: { param: { planet_id: id } }
      g: { params: [ { k: param, n: id, or: planet_id, r: true, t: `$STRING`, a: true } ] }
      q: { exist: [ id ] }
      t: { req: `reqdata`, res: `body` }
      a: true
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
    { o: create, i: { id: planet_n01 }, d: { id: planet_n01 } }
    { o: list,   v: [ { apply: ItemExists, spec: { id: planet_n01 } } ] }
    { o: update, i: { id: planet_n01 }, s: [ { apply: TextFieldMark, def: { mark: Mark01-planet_n01 } } ] }
    { o: load,   m: { id: planet_n01 }, v: [ { apply: TextFieldMark, def: { mark: Mark01-planet_n01 } } ] }
    { o: remove, m: { id: planet_n01 } }
    { o: list,   v: [ { apply: ItemNotExists, def: { id: planet_n01 } } ] }
  ]
}
```

## Operation contracts

Each operation point can carry `co: { version: 2, id, source }`.
The identifier is the method and original path; `source` is `openapi3`,
`swagger2`, or `graphql`. Version 2 identifies the shape without a JSON
payload; version 1 consumers must migrate. Consumers should reject unknown
contract versions.

Contracts contain identity only. Request and response schemas, parameters,
and security details come from the API specification. JSON contract payloads
are no longer generated, including when an older caller passes `contractJson`.
Docgen reads this information directly from the OpenAPI specification.

An operation's `live` guide entry is copied to `point.li`. It provides
input recipes and semantic bindings that the definition cannot express.
GraphQL invocations remain on `point.gq`, and entity fields remain
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

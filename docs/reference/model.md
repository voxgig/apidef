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
| `auth` | `false` | present only when the spec declares no security |
| `security` | `{ scheme, type, in, name, prefix }` | the credential the client sends, with `alternatives` and `exchange` when they apply |

### `info.security`

A generated client sends one credential, so `scheme` names a single scheme.
Each operation's `security` list counts, or the spec's own list when the
operation has none, and an entry that needs several schemes together is
skipped. The scheme is the first of:

1. the scheme that every secured operation lists first;
2. the first single-scheme entry in the spec's top-level `security`;
3. the first scheme the spec declares, even one no operation applies.

`alternatives` lists every other entry the operations accept, each one an
array of the schemes sent together, so a pair such as `X-Auth-Email` with
`X-Auth-Key` sits there beside a bearer token. `exchange` names an
operation that trades a credential for an access token. Each case is a row
in `ts/test/security.tsv`.

## `ModelEntity`

| field | type | meaning |
|-------|------|---------|
| `name` | `string` | canonical singular name |
| `fields` | `Record<string, ModelField>` | the data shape, keyed by each field's `n` |
| `op` | `ModelOpMap` | `{ load, list, create, update, remove, patch }` (each `ModelOp` or `undefined`) |
| `id` | `{ field, name }` | which field identifies an instance |
| `relations` | `{ ancestors: string[][] }` | ancestor entity chains; generated model files use checked entity paths |
| `alias` | `{ field: {} }` | field-name aliases (reserved; currently empty) |
| `active` | `boolean` | included in output |

Generated ancestor links use `path("$.main.kit.entity.planet")`. The schema
applies `rel()` to each link and rejects missing entities, self-links,
entity children, and targets outside `main.kit.entity`. The in-memory
compiler model retains entity names until the file builder renders them.

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
| `q` | `{ exist: string[], $action? }` | how a call selects this point: its path parameters and required arguments, and its action |
| `t` | `{ req, res }` | request/response envelope handling (defaults `` `reqdata` `` / `` `body` ``) |
| `rb` | `ModelRequestBody?` | the request body's media type and encoding, present only when the body is not JSON alone |
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

A parameter with no name, or whose `$ref` resolves to nothing, is dropped with
a warning. A path placeholder that no declared parameter fills still needs a
value, so it becomes a required string `param` under its own name, renamed as
the path's other placeholders are, again with a warning. A placeholder that a
declared parameter fills under its renamed name is left alone.

### `ModelRequestBody`

A point carries `rb` when its operation declares a request body that is not
JSON alone. When the body would be sent as `application/json` and every other
media type the operation accepts is JSON too, the point carries none, and its
body is sent as JSON.

| field | type | meaning |
|-------|------|---------|
| `kind` | `string` | how the body is encoded: `json`, `raw`, `multipart`, or `form` |
| `media` | `string` | the media type the body is sent as, the request's `content-type` |
| `binary` | `boolean?` | `true` when a `raw` body is bytes rather than text |
| `fields` | `RequestBodyField[]?` | the fields of a `multipart` or `form` body, in code point order of `name` |
| `alternatives` | `ModelRequestBody[]?` | the other media types the operation accepts, in preference order; on `rb` only |

Each `RequestBodyField` names one field of the body:

| field | type | meaning |
|-------|------|---------|
| `name` | `string` | the field name as the definition spells it, which is the name sent |
| `binary` | `boolean?` | `true` when the field carries a file |
| `list` | `boolean?` | `true` when the field is an array sent as one field per item |
| `join` | `string?` | the delimiter joining an array field's items into one value |
| `media` | `string?` | the content type the definition declares for the field: its `encoding` entry, else its `contentMediaType` |

As with the field flags, `binary` and `list` are present only when true. An
array field carries `list` or `join`, never both.

**Media types.** An OpenAPI 3 operation's are the keys of
`requestBody.content`. A Swagger 2 operation with a `body` or `formData`
parameter takes its own `consumes`, else the document's, and an operation's
parameter replaces the path's of the same location and name. When neither
declares any, a `body` parameter is `application/json`, `formData` holding a
`file` is `multipart/form-data`, and other `formData` is
`application/x-www-form-urlencoded`. Each `formData` parameter is a field of
the body, and a `type: file` field is binary.

**Kind.** `application/json`, `text/json`, and every `+json` type are `json`;
`application/x-www-form-urlencoded` is `form`; every `multipart/` type is
`multipart`; anything else is `raw`. A range that admits JSON, `*/*` or
`application/*`, is `json` sent as `application/json`, unless its schema is
`format: binary` or has a `contentMediaType` and is not encoded text; then
it is a binary `raw` body sent as `application/octet-stream`. A `+json`
range is sent as `application/json`, and `multipart/*` as
`multipart/form-data`.

**Binary.** A schema with `format: byte` or a `contentEncoding` is encoded
text, and never bytes. Otherwise a `raw` body is bytes when its schema is
absent or constrains nothing, is `format: binary`, or has a
`contentMediaType`, and also when its media type is not text. The text media
types are `text/*`, `application/xml`, and every `+xml` type. A field is
binary when its schema, or for a list its items' schema, is `format: binary`
or `type: file`, or has a `contentMediaType`, and is not encoded text.

**Arrays.** A Swagger 2 array is joined by its `collectionFormat`: `csv`,
the default, with `,`, `ssv` with a space, `tsv` with a tab, and `pipes` with
`|`, while `multi` sends one field per item. An OpenAPI 3 form array follows
its `encoding` entry: `style: form`, the default, repeats unless
`explode: false` joins it with `,`, and `spaceDelimited` and `pipeDelimited`
join with a space and `|` unless `explode: true` repeats them. A multipart
array always sends one part per item.

**Choice.** JSON comes first whenever it is offered, `application/json`
before the other JSON types, then `multipart`, `form`, and `raw`. Within a
kind, the order is code point order of the media type. The first is `rb`,
and the rest are its `alternatives`. Two media types sent as the same one,
such as `*/*` beside `application/json`, are one.

**Correction.** `body.media` on the operation's entry in `guide.aontu` names
the media type to send. A declared media type, a range such as `multipart/*`
included, is chosen with its own schema.
An undeclared one is classified from the media type alone, so an undeclared
raw type is binary, and an operation that declares no body gains one.

Each rule is a row in
[`ts/test/request-body.tsv`](../../ts/test/request-body.tsv). One point of
each kind:

```jsonic
# POST /repos/{owner}/{repo}/releases/{release_id}/assets
rb: { kind: raw, media: "application/octet-stream", binary: true }

# POST /markdown/raw, text in either media type
rb: { kind: raw, media: "text/plain", alternatives: [ { kind: raw, media: "text/x-markdown" } ] }

# A file and a caption
rb: { kind: multipart, media: "multipart/form-data", fields: [
  { name: caption }
  { name: image, binary: true, media: "image/png" }
] }

# An address and the topics it subscribes to
rb: { kind: form, media: "application/x-www-form-urlencoded", fields: [
  { name: email }
  { name: topics, list: true }
] }

# JSON, sent as before, with XML accepted too
rb: { kind: json, media: "application/json", alternatives: [ { kind: raw, media: "application/xml" } ] }
```

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

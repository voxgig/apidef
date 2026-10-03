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
| `servers` | `{ url, variables? }[]` | from `spec.servers`, normalised as `info.servers` describes |
| `auth` | `false` | present only when the spec declares no security |
| `security` | `{ scheme, type, in, name, prefix }` | the credential the client sends, with `alternatives` and `exchange` when they apply |

### `info.servers`

Each entry is the spec's own server, with two normalisations; a spec that
names no server takes one as [the configuration reference](./configuration.md)
describes.

A URL with no scheme is prefixed `https://`, as `api.artic.edu/api/v1` is,
unless it is a path such as `/v1` or begins with a server variable. A
variable followed by nothing, or by a path, query or fragment, stands for
the origin, and one followed by `://` for the scheme, so its value carries
the scheme: `{baseUrl}/v1` stays as written, and the caller passes
`https://api.example.com`. A variable that is only part of the host, as in
`{region}.example.com`, keeps the prefix.

A variable written in Postman's double braces becomes the OpenAPI variable:
`http://{{base_url}}` is `http://{base_url}`, since OpenAPI reads only the
inner pair as the variable and would keep the outer braces in the URL.
Each rewritten name that the server's `variables` does not declare is added
with an empty `default`, so the generated SDK asks its caller for the
value, and one that stands for the origin is described as the origin with
its scheme. A warning names the URL before and after.

Only a name of letters, digits and underscores inside exactly two braces is
rewritten. Any other run of braces, such as `{{{base_url}}}`, `{{base_url}`
or `{{base-url}}`, stays as written, and so does a variable already in
single braces. Each case is a row in `ts/test/servers.tsv`.

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

`t` comes from the property's `type`. OpenAPI 3.0 ignores the siblings of a
`$ref`, so a definition describes a referenced value by wrapping the `$ref` in
an `allOf` beside a member that holds only the description. An `allOf` whose
members are one scalar schema and any number of members holding only
`description`, `title`, `example`, `nullable` or `deprecated` is read as that
scalar. A scalar schema has the type `string`, `integer`, `number` or
`boolean`, alone or listed with `null`, and composes nothing. The field reads
the schema of the scalar with the describing members laid over it, and the
property's own keys over those. So it takes the `type` and `format` of the
scalar, and prefers a description from the property or a describing member
to the one the scalar carries. A `$ref` to a string with `format: oid`,
described that way, gives a `` `$STRING` `` field with `fo: oid`. Any other
`allOf`, such as one of objects, has no `type` of its own, so its field is
`` `$ANY` `` unless the name says what it holds, such as an id, a count, or a
flag. `ts/test/allof-field.tsv` pins each case.

A JSON request body that is an array has no properties, so the point that
sends it declares one field for it: the field its `t.req` sends the array
from. The field is `` `$ARRAY` `` and never required, because every field is
also part of the record, and no record holds the list. Its `sh` is the
request body's description, else the array schema's. A point that is an
action declares none, as an action's body never describes the record.

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
| `s` | `PathSegment[]` | resolved path: `{ var }` for an element that is one placeholder, naming one of `g.params`, and `{ lit }` for any other element, where a placeholder beside other text takes its argument's `n` (`{thread_id}.json`); renames are already applied |
| `r` | `{ param, query, header, cookie }` | argument renames, keyed by original name |
| `g` | `{ params, query, header, cookie }` | argument lists using `%point-args` |
| `q` | `{ exist: string[], $action? }` | how a call selects this point: its path parameters and required arguments, the field a JSON array body is sent from, and its action |
| `t` | `{ req, res }` | request/response envelope handling (defaults `` `reqdata` `` / `` `body` ``, and `` `reqdata.<field>` `` for a JSON array body) |
| `rb` | `ModelBody?` | the request body's media type and encoding, present only when the body is not JSON alone |
| `rs` | `ModelBody?` | the media types a success response declares, present only when one declares a body |
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

A parameter declared with no `in` names no location. One whose name is a
placeholder of the path, written exactly as the placeholder spells it, is that
path parameter: it is required, and it takes the name its placeholder takes in
`s`. Any other is a `query` argument. Either way a warning names the
parameter, so the definition can be corrected.

### `ModelBody`

`rb`, the request body, and `rs`, the success response, share one shape. A
point carries `rb` when its operation declares a request body that is not
JSON alone. When the body would be sent as `application/json` and every other
media type the operation accepts is JSON too, the point carries none, and its
body is sent as JSON. A point carries `rs` whenever a success response
declares a body, JSON alone included, so a point without `rs` declares no
response body at all.

| field | type | meaning |
|-------|------|---------|
| `kind` | `string` | how the body is encoded: `json`, `raw`, `multipart`, or `form` |
| `media` | `string` | the media type of the body: the request's `content-type`, or the type to ask a response for |
| `binary` | `boolean?` | `true` when a `raw` body is bytes rather than text |
| `fields` | `ModelBodyField[]?` | the fields of a `multipart` or `form` body, in code point order of `name` |
| `alternatives` | `ModelBody[]?` | the operation's other media types, in preference order; on `rb` and `rs` only |

Each `ModelBodyField` names one field of the body:

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

A success response is a `2XX` one; `default` and the other statuses do not
count. An OpenAPI 3 operation's response media types are the keys of every
success response's `content`. A Swagger 2 operation's are its own
`produces`, else the document's, else `application/json`, when a success
response has a `schema`, the first such response by status giving it. A
response's `encoding` is ignored, as OpenAPI applies it to request bodies
only.

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
absent or constrains nothing, is `format: binary` or Swagger's `type: file`,
or has a `contentMediaType`, and also when its media type is not text. The
text media types are `text/*`, `application/xml`, and every `+xml` type. A
field is binary when its schema, or for a list its items' schema, is
`format: binary` or `type: file`, or has a `contentMediaType`, and is not
encoded text.

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
the media type to send, and `response.media` the one to ask for. A declared media type, a range such as `multipart/*`
included, is chosen with its own schema.
An undeclared one is classified from the media type alone, so an undeclared
raw type is binary, and an operation that declares no body gains one.
An entry corrects its own operation alone, even where two operations share a
path and method. A `PATCH` promoted to `update` is corrected by its `patch`
entry.

Each rule is a row in
[`ts/test/request-body.tsv`](../../ts/test/request-body.tsv),
[`ts/test/response-body.tsv`](../../ts/test/response-body.tsv) or
[`ts/test/body-guide.tsv`](../../ts/test/body-guide.tsv). One point of
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

# GET /pet/findByStatus answers JSON first, and XML beside it
rs: { kind: json, media: "application/json", alternatives: [ { kind: raw, media: "application/xml" } ] }

# GET /octocat answers no JSON at all
rs: { kind: raw, media: "application/octocat-stream", binary: true }
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

# Reference: the guide model

The guide is the output of the classification stage (`result.guide`, also
written as `base-guide.aontu`). It records *which paths belong to which
entity* and *how each method was classified*, with a `why_*` trace for every
decision. Types live in [`ts/src/types.ts`](../../ts/src/types.ts) (`Guide`,
`GuideEntity`, `GuidePath`, `GuidePathOp`, …).

## Shape

```
guide
├─ entity { <name>: GuideEntity }
├─ metrics GuideMetrics
└─ control {}
```

### `GuideEntity`

| field | type | meaning |
|-------|------|---------|
| `name` | `string` | canonical entity name (singular) |
| `orig` | `string` | original source name/component it derived from |
| `path` | `{ [pathStr]: GuidePath }` | the source paths assigned to this entity |

### `GuidePath`

| field | type | meaning |
|-------|------|---------|
| `why_path` | `string[]` | trace of why this path joined this entity |
| `action` | `{ [name]: {} }` | present when the path is an entity *action* |
| `rename.param` | `{ [orig]: target }` | parameter renames (e.g. `moon_id` → `id`) |
| `op` | `{ [opname]: GuidePathOp }` | operations this path/method produces |

### `GuidePathOp`

| field | type | meaning |
|-------|------|---------|
| `method` | `string` | HTTP method (`GET`, `POST`, …) |
| `why_op` | `string[]` | trace of the CRUD classification |
| `transform.res` | `string` | response envelope unwrap (e.g. `` `body.planet` ``) when the response wraps the entity |
| `transform.req` | `object` | request envelope wrap when the body wraps the entity |
| `body.media` | `string` | the media type the request body is sent as; the base guide never writes it, so it is yours to set (see the model's `rb`) |
| `response.media` | `string` | the media type to ask a success response for; likewise yours to set (see the model's `rs`) |

### `GuideMetrics`

`metrics.count` totals `entity`, `path`, `method`, `tag`, `cmp`, and
`origcmprefs`; `metrics.found` records the components (`cmp`) and tags (`tag`)
encountered. These power sanity checks (e.g. the `PATH MISMATCH` guard that
confirms every source method was classified).

### Component reference counts

`metrics.count.origcmprefs` maps each component schema, by its canonical
name, to the number of times a reference to it is used in the resolved
spec, and `metrics.count.cmp` is the number of names it holds. A reference
is a `$ref`, and its label is the pointer it holds
(`#/components/schemas/Pet`). Only labels under `/components/schemas/` or
`/definitions/` count here, and labels that share a canonical name add
together. The count is `countRefs` in
[`ts/src/refcount.ts`](../../ts/src/refcount.ts):

- The resolved spec is the spec with every `$ref` replaced by the schema it
  names. A reference counts once per use in it: once where it is written,
  and once more for each use of a reference whose schema holds it, at any
  depth.
- A `$ref` chain resolves to its first label. A use of a schema that is
  only a `$ref` to another counts for that first label alone, and each
  later link in the chain counts only where it is written.
- A reference cycle is cut where a depth-first walk from the root of the
  spec, taking references in the code-point order of their labels, meets a
  reference to a schema it is still expanding.
- A count stops at 1,000,000,000, and so does a sum of counts that share a
  name.

A schema's method rate is its count divided by `metrics.count.method`, the
number of operations across all paths, and its path rate is its count
divided by `metrics.count.path`, the number of paths. A schema is
infrequent when its method rate is below 0.21 or its path rate is below
0.41: either comparison is enough, and both are strict. The guide reads the
rates twice:

- An operation's candidate schemas come from its `200` and `201`
  responses, each either the response schema or its array items, or for
  an envelope the record it carries (see [Response
  envelopes](#response-envelopes)). A read (`GET`, `QUERY`, `HEAD` or
  `OPTIONS`) with neither takes its `202` schema as the candidate when
  another operation answers with the same record in a `200` or `201`, both
  read through their envelopes. The rows of
  [`ts/test/naming-schemas.tsv`](../../ts/test/naming-schemas.tsv) pin it in
  both builds. When there are two, a frequent one drops out unless a literal segment of
  the operation's own path names it.
- When the schema chosen for an operation has a name that differs from the
  entity name the path gives, and does not begin with it, the schema names
  the entity if it is infrequent and the operation's route does not take
  its own name from it (see [Shared schemas](#shared-schemas)), or if its
  name is a literal segment of some path in the spec. Otherwise the path's
  name wins.

Neither reading reaches a parameter rename. The trailing parameter of an
item path is renamed to `id` from the path alone, whatever schema the
operation answers with; the `guide-trailing-key` case in
[`ts/test/apidef.test.ts`](../../ts/test/apidef.test.ts) pins it.

The rows of [`ts/test/ref-count.tsv`](../../ts/test/ref-count.tsv) pin the
counts in both builds. In the `alias-chain` row, the paths `/a`, `/b`, and
`/c` answer with `A`, `B`, and `C`, where `A` is a `$ref` to `B` and `B` a
`$ref` to `C`. The counts are 1, 2, and 2; replacing each link in turn with
the schema it names would give 1, 3, and 5.

### Parameter renames

`rename.param` maps a path parameter's name in the specification to its name
in the model. The guide decides each path's renames from where the parameter
sits in the path, then gives each parameter of an entity one name across the
entity's paths:

- A parameter that keys the entity itself, such as the trailing parameter
  under the entity's own segment, is renamed to `id`.
- A parameter that keys a parent may be renamed after the parent's segment,
  as `<parent>_id`. A parameter whose own name, in snake case, is `name` or
  ends in `_name`, such as `project_name` or `projectName`, is never renamed
  this way.
- A parameter at the same place in several paths of one entity, with the same
  segments before it, takes one name in all of them when they disagree: its
  own name, in snake case. When one of those paths renames it to `id`, each
  path keeps the name it gave. A path also keeps its name for the parameter
  where the agreed name is another parameter's name on that path.
- Placeholders spelt differently at that place, such as `{slug}` and
  `{project_id}`, are different parameters and keep their own names. One
  route can take a slug where another takes a numeric identifier, so one name
  for both would send the wrong value to one of them.
- A placeholder that shares its path element with other text, such as
  `{threadId}` in `{threadId}.json`, leaves the element a literal. It takes the
  name a rename gives it, or else its own name in snake case (`thread_id`),
  and the model spells it with that name inside the literal, where an SDK
  fills it.

`isNameParam` and `entityParamNames` in
[`ts/src/guide/heuristic01.ts`](../../ts/src/guide/heuristic01.ts) are the
last two rules. The rows of [`ts/test/name-param.tsv`](../../ts/test/name-param.tsv)
and [`ts/test/entity-param-names.tsv`](../../ts/test/entity-param-names.tsv)
pin them in both builds, and the `guide-param-names` tests in
[`ts/test/apidef.test.ts`](../../ts/test/apidef.test.ts) and
[`go/apidef_test.go`](../../go/apidef_test.go) pin the outcome for the whole
spec on [`ts/test/def/param-names-def.json`](../../ts/test/def/param-names-def.json).

### Response envelopes

An envelope is a component schema that wraps one record. When a `200` or
`201` response schema is an envelope, the component of the record it
carries is the operation's candidate schema in its place. For one
operation, `envelopeItemRef` in [`ts/src/utility.ts`](../../ts/src/utility.ts)
returns that component when all of these hold:

- The schema has exactly one structured property: an array of records when
  the operation is `list`, and a single record for any other operation.
- The schema declares no `id`.
- Beside a single record the schema holds nothing else. Beside an array it
  holds only paging properties, counts and the page's own metadata: the
  names in `ENVELOPE_PAGING_PROPS`, names that end in `count`, such as Lob's
  `scanned_count`, and the names in `PAGE_META_PROPS`, compared without case,
  `_`, or `-`.
- The record is an object schema (it has `properties` or `allOf`, or its
  type is `object`) with a component reference.

Whether a component is an envelope is decided once for the whole spec,
before any entity is named:

- An operation reads its result from its `200` response, from its `201`
  when it has no `200`, or from its `202` when it has neither, such as the
  job each of Mux's robots queues; `transform.res` unwraps that same
  response. It unwraps a component only there. An operation that only a
  `202` answers takes the entity's fields from that answer too, as a
  `200` would give them.
- A component is an envelope only when every operation that answers with it
  in a `200` or `201` response unwraps it. A `202` does not count: it says
  the service accepted the work, and its body may describe the work rather
  than the resource. It names an entity only for a read whose `202` record
  another operation answers with in a `200` or `201` (see
  [Component reference counts](#component-reference-counts)).
- A component is not an envelope when another envelope carries the same
  record. The exception is one page and one single-item envelope where a
  route answering with the item lies at or beneath a route answering with
  the page, with parameter names ignored. Those are one resource's list and
  its item, and both stay envelopes.

The rows of
[`ts/test/envelope-item-ref.tsv`](../../ts/test/envelope-item-ref.tsv) pin
`envelopeItemRef` in both builds, and the `guide-envelope` tests in
[`ts/test/apidef.test.ts`](../../ts/test/apidef.test.ts) and
[`go/apidef_test.go`](../../go/apidef_test.go) pin the decision for the
whole spec on [`ts/test/def/envelope-def.json`](../../ts/test/def/envelope-def.json).

A response schema composed with `allOf` declares no `properties` of its
own, so `transform.res` reads the properties of its members together, the
first declaration of a name winning. It unwraps such a schema only when the
first three of the preceding rules hold, because most composed schemas are
records, and the one nested object of a record is its data. A composed page
with no data of its own is the exception, and reads its one array of records
as a plain page does (see below). Lob's address list,
`allOf[list, { data: [address] }]`, reads `body.data`. The entity's fields
then come from the records the envelope holds. When those records are a
`oneOf` with no properties of their own, the fields come from the response
example, read through the same property. The rows of
[`ts/test/composed-envelope-prop.tsv`](../../ts/test/composed-envelope-prop.tsv)
and [`ts/test/merged-properties.tsv`](../../ts/test/merged-properties.tsv)
pin the rule in both builds, and the `guide-allof-envelope` tests pin it
for the whole spec on
[`ts/test/def/allof-envelope-def.json`](../../ts/test/def/allof-envelope-def.json).

A single-item operation unwraps its response's one nested object only when
nothing but status or paging properties sits beside it, such as `success`,
`status` or `request_id`. An `id`, or any other data, beside the object makes
the schema the record itself: Lob's link carries an `id`, a `title` and one
`metadata` object, and a load of it returns the link, not the metadata. A
list is not held to this rule, since its records are what a caller asks for.
The added rows of
[`ts/test/envelope-prop.tsv`](../../ts/test/envelope-prop.tsv) pin it in both
builds.

A structured property is one that can hold a record: an object, an array, a
reference, or a composition that could be one. A scalar is data however the
definition writes it. An `allOf` of one scalar and members that only describe
it reads as that scalar, as its field does (see
[`ModelField`](./model.md#modelfield)), and a `oneOf` or `anyOf` whose
branches are all scalars or `null` reads as a scalar too. So a record that
holds an `id` written as `allOf[$ref Id, { description }]` beside a `status`
loads as the record, and a page whose records sit beside such a value unwraps
them as it would beside a plain string. The same reading decides whether a
property named after the entity wraps a response or a request body.
`isEntityWrapperProp` in [`ts/src/utility.ts`](../../ts/src/utility.ts) is the
rule. The rows of
[`ts/test/entity-wrapper-prop.tsv`](../../ts/test/entity-wrapper-prop.tsv) and
[`ts/test/envelope-prop.tsv`](../../ts/test/envelope-prop.tsv) pin it in both
builds, and the `guide-composed-scalar` tests pin it for the whole spec on
[`ts/test/def/composed-scalar-def.json`](../../ts/test/def/composed-scalar-def.json).

A list reads past the page's own metadata. Beside an array of records, an
object named in `PAGE_META_PROPS` (`meta`, `metadata`, `pagination`,
`paging`, `page_info` or `links`) describes the page and is not a second
candidate, so `{ results, metadata }` reads `body.results`. A list under one
of those names is still records, and a list of strings is not records, so a
feed that holds a list of links beside its `_links` stays unread. Nor is a
list whose items are a `oneOf` of strings and nulls: a composition holds
records only when one of its branches is an object. The rows of
[`ts/test/envelope-prop.tsv`](../../ts/test/envelope-prop.tsv) pin it in both
builds.

A page that holds no data of its own reads its one array of records past
the other structured properties beside it. When every scalar beside the
records is a status, paging or count property, the list reads the one array
of records, past a list of scalars, such as Mux's `timeframe`, and past an
object, such as the `filter` Novu echoes beside its notifications, the
`filters` of a FastAPI page, Neon's branch `annotations` or Novu's `global`
preferences beside the workflows. A scalar of its own makes the response a
record that holds a list, such as a combined status whose `state` sits
beside its `statuses`, so the list reads it whole, as it reads a page with
more than one array of records. A page composed with `allOf` reads the same way, such as
Neon's branch list, `allOf[branches, annotations, pagination]`. The rows of
[`ts/test/envelope-prop.tsv`](../../ts/test/envelope-prop.tsv) and
[`ts/test/composed-envelope-prop.tsv`](../../ts/test/composed-envelope-prop.tsv)
and the `guide-page-side` tests pin it in both builds, on
[`ts/test/def/page-side-def.json`](../../ts/test/def/page-side-def.json).

A property named after the entity unwraps a response only when the response
is not the component the entity is named from. That component is the record
itself: a container group that holds the `container` it runs loads as the
group, and a commit that holds its git data under `commit` loads as the
commit. The component is compared after its wrapper suffix is cleaned away,
so a `UserResponse` that names the entity `user` is still a wrapper, and a
`user` beside its `warnings` is read by name. A response composed with `allOf`
is read by name through its parts, such as Neon's project create,
`allOf[project, operations, branch, …]`, which reads `body.project`, while an
entity's own composed component stays the record whatever its parts are
called. The `guide-composed-part` tests pin both, on
[`ts/test/def/composed-part-def.json`](../../ts/test/def/composed-part-def.json).
A request body wraps the record
under the entity's name only when that property is structured and is all the
body holds, so a create that sends a `name` beside a `container`, or a
`title` beside a `key`, sends its properties as they are. The `guide-envelope`
and `guide-wrapper-name` tests pin these in both builds.

### Shared schemas

A route is one path and one method. Its resource is the name the path's
shape gives it, the name the guide would give the entity with no schema at
all, except that a write whose path ends in a singular literal is a verb
and names no resource. `pathResource` in
[`ts/src/guide/heuristic01.ts`](../../ts/src/guide/heuristic01.ts) returns
it, and the rows of
[`ts/test/path-resource.tsv`](../../ts/test/path-resource.tsv) pin it in both
builds.

Before any entity is named, the guide collects, for each response schema,
the routes whose `200` or `201` response is that schema, or an array of it,
or an envelope that carries it (see [Response envelopes](#response-envelopes)).
`sharedRoutes` then decides which of those routes take their own path's
name:

- A schema that declares an `id` property, directly or through `allOf` at
  any depth, is a record, and no route takes its own name from it.
- A route is a view, and does not count, when a shorter path made of its
  leading segments names another resource that answers with the same
  schema: `/pages/builds/latest` beneath `/pages/builds`.
- Two routes whose paths end in a parameter are aliases when their paths
  agree up to the resource's segment, with every parameter compared as the
  same, and have the same parameter names. Their resources count as one
  resource, and neither takes its own name.
- The schema is shared when two or more resources remain. Each remaining
  route of a shared schema takes its own name, except where two of those
  routes would take one name for two different schemas, or for one
  operation through two paths with the same parameter names. No route
  takes that name.

The literal-segment rule still comes first: when the schema's name is a
literal segment of some path in the spec, the schema names the entity even
for a route that would take its own name.

The rows of [`ts/test/shared-routes.tsv`](../../ts/test/shared-routes.tsv)
pin `sharedRoutes` in both builds, one row for each clause, and the
`guide-sharing` tests in [`ts/test/apidef.test.ts`](../../ts/test/apidef.test.ts)
and [`go/apidef_test.go`](../../go/apidef_test.go) pin the decision for the
whole spec on [`ts/test/def/sharing-def.json`](../../ts/test/def/sharing-def.json).

### Collection paths

Once every method is classified, a collection path `/X` that sits on one
entity moves to the entity that owns a route beneath it, so the list and
create operations join the entity that loads the record. A version prefix
counts as part of `/X`, and a trailing slash is ignored. The owner is the
first of these:

- An item route, `/X/{id}` or a composite key such as `/X/{owner}/{repo}`,
  that answers with the same record as the collection. When the item route
  sits on more than one entity, as when a tag names its delete and the record
  names its read, the collection joins the read.
- The nearest item route, whatever record it answers with, since a list
  often holds a summary of the record its item returns. Among routes equally
  near, the entity whose name sorts first by code point wins.
- With no item route at all, a deeper route, such as the verb
  `/X/{id}/refresh` or the sub-collection `/X/{id}/accounts`, that answers
  with the same record. A token refresh that returns the token joins the
  token list, and the accounts of a plan, which are purchases, leave the plan
  list where it is.

One entity's share of a collection path stays where it is, though the path
has an owner, when it answers with a record of its own unlike the record
the owner's item route answers with. Both records are read from a `200` or
`201`, since a `202` may describe the queued work. Both declare an `id`,
directly or through `allOf` at any depth, and no more than half of the
share's properties are properties of the item's.
GitLab's runner registration, `{id, token, token_expires_at}`, stays apart
from a runner's details, while a create that answers with the item's fields
under another name joins, and so does a create that only queues a job.
`distinctShare` and `distinctRecord` in
[`ts/src/guide/heuristic01.ts`](../../ts/src/guide/heuristic01.ts) are the
comparison, and the rows of
[`ts/test/distinct-share.tsv`](../../ts/test/distinct-share.tsv) and
[`ts/test/distinct-record.tsv`](../../ts/test/distinct-record.tsv) pin them in
both builds.

An item route can take its collection's entity before the move. A method
on `/X/{id}` named only from its tag takes the entity of `/X` when all of
these hold:

- No method on `/X/{id}` answers with a body.
- The tag names another resource: some route whose path names that
  resource answers with a component that declares an `id`, directly or
  through `allOf` at any depth.
- The entity of `/X` is named after the record `/X` answers with, and that
  record's name is the one the last segment of `/X` gives.

GitHub's `/user/repository_invitations/{invitation_id}` answers `204` to
its accept and decline, and its `repos` tag names the repositories. The
item route joins `repository_invitation`, the entity of its list, rather
than the list joining `repo`.

A method named only from a tag that names no such resource takes the name
the last segment of `/X` gives instead, when the item routes the tag names
would share a selector. That holds when the tag gathers item routes that
answer with no body from two collections whose item routes take the same
parameters, or from two collections that both have a `GET` of their own.
The tag's name comes first when a route outside `/X` takes that name,
whether it sorts before the item route or after it. When a route outside
`/X` takes the tag's name as well, the item route takes the tag's name
followed by the lowest number from 2 that no such route takes. Names
compare in the form they are stored in. A name shorter than three
characters is padded, one that starts with a digit takes an `n` first, and
one longer than 67 characters is cut back to its leading words, each
numbered when another entity already has that form: `dtn` counts for `dt`,
`xy` counts for `xyn`, and `efn2` counts for `ef` once another entity has
`efn`. Where the cut drops the number after the tag's name, the item route
takes the first number that leaves the stored form as it was.
An item route that this rule names counts only once it is named, so of two
tags' item routes that it names from collections ending in the same
segment, the one later in path order takes its tag's name. A verb on such
an item route, as `/X/{id}/merge` is, counts as taking the segment's name.
With `/aaa/qq` named `qq`, `/well-known/qq/{id}` takes `well_known_qq` and
the later `/well-known/v2/qq/{id}` of the same tag takes `well_known_qq2`.
With `/aaa/rr` named `rr`, `/well-known/rr/{id}` takes `well_known_rr2`,
since the later `/zzz/well_known_rr/{id}` is named `well_known_rr`.
Apicurio Registry tags
`/well-known/agents/{groupId}/{artifactId}`,
`/well-known/mcp-tools/{groupId}/{artifactId}` and
`/well-known/schemas/{schemaType}/{version}` `WellKnown`, none of them
answers with a body, and the first two take the same parameters. They take
`well_known_agent`, since `/well-known/agent.json` names `agent`, then
`mcp_tool` and `schema`, and each search joins its item route's entity in
the move. Its `/ids/contentIds/{contentId}` and `/ids/globalIds/{globalId}`
take different parameters and have no `GET` on their collections, so they
stay on `artifact`, the entity their `Artifacts` tag names. The
`guide-well-known` tests in [`ts/test/apidef.test.ts`](../../ts/test/apidef.test.ts)
and [`go/apidef_test.go`](../../go/apidef_test.go) pin each of these cases on
[`ts/test/def/well-known-def.json`](../../ts/test/def/well-known-def.json).

The record a route answers with is the component of its response, of the
items of an array response, or of the record its envelope carries (see
[Response envelopes](#response-envelopes)). A component measured as a record
for naming stays one, so a team that holds only its members is still a team.
The operations on a collection path join one owner even when they sit on
different entities, chosen by the record of the first operation in the order
methods are considered, a read before a write, so a list and its create stay
together. The `guide-collection-owner`
tests in [`ts/test/apidef.test.ts`](../../ts/test/apidef.test.ts) and
[`go/apidef_test.go`](../../go/apidef_test.go) pin the order on
[`ts/test/def/collection-owner-def.json`](../../ts/test/def/collection-owner-def.json),
and the `guide-item-record` tests pin the two exceptions and the read
answered only by a `202` on
[`ts/test/def/item-record-def.json`](../../ts/test/def/item-record-def.json).

The move is part of the heuristic: it shapes the base guide and is not made
again on the unified guide, so a path that `guide.aontu` assigns to an
entity stays on that entity. An entity the move leaves with no path is
removed from the base guide, and the entity count drops with it: it names
nothing `guide.aontu` could switch back on, so there is no classification to
emit with `active: false`.

To keep a collection apart from its items, declare its path on the entity
it belongs to, and switch the path off where the move put it:

```jsonic
guide: entity: key: path: "/keys": op: {
  create: method: "POST"
  list: method: "GET"
}
guide: entity: setting: path: "/keys": active: false
```

The `guide-collection-merge` tests in
[`ts/test/apidef.test.ts`](../../ts/test/apidef.test.ts) and
[`go/apidef_test.go`](../../go/apidef_test.go) pin the move on
[`ts/test/def/collection-merge-def.json`](../../ts/test/def/collection-merge-def.json),
and the `guide-collection-merge-overlay` tests pin this correction.

## Example

For the solar example, the `moon` entity classifies like this (abridged):

```jsonic
entity: moon: {
  name: moon
  path: {
    "/api/planet/{planet_id}/moon": {
      op: {
        create: { method: POST }
        list:   { method: GET }
      }
    }
    "/api/planet/{planet_id}/moon/{moon_id}": {
      rename: { param: { moon_id: id } }   # the item id is canonicalized
      op: {
        load:   { method: GET }
        update: { method: PUT }
        remove: { method: DELETE }
      }
    }
  }
}
```

…and `planet` additionally shows **actions**:

```jsonic
"/api/planet/{planet_id}/terraform": {
  action: { terraform: {} }        # an action on planet, not an entity
  rename: { param: { planet_id: id } }
  op: { create: { method: POST } }
}
```

## Correcting the guide

`base-guide.aontu` is the heuristic's output, and apidef overwrites it on
every run. Corrections go in the project's own `guide.aontu`, the entry file
that includes the base guide: anything written below the includes unifies over
the heuristic's defaults, and survives regeneration. Never edit the base guide
itself; the next run replaces it, and the file's own header says so.

The base guide writes every default as an aontu default (`*GET`, `*"id"`),
so your concrete value wins. The shapes you can correct:

```jsonic
@"@voxgig/apidef/model/guide.aontu"
@"./base-guide.aontu"

# Switch off an entity the heuristic invented.
guide: entity: pull_request_merge_result: active: false

# Fold a verb onto its entity as an action, selected at call time with
# `$action`, and address it by the same key as the entity's item path.
guide: entity: pull: path: "/repos/{owner}/{repo}/pulls/{pull_number}/merge": {
  action: merge: {}
  rename: param: pull_number: id
  op: update: method: PUT
}

# Send an upload's body as bytes the API accepts, where the definition
# declares only `text/plain`.
guide: entity: upload: path: "/spaces/{space_id}/uploads": op: create: body: media: "application/octet-stream"

# Ask for the image an operation answers with, rather than the JSON beside it.
guide: entity: avatar: path: "/avatars/{avatar_id}": op: load: response: media: "image/png"
```

### Covering a subset of a large API

**An SDK covers every entity of its API unless there is a specific reason
not to.** Full coverage is the default and the expectation; a narrowed SDK
is the exception, and one that needs stating rather than assuming. A
reduced SDK reports as covering an API it covers a fraction of, and the
fraction is invisible from the outside.

When narrowing is genuinely wanted, **narrow the guide, not the spec.**
Point apidef at the real upstream definition and switch entities off, so
the model still knows what the API contains and the next person can see
exactly what was left out and turn it back on.

`active` is declared `active?: boolean` — OPTIONAL, with no default — and
the base guide writes it only for an entity the heuristic switches off. An
entity whose every operation is an access-token exchange (a `POST` that clears
the spec's `security` and answers with a token) gets the default
`active: *false`, under a comment naming the reason. Every other entity leaves
the slot empty, and that is what lets a project put a DEFAULT there and invert
the rule from a denylist into an allowlist:

```jsonic
@"@voxgig/apidef/model/guide.aontu"
@"./base-guide.aontu"

# Default every entity off, then name the ones this SDK covers.
guide: entity: &: active: *false
guide: entity: card: active: true
guide: entity: payment: active: true
```

**The `*` decides whether this works.** `active: *false` is a default, so a concrete
`active: true` on one entity overrides it. Written as a bare `active:
false` it is a CONCRETE value, and aontu refuses to unify two concrete
values — the build fails with `pref_rank_clash` at
`$.guide.entity.active` rather than giving you an allowlist. The same
applies to a default written in the wildcard at the same rank as another
default: rank one of them with `**` to say which layer is weaker.

Hand-authoring a reduced copy of the spec does the same job and loses the
record of what was dropped, so the model cannot tell a narrowed SDK from a
complete one.

An action needs a CRUD op beside it on the same path: the op names the slot
(`load`, `list`, `create`, `update`, `remove`, `patch`) and the action names
the point within it. An `op` key outside those six is dropped with a warning
rather than resolved.

A custom method, a path whose last element ends in `:<verb>` such as
`/schedules:count` or `/schedules/{scheduleId}:cancel`, reads as its verb
written as a trailing element: the heuristic emits `action: count: {}` and
renames `scheduleId` to `id` exactly as it does for `/schedules/count` and
`/schedules/{scheduleId}/cancel`. The point keeps the path as written, so the
request still goes to `/schedules:count`. See
[How path classification works](../explanation/classification-heuristics.md)
for what the heuristic does on its own.

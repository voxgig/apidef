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
  envelopes](#response-envelopes)). When there are two, a frequent one
  drops out unless a literal segment of the operation's own path names it.
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
  holds only paging properties, the names in `ENVELOPE_PAGING_PROPS`
  compared without case, `_`, or `-`.
- The record is an object schema (it has `properties` or `allOf`, or its
  type is `object`) with a component reference.

Whether a component is an envelope is decided once for the whole spec,
before any entity is named:

- An operation reads its result from its `200` response, or from its `201`
  when it has no `200`; `transform.res` unwraps that same response. It
  unwraps a component only there.
- A component is an envelope only when every operation that answers with it
  in a `200` or `201` response unwraps it.
- A component is not an envelope when another envelope carries the same
  record.

The rows of
[`ts/test/envelope-item-ref.tsv`](../../ts/test/envelope-item-ref.tsv) pin
`envelopeItemRef` in both builds, and the `guide-envelope` tests in
[`ts/test/apidef.test.ts`](../../ts/test/apidef.test.ts) and
[`go/apidef_test.go`](../../go/apidef_test.go) pin the decision for the
whole spec on [`ts/test/def/envelope-def.json`](../../ts/test/def/envelope-def.json).

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

- A schema that declares an `id` property, directly or through `allOf`, is a
  record, and no route takes its own name from it.
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
entity moves to the entity holding the shallowest item path `/X/{id}`, so
the list and create operations join the entity that loads the record. The
move is part of the heuristic: it shapes the base guide and is not made
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
rather than resolved. See
[How path classification works](../explanation/classification-heuristics.md)
for what the heuristic does on its own.

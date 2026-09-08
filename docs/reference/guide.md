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

`base-guide.aon` is the heuristic's output, and apidef rewrites it on every
run. Corrections go in the project's own `guide.aon`, the two-line file that
includes the base guide: anything written below the includes unifies over the
heuristic's defaults, and survives regeneration. Never edit the base guide
itself. An edit there lasts until the next run on a machine without your
merge baseline, which is any fresh clone.

The base guide writes every default as an aontu default (`*GET`, `*"id"`),
so your concrete value wins. The shapes you can correct:

```jsonic
@"@voxgig/apidef/model/guide.aon"
@"base-guide.aon"

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

An action needs a CRUD op beside it on the same path: the op names the slot
(`load`, `list`, `create`, `update`, `remove`, `patch`) and the action names
the point within it. An `op` key outside those six is dropped with a warning
rather than resolved. See
[How path classification works](../explanation/classification-heuristics.md)
for what the heuristic does on its own.

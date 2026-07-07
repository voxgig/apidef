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

## Editing the guide

`base-guide.aontu` is meant to be edited when a heuristic guesses wrong, and
it is **merged** (not overwritten) on the next run. This is the intended escape
hatch for non-conventional APIs — see
[How path classification works](../explanation/classification-heuristics.md).

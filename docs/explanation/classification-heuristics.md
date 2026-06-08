# How path classification works

The hardest thing apidef does is turn a flat list of URL paths into a set of
**entities** with **CRUD operations**. OpenAPI does not record this structure —
it only has paths and methods — so apidef *infers* it. That inference is the
**guide** stage, and the default strategy is called `heuristic01`.

This page explains the ideas. For the exact output shape see
[The guide model](../reference/guide.md); for the resulting API model see
[The internal API model](../reference/model.md).

## Paths are split into parts

A path like `/api/planet/{planet_id}/moon/{moon_id}` becomes the parts

```
[ api, planet, {planet_id}, moon, {moon_id} ]
```

Segments wrapped in `{…}` are **parameters**; the rest are **literals**.
Reading the parts left to right, the guide recognizes the familiar REST
shapes: a *collection* segment (`planet`) optionally followed by an *item*
selector (`{planet_id}`), optionally nested (`moon`, `{moon_id}`).

## Naming an entity

The entity name is taken from the last collection literal, then normalized so
that wildly different spellings collapse onto one canonical identifier:

- **canonicalize** — strip casing/punctuation noise to a stable slug
  (`PlanetItems`, `planet-items`, `planet_items` → `planet_item`).
- **depluralize** — collection paths are plural, entities are singular, so
  `planets` → `planet`, `moons` → `moon`. English pluralization is irregular,
  so a curated table handles the exceptions (see
  [Customize entity naming](../how-to/customize-entity-naming.md)).

Nested collections become nested entities with an **ancestor** relationship:
`moon` records that it lives under `planet`.

## Classifying methods into operations

Within an entity, each HTTP method on each path maps to a CRUD operation,
keyed on whether the path targets a *collection* or a single *item*:

| path shape | method | operation |
|------------|--------|-----------|
| collection `/planet` | `GET` | `list` |
| collection `/planet` | `POST` | `create` |
| item `/planet/{id}` | `GET` | `load` |
| item `/planet/{id}` | `PUT` | `update` |
| item `/planet/{id}` | `PATCH` | `patch` (promoted to `update` if there is no `PUT`) |
| item `/planet/{id}` | `DELETE` | `remove` |

A single operation can have **several points** — one per path/method that
produces it — which is why the model keeps `op.<name>.points[]` rather than a
single path (see [the internal model](./the-internal-model.md)).

## Actions: the non-CRUD leftovers

A trailing literal after an item selector is not another entity — it is an
**action** on the entity. In `/api/planet/{planet_id}/terraform`, `terraform`
is an action on `planet`, not an entity called "terraform". Actions surface in
the model as points with a `select.$action` marker, so downstream tooling can
generate a method like `planet.terraform(...)` rather than inventing a bogus
entity.

## Parameter renames

A path parameter named after its entity — `{planet_id}` on the `planet`
entity — is the entity's identifier. The guide renames it to the canonical
`id` and records the mapping under `rename.param`, so the generated SDK
exposes a uniform `id` while the original wire name is preserved for building
the request URL.

## Every decision is traceable

Heuristics are, by nature, guesses — so the guide never throws a decision away
silently. Each classification carries a `why_*` array (`why_path`, `why_op`,
`why_action`, `why_rename`) describing the rule that fired. These traces are
emitted into the human-editable `base-guide.jsonic`, which means a person (or
an agent) can **read why apidef decided something and override it** rather
than fighting an opaque black box.

## When the guess is wrong

The heuristics are tuned for conventional REST APIs. For specs that break the
conventions:

- a mis-singularized name → add a [custom plural](../how-to/customize-entity-naming.md);
- a mis-classified path → edit the generated `base-guide.jsonic` (it is meant
  to be edited and is merged, not overwritten, on the next run);
- a structural surprise → apidef records a **warning** (see
  [Debug a build](../how-to/debug-a-build.md)) rather than failing the whole
  build.

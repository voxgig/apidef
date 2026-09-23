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

These string parts belong to the GUIDE step alone — the classifier's own
working view of the path. They are not what the MODEL carries: a point's
path is emitted as a typed `segments` vector with the braces already
resolved away, because the model carries resolved structure rather than a
template for every consumer to parse again.
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
- **guard the first character** — no target language accepts an identifier
  that starts with a digit, so a name that does gets an `n` in front, cased
  to match what follows: `3ds_session` becomes `n3ds_session`, `3DSecure`
  becomes `N3DSecure`. Field names are exempt, because they have to keep
  matching the keys the server sends.

Nested collections become nested entities with an **ancestor** relationship:
`moon` records that it lives under `planet`.

## When a schema names the entity

A response that refers to a component schema offers a second name, and the
two can disagree. The schema might be the entity itself, or it might be a
shape many entities share, such as an error body. The guide decides by how
often the schema is used. A schema whose name is the path's name, or begins
with it, agrees with the path, and the path's name stands.

A response schema that is an envelope is judged by what it carries, never
by its own name. An envelope wraps the record in its one structured
property: for a list operation, an array of records beside paging fields,
like `{ items: [Observation], page, pageSize, total }`; for a single-item
operation, a lone property like `{ data: Item }`. The guide unwraps the
envelope and applies the rule below to the record's schema, with that
schema's count and that schema's name. It finds the envelope with the test
the field transform uses to unwrap a response, so an entity takes its name
from the record its fields come from. Two further conditions keep a record
with one nested object from passing for an envelope: an envelope declares
no `id`, and a single-item envelope holds nothing beside the item. A
response that spells its envelope inline offers no component name, so the
rule leaves it alone.

Each reference to a component schema counts once per use in the resolved
spec, the spec with every `$ref` replaced by the schema it names. A schema
reached through a shared response counts once for the response's own
definition and once more for every operation that uses it, and so does
every reference inside that schema. An alias, a schema that is only a
`$ref` to another, resolves to the end of its chain under its own name: a
use of it counts for the alias alone, and each later link counts only where
it is written. The guide divides the count by the number of methods and by
the number of paths, and a schema rare on either measure names the entity.
The path measure is usually the stricter: it decides unless a spec averages
about two methods per path or more. A schema used more often yields to the
name the path gives, unless the schema's own name is a literal segment of
some path in the spec. The guide
reference states the rule, with its thresholds, under [Component reference
counts](../reference/guide.md#component-reference-counts).

A recursive schema would make its own count infinite, so the count follows
each reference until it returns to a schema already being expanded, and
stops there. Where a cycle could close at more than one reference, the
references are visited in a fixed order, which makes the cut the same in
the TypeScript and Go builds. A count also has a ceiling: a large spec can
multiply its uses past any number a build holds exactly, and no rate needs
a count anywhere near it.

The taxonomy spec shows both rules. Its domain and kingdom collections
answer with one `PaginatedTaxa` page, through a shared response, and its
observation collection, which has no other operation, answers with a
`PaginatedObservations` page. The guide unwraps each page. `Taxon`,
counted per use across every response that carries it, is frequent, so
each list joins the entity its path names, however often the page itself
is used. `Observation` is rare, and its name agrees with the path, so the
collection becomes `observation` rather than `paginated_observation`. The
`envelope-item-ref` and `ref-count` rows of the shared fixtures pin the
envelope test and the counts, and the `guide-envelope` and
`guide-shared-wrapper` tests pin those outcomes on smaller specs of the
same shape.

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

A verb that answers with a schema of its own is still a verb. GitHub's
`PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge` returns a
`pull-request-merge-result`, and naming an entity after it would leave
`merge` unreachable from `pull`. The heuristic keeps the verb on the parent
when six things hold: the method writes, the response component occurs
nowhere else in the spec, the literal is singular, that literal is not the
name of the component's own member shape, the item selector
(`.../pulls/{pull_number}`) is a path of the spec, and nothing extends the
verb's path. A `GET` on such a path is a sub-resource read, and a literal
with paths beneath it is a collection, so both keep the component rule. The
verb joins the entity a read of the item returns, however the two paths
spell the key.

Plurality decides first, and on its own. A verb reads as one instruction —
`merge`, `revoke`, `resend_confirmation` — where a plural literal names a
collection whatever it answers with. Contentful's
`POST /spaces/{sid}/environments/{eid}/asset_keys` answers with an
`Assets keys` component and GitLab's `.../merge_requests/{iid}/approvals`
with an `ApprovalState`; neither component is the literal's member shape,
so only the plural keeps these create-only collections entities of their
own.

An action borrows an op slot rather than owning one: `PUT .../merge` sits in
`update`. When every point in `update` is an action, a `PATCH` on the item
path is promoted to `update` and the action points ride along, so a plain
`update()` reaches the real update and `$action` selects the verb.

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
emitted into `base-guide.aontu`, which means a person (or an agent) can **read
why apidef decided something and override it** in `guide.aontu` rather than
fighting an opaque black box.

## When the guess is wrong

The heuristics are tuned for conventional REST APIs. For specs that break the
conventions:

- a mis-singularized name → add a [custom plural](../how-to/customize-entity-naming.md);
- a mis-classified path → override it in `guide.aontu` (the generated
  `base-guide.aontu` is rewritten on every run) — see
  [Correcting the guide](../reference/guide.md#correcting-the-guide);
- a structural surprise → apidef records a **warning** (see
  [Debug a build](../how-to/debug-a-build.md)) rather than failing the whole
  build.

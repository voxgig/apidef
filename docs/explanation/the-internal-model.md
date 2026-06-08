# The internal model, and why it exists

apidef's output is not "cleaned-up OpenAPI". It is a different data structure
designed around one question: *what does a client SDK need to know?* This page
explains the shape and the reasoning. For the exhaustive field list see
[The internal API model](../reference/model.md).

The model lives at `apimodel.main.kit` and has three top-level collections:
`info`, `entity`, and `flow`.

## Entities, not paths

An SDK author thinks in terms of *resources* — `pet`, `planet`, `order` — each
with methods. OpenAPI thinks in terms of *paths* — `/pets`, `/pets/{id}` — which
scatter one resource across several entries. The model inverts this: the
**entity** is the primary unit, and the paths that produced it are folded
inside.

```
entity.pet
  ├─ fields[]      the data shape (from the schemas)
  ├─ op{}          load / list / create / update / remove / patch
  ├─ id            which field identifies an instance
  └─ relations     ancestor entities (nesting)
```

This is the structure an SDK mirrors directly: `client.pet.list()`,
`client.pet.load(id)`.

## Operations have *points*, not a path

A single logical operation can be reachable through more than one path. In the
solar example, `planet.create` is produced both by `POST /api/planet` and by
the action paths `POST /api/planet/{id}/terraform`. So an operation is not "a
path + method"; it is:

```
op.create
  └─ points[]            each is one concrete path/method that yields create
       ├─ orig, parts    the source path
       ├─ method         GET/POST/…
       ├─ args           parameters to send
       ├─ select         how to identify the target instance
       └─ transform      request/response envelope handling
```

Keeping `points[]` plural is what lets the model represent actions, alternate
routes, and collection-vs-item variants without losing information.

## Args capture the call signature

Each point's `args.params[]` lists what the caller must supply — typically the
ancestor and item identifiers pulled from the path. Each arg records both its
canonical `name` (e.g. `id`) and its `orig` wire name (e.g. `planet_id`), plus
whether it is required (`reqd`) and its inferred `type`. That dual naming is
why the SDK can present a clean `id` argument while still constructing the
correct URL.

## Select describes *which* instance

`select` answers "which records does this point address?". `select.exist`
lists the identifiers that must already exist (the ancestor chain and the
item id); `select.$action` marks an action point. Downstream this becomes the
SDK's routing and pre-condition logic.

## Fields carry types and per-op overrides

Fields are extracted from response/request schemas, with types normalized to
validator tokens (`` `$STRING` ``, `` `$NUMBER` ``, `` `$BOOLEAN` ``…) rather
than raw OpenAPI types, so downstream validation is uniform. A field's
`req`-uiredness can differ per operation (required on `create`, optional on
`update`); when it does, the difference is recorded under the field's `op`
map rather than flattened away.

## Flows are executable expectations

Beyond the static shape, apidef emits **flows**: ordered sequences of
operations that exercise an entity — create → list (expect present) → update →
load (expect the update) → remove → list (expect absent). A flow is a
machine-readable integration test of the generated SDK:

```
flow.BasicPlanetFlow
  └─ step[]
       ├─ op            create / list / update / load / remove
       ├─ input/data    what to send
       ├─ match         which instance
       └─ valid         what to assert afterwards
```

This is why apidef is more than a schema converter: it captures not just the
*shape* of an API but a baseline of its expected *behavior*, which `sdkgen`
can turn into both an SDK and its test suite.

## Why a separate `jsonic` representation?

After the in-memory model is built, the builders render it to `jsonic` files.
That on-disk form is the contract with downstream tooling and, crucially, is
**editable and merge-preserving**: regenerating after a spec change merges
into your edits rather than clobbering them. The in-memory object is the
compiler's working state; the `jsonic` files are the durable artifact.

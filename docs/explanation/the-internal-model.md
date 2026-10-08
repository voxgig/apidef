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
       ├─ o              the source path, as written in the spec
       ├─ s              that path RESOLVED: { lit } / { var }, no braces to parse
       ├─ m              GET/POST/…
       ├─ g              parameters to send
       ├─ q              how to identify the target instance
       ├─ t              request/response envelope handling
       ├─ rb             how the request body is sent, when not as JSON
       ├─ bf             the properties a JSON request body declares
       └─ rs             the media types a success response declares
```

Keeping `points[]` plural is what lets the model represent actions, alternate
routes, and collection-vs-item variants without losing information.

## Args capture the call signature

Each point's `g.params[]` lists what the caller must supply — typically the
ancestor and item identifiers pulled from the path. Each arg records both its
canonical `n` (e.g. `id`) and its `or` wire name (e.g. `planet_id`), plus
whether it is required (`r`) and its inferred `t`. That dual naming is
why the SDK can present a clean `id` argument while still constructing the
correct URL. A placeholder that shares its path element with other text, as
`{threadId}` does in `{threadId}.json`, stays in that element's `{ lit }`,
spelled with its argument's `n` (`{thread_id}.json`), the name the SDK fills
it by.

## Select describes *which* instance

`q` answers "which records does this point address?". `q.exist`
lists the path parameters and required arguments a call must carry for the
point to be chosen (typically the ancestor chain and the item id). An
optional argument never counts, since a caller who omits it could not reach
the point. `q.$action` marks an action point. Downstream this becomes the
SDK's routing and pre-condition logic: the first point whose selector a
call meets is chosen, so when points of one operation share a selector,
only the first can be reached, and apidef records a warning naming them.

## A body that is not JSON says how it is sent

A generated SDK sends a request body as JSON unless the model says
otherwise, and `rb` is how it says so: a raw upload of bytes, text in a
named media type, or a form, multipart or URL-encoded, whose fields it lists.
An operation that accepts nothing but JSON records nothing, so its model is
unchanged, and a generator that does not read `rb` sends what it always
sent.

An operation can accept several media types, and an SDK sends one by
default, so the model chooses. JSON wins whenever it is offered, because
that keeps every existing SDK's behaviour; past JSON, a multipart body comes
before a URL-encoded form, since it can carry a file as well as the fields,
and a form before a raw body, which carries one value. The other media
types stay beside the choice as alternatives, for a generator that lets a
caller pick. Like any inference, the choice can be wrong, and `body.media`
in `guide.aontu` names another media type, or one the definition left out.
The rules themselves are in the [model reference](../reference/model.md#modelbody).

A success response is recorded the other way round. `rs` is present whenever
a `2XX` response declares a body, JSON alone included, because a client asks
for what it accepts, and the two cases a generator has to tell apart are an
operation that answers JSON, whose client can ask for JSON, and one that
declares nothing, whose client should not ask for anything. Asking every
server for JSON would turn a call that works today into a refusal wherever an
operation answers only an image or a page. The same ranking puts JSON first
when it is offered, and `response.media` in `guide.aontu` names another type.

## Fields carry types and per-op overrides

Fields are extracted from response/request schemas, with types normalized to
validator tokens (`` `$STRING` ``, `` `$NUMBER` ``, `` `$BOOLEAN` ``…) rather
than raw OpenAPI types, so downstream validation is uniform. A field's
`req`-uiredness can differ per operation (required on `create`, optional on
`update`); when it does, the difference is recorded under the field's `op`
map rather than flattened away.

One field stands for every property of its name, whichever operation's
request or response declares it, so the fields alone cannot tell a request
property from one only a response carries, such as a read-only `version`.
Each point that sends a JSON body says which names that body holds in `bf`,
and a generator that keeps a header or query argument in the body as well
can keep only the names the body declares. A body that declares no
properties is `false`, and a point that declares no body, or sends one that
is not JSON, has no `bf`. The rules are in the
[model reference](../reference/model.md#request-body-fields).

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

This is why apidef is more than a schema converter: it captures the *shape*
of an API and a baseline of its expected *behavior*, and `sdkgen` turns the
two into an SDK and its test suite.

## Why a separate `jsonic` representation?

After the in-memory model is built, the builders render it to `jsonic` files.
That on-disk form is the contract with downstream tooling. Every run
regenerates it and overwrites the previous files, so a correction belongs in
the guide entry file, `<prefix>guide.aontu`, which apidef reads and never
rewrites. The in-memory object is the compiler's working state; the `jsonic`
files are the durable artifact.

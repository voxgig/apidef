# The resolved definition as a declared capability

apidef parses a specification, resolves its `$ref` pointers, normalises its
path keys and merges its operation facts. Until now that work reached the rest
of the toolchain only as `point.contract.json` — a per-operation copy of the
resolved facts, serialised into the model.

## Why a capability rather than a copy

The copy dominates the model. Measured across the voxgig-sdk fleet, contracts
are the large majority of every `sdk.json`, and for one HubSpot product group
the model without contracts is two orders of magnitude smaller. The same facts
are then written again into the generated test data, and a third time into
`live.test.ts` where live scenarios are active.

The work is not the problem; the copy is. apidef already holds the resolved
definition on its context, and a model build runs apidef's action and sdkgen's
action in one process, with one shared build context. A consumer can therefore
be handed the resolved view instead of a serialised copy of it.

## What is published

`publishResolved` puts a `ResolvedSpec` on `ctx.state.apidef.resolved`:

- `kind` — `OpenAPI` or `GraphQL`. A GraphQL schema has no resolved OpenAPI
  document, and a consumer that assumes one gets `undefined` rather than a
  misleading empty object.
- `def` — the parsed definition, **not the bytes on disk**. A specification
  that writes `/projects/:slug` Express-style is normalised to
  `/projects/{slug}` during parse. A consumer that read `.sdk/def/<file>`
  itself would fail every lookup against such a specification, and Stytch's
  Management API is written that way throughout.
- `operation(method, path)` — the resolved facts for one operation, keyed the
  way the model keys it: `point.method` and `point.orig`.

`resolvedSpec(carrier)` reads it back, accepting the build context directly or
anything carrying one, so a consumer need not know how it was threaded.

## Why `operationFacts` is shared

`operationFacts` is the single definition of what a resolved operation is.
`contractTransform` calls it to build a contract; a consumer calls it to get
the same facts without one. Both must agree, and sharing the function is the
only way to guarantee that.

It exists because a resolved operation is not simply what the specification
file says at that path:

- **Parameters merge two levels.** An OpenAPI path item may declare parameters
  shared by every operation under it; the operation adds its own. A consumer
  reading only the operation would miss the shared ones.
- **Security defaults from the document**, and `securitySource` records
  whether it came from the operation, the document, or neither. The model
  carries one resolved `kit.info.security`, which cannot express an operation
  that needs no authentication — and Vercel has such operations.
- **Two names for one fact.** swagger2 writes `securityDefinitions`; OpenAPI 3
  writes `components.securitySchemes`.
- **`consumes` and `produces`** fall back to the document.

A consumer that re-derived these from the raw file would duplicate this logic
in another repository, and the two would drift.

## What the capability does not carry

`invocation` — the query document apidef builds for a GraphQL operation — is a
property of the point, not of the specification, so `contractTransform` adds it
after calling `operationFacts`. Guide overrides are applied by the transform
for the same reason: they are the project's edits, not the vendor's document.

## Context lifetime

`@voxgig/model` creates one build context and mutates `ctx.step` from `pre` to
`post`, so the object apidef is handed in the pre step is the one sdkgen is
handed in the post step. `ctx.state` is where a producer already keeps
cross-step state, so it is where this goes.

`publishResolved` tolerates a missing context: apidef is also driven directly
by tests and by apidef-validate, where there is no model build and nothing to
publish to.

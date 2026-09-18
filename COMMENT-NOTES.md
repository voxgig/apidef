# Implementation rationale

Entity action request bodies describe arguments, and their response bodies describe results. Neither automatically describes the entity record. Field inference must distinguish these from an entity's own component schema; otherwise generated entity types acquire action-only fields.

The TypeScript and Go implementations share ordering and classification semantics. Stable iteration and case-preserving name normalization are part of parity, not cosmetic formatting. The agent guide and architecture decisions describe the canonical implementation and correction surface.

Sources: [field inference](ts/src/transform/field.ts), [Go field inference](go/transform_field.go), [normalization](ts/src/utility.ts).

The guide can override inferred composite identity with explicit `id.parts`, or disable inference with `id.composite: false`. An empty parts list is not a reliable opt-out because model resolution can omit it. Edit canonical schemas under `model/` and synchronize the packaging mirrors.

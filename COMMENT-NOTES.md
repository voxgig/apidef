# Implementation rationale

Entity action request bodies describe arguments, and their response bodies describe results. Neither automatically describes the entity record. Field inference must distinguish these from an entity's own component schema; otherwise generated entity types acquire action-only fields.

The TypeScript and Go implementations share ordering and classification semantics. Stable iteration and case-preserving name normalization are part of parity, not cosmetic formatting. The agent guide and architecture decisions describe the canonical implementation and correction surface.

Sources: [field inference](ts/src/transform/field.ts), [Go field inference](go/transform_field.go), [normalization](ts/src/utility.ts).

Reference resolution in the TypeScript parser replaces each `$ref` site with a copy of its target and then walks the copy. A site met again inside its own copy, as when a schema is its own direct item, receives that copy rather than a new one: the cycle closes, and the decycle pass cuts it. Without the guard the walk copies the target forever whenever the paths precede the components. The Go parser resolves a site in place, so the site itself is already visited and needs no guard.

Sources: [parse](ts/src/parse.ts), [Go parse](go/parse.go).

The guide can override inferred composite identity with explicit `id.parts`, or disable inference with `id.composite: false`. An empty parts list is not a reliable opt-out because model resolution can omit it. Edit canonical schemas under `model/` and synchronize the packaging mirrors.

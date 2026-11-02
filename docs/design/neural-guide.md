# A neural guide strategy

A proposal, with a first implementation, for classifying the paths of an
OpenAPI definition with a small feed-forward network whose weights are
written by hand rather than learned. The strategy is `neural01`, selected
with the `strategy` option, beside the default `heuristic01`.

## Verdict on feasibility

Feasible as a re-expression, not as a discovery. The classification the
guide makes is a sequence of decisions over a few dozen binary facts about
a route, and any Boolean function of binary inputs is one hidden layer of
rectified units away from a linear read-out. A network whose hidden units
are written as named gates, `AND(write, singular_literal, item_route_exists)`,
reproduces the staged rules of `heuristic01` for every per-route decision:
which source names the entity, which operation a method is, whether a
trailing literal is a verb, and what each path parameter is called.

Three things are not feasible this way, and the design is built around them.

- **Relational rules stay code.** Whether two routes would share a selector,
  whether a rare schema is shared by two resources, which entity a read of
  the item route resolved to, and whether a collection joins its item route
  are facts about the definition as a whole. A per-route network cannot see
  them. They are computed once, deterministically, and handed to the network
  as features, or applied after it as the same post-passes `heuristic01`
  runs (collection merge, folded-name merge, entity-wide parameter names,
  version actions, auth-exchange deactivation).
- **Names are derived, not generated.** A network with hand-set weights
  cannot emit `container_group_instance`. It chooses a *source* for the
  name, and the string is still read from the definition and routed through
  `canonize()`, so ADR-001 holds by construction.
- **Hand-coded weights encode what the author already knows.** The network
  cannot be better than the rules it was written from, and it is harder to
  audit than the same rules as `if` statements. The gains are elsewhere:
  every decision is a score with a visible margin, every candidate is
  considered rather than cut off by the first matching branch, the traces
  record which evidence fired and how strongly, and the weights are the one
  thing a later training run could refine without changing the pipeline.

`heuristic01` carries about three thousand lines of case law, much of it
relational: tag-collected item routes, claims, numbered stored forms. The
network reproduces the common shapes and the verb-on-parent, component,
tag, and fallback namings; the long tail is recorded below as known
divergences, and is where the deterministic design is simply better than a
gate per case.

## What the guide decides

For every method of every path, the heuristic settles, in order:

| Decision | Signals | Output |
|---|---|---|
| component | success response `$ref`s, envelope unwrapping, reference frequency, tag | the schema the route answers with, or a tag |
| name source | path shape, component agreement with the path, frequency, sharing, method, body, verb-on-parent evidence | which text the entity name is read from |
| operation | method, path ends in a parameter, response is an array or carries one | `list`, `load`, `create`, `update`, `patch`, `remove`, `head`, `options` |
| actions | the trailing literal and the literals before it against the entity name | a verb on the entity |
| renames | each parameter's place, id-likeness, parent literal, entity name | `id`, `<parent>_id`, snake case, or kept |
| transforms | the envelope helpers shared with the field transform | `transform.res`, `transform.req` |

Then, over the whole guide: the collection joins its item route, folded
names merge, entity-wide parameter names are settled, versioned routes
become actions, and an entity whose every operation is an access-token
exchange is emitted inactive.

## Architecture

```
def  ──►  features(route)  ──►  nameNet  ──►  entity name
                │                                 │
                ├──────────────►  opNet  ─────────┤
                │                                 ▼
                ├──────────►  actionNet(entity)  ──►  action
                │                                 │
                └──────────►  paramNet(entity, param)  ──►  rename
                                                  │
                                          decoder + post-passes  ──►  Guide
```

Four small networks, applied in that order so a later one can read the
decision of an earlier one as a feature, the way the heuristic's later
passes read `MethodEntity`. Each is a two-layer perceptron: a hidden layer
of rectified linear units, a linear read-out, and a softmax over the
classes. The decision is the argmax; the probabilities go into the trace.

### Features

The feature functions in `ts/src/guide/neural01.ts` (`opFeatures`,
`probableFeatures`, `nameFeatures`, `paramFeatures`) turn one route into
named vectors of values that are nearly all `0` or `1`: the method,
the matched path shape (`t/p/t/`, `t/p/`, `p/t/`, `t/`, `t/p/p`, none),
what the last and second-last elements are, what the success response is
(none, a `204`, an array, an object carrying an array, a component), how
that component relates to the path's own name (equal, prefixed, qualifies
it, occurs as a literal elsewhere, infrequent, shared), whether a body is
sent, whether a tag names a component or appears in the path, and the
verb-on-parent evidence (singular literal, item route present, nothing
extends the route). The relational values are computed by the same code
the heuristic uses, imported from `heuristic01.ts` where it exports them
and reimplemented where it does not.

Parameter features are computed per placeholder: its position, whether a
literal precedes it, how that literal relates to the entity name, whether
the placeholder looks like an identifier or like a name.

### Hand-coded weights

`ts/src/guide/nn.ts` holds the arithmetic: `dense()` builds a layer from
weight rows written against feature *names*, `forward()` applies the
layers, `softmax()` and `argmax()` read the result. The rows themselves
are authored in `ts/build/nn-weights.js`, which writes them to the weights
file the strategy reads (see below). A hidden unit is a gate. With a
rectified linear activation:

| Gate | Weights | Bias |
|---|---|---|
| `AND(a, b, c)` | `a: 1, b: 1, c: 1` | `-2` |
| `OR(a, b)` | `a: 1, b: 1` | `0` |
| `a AND NOT b` | `a: 1, b: -1` | `0` |
| `NOT a` | `a: -1` | `1` |

The read-out layer sums gate activations into class logits with weights
chosen so the gate that encodes the heuristic's winning branch outranks the
rest, and so a candidate that is unavailable (no component, no tag) is
pushed below every available one. Nothing is sampled, nothing is random,
and the same input always yields the same output. The weights are plain
numbers in the source file so a reader can follow a decision from the
feature that fired to the logit it moved.

### Decoder

The network's name-source decision is turned into text by reading the
chosen source: the shape's literal, the cleaned component name, the tag's
canonical form, the owner of the item route, the operationId, the response
title, or the last literal. The decoder then applies the steps the
heuristic applies after naming and before building: `resplitFromCmp`,
`ensureMinEntityName`, the same-path join, record ownership, the response
and request transforms (shared helpers), and the merges.

### Traces

Every `why_path`, `why_op`, `why_action` and `why_rename` entry carries a
`nn:` record naming the chosen class with its probability and the hidden
units that contributed most to it, so `base-guide.aontu` still says what
decided each classification and `guide.aontu` remains the correction
surface (ADR-002).

### The weights file

The strategy never reads the authored tables. It reads
`nn/guide.safetensors`, through the `ts/nn/` mirror that ships in the npm
package, on the first build that selects it. The file is a safetensors
container: an 8-byte little-endian header length, a JSON header, then the
tensor bytes. Each network contributes four `F32` tensors named as a state
dict names them, so a trainer that builds the same two-layer module writes
the file with its own save call:

```
name.hidden.weight   [units, features]
name.hidden.bias     [units]
name.out.weight      [classes, units]
name.out.bias        [classes]
```

The names the arithmetic needs are in the header's metadata, as JSON
strings: `nets` lists the networks in order, and each network has
`<net>.features`, `<net>.hidden`, `<net>.classes` and `<net>.activation`.
`format` is `apidef-guide-nn/1`, and a loader refuses any other value.

`ts/src/guide/safetensors.ts` is the container codec (reads every dtype,
writes the fixed-width ones), and `loadNets` and `saveNets` in `nn.ts` map
between the container and the networks. `nn/` is canonical and is mirrored
into `ts/nn/` and `go/nn/` by `make sync-nn`, the way `model/` is mirrored;
`make nn` regenerates the file from the authored tables and syncs it, and
`make check-nn`, under `make all`, fails on a mirror that drifted or a
file the tables no longer produce. The TypeScript suite pins the same two
facts, so CI holds them on every platform.

Two rules hold once the weights are trained rather than written. Both
ports compute in float64, since JavaScript has nothing narrower, and both
sum a row in the same order, because floating-point addition is not
associative and a one-bit difference in a logit can flip a near tie. With
integer weights neither can bite, which is one more reason to keep the
hand-written tables integral.

The standalone executables under `ts/cmd/` bundle the script alone and
resolve their includes from the project they run in, so a build they run
cannot select `neural01` until the weights file is bundled beside them.

## Go parity

`neural01` is implemented in TypeScript only, as `graphql01` is. The arithmetic
is a page of loops, the weights are a file that `go/nn` already embeds, and
every feature reads a value the Go port already computes in `go/guide.go`,
so a port is mechanical. It
is a precondition for the strategy ever becoming the default, since the Go
build would otherwise produce a different model from the same definition.
Nothing in this change moves the default.

## Results

The comparison harness builds every OpenAPI definition under `ts/test/def/`
with both strategies and compares, route by route, the entity, the
operation, the actions, the renames, and the transforms:

| Definitions | Routes | Agree |
|---|---|---|
| 42 | 490 | 490 |

`ts/test/neural.test.ts` pins that agreement, the solar guide, and the
verb-on-parent spec, and checks that the traces name the deciding units.

The tag-collected item routes were the one family the first cut left out,
and they accounted for every disagreement (60 routes in `item-record` and
`well-known`). They are relational: a route is named from its collection's
record or last segment only once the names every other route would take
are known. The port keeps that bookkeeping as code (`measureClaims`, a dry
run of the name network over every route with the claims maps in place of
the resolved owners, then `itemSegmentName` and `keyHeld`), and the network
only gates it, through `coll_record` and `coll_segment`. That is the shape
the design predicts: the network decides, the decoder derives.

A read-out that sums gates is not an `if`/`else if` chain: two later gates
firing together can outscore an earlier one, as `cmp_primary` and
`cmp_in_path` once outscored `cmp_qualifies`, and the two `LAST` gates
once outscored `delete_cmp`. The rule is that a gate for a later branch
takes the earlier branch's deciding feature as a negative input, so the
branches stay exclusive and the weights need no ordering of their own;
`name-net-precedence` in the tests pins each pair, and the
`qualified-cmp` and `delete-cmp` definitions pin them against the
heuristic.

## Known divergences from `heuristic01`

None on the corpus. Outside it, the two can differ wherever a rule of the
heuristic has no feature here, and a difference is a bug in the feature
set or the weights, found by adding the definition to the corpus.

## Plan

1. `nn.ts`: layers, activations, named rows, forward pass, trace helper.
2. `neural01.ts`: feature extraction, the four weight tables, the decoder,
   the post-passes, the `Guide` builder.
3. Wire the strategy into `guide.ts` beside the other two.
4. Tests: the primitives; the solar guide equals the pinned guide under
   `neural01`; the verb, compound and trailing-key specs classify as under
   `heuristic01`; every definition in `ts/test/def/` builds a complete guide
   (the path-mismatch guard holds), with a per-definition agreement line
   printed for the two strategies.
5. Document the option value; rebuild `dist`; run the gates.

## Later

The weights are the training surface. A corpus of definitions with the
guides a person corrected in `guide.aontu` is a labelled set, and the
feature extractor is already the input encoder. Training would write
`nn/guide.safetensors` in place of the authored tables and keep everything
else, which is the reason to prefer named features, a dense read-out and a
standard weights container over a rule engine even while the weights are
set by hand. When that happens, the tables and the check that the file
matches them retire together.

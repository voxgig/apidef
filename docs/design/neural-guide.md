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

| Corpus | Definitions | Routes | Agree |
|---|---|---|---|
| `ts/test/def` | 53 | 550 | 550 |
| `apidef-validate` (GitHub, GitLab, Cloudsmith, Contentful and the rest) | 15 | 3,244 | 3,244 |

`ts/test/neural.test.ts` pins that agreement, the solar guide, and the
verb-on-parent spec, and checks that the traces name the deciding units.
The `apidef-validate` sweep runs whenever that checkout is found beside this
one or through `APIDEF_VALIDATE_DIR`, as the Go goldens are found, and is
skipped otherwise. `sdkgen-validate` validates the same fifteen definitions,
by name, so the row covers both.

### The manual corpus

`metsitaba/api-entity-corpus` pairs sixty apis.guru definitions (781 paths,
961 operations) with hand-made entity documents that put each operation on
an entity, with a role. Scored route by route, with names compared after
`canonize()` and a relaxed match that lets `contact` stand for
`student_contact`:

| Routes on an entity | Same entity, exact | Same entity, relaxed | Same role |
|---|---|---|---|
| 948 | 452 (48%) | 645 (68%) | 712 (75%) |

The analysts also model `virtual` entities, named from the content of
inline responses, and `protocol` structures, neither of which the guide
names from; the maintainer ruled that the score counts routes on
`resource`, `embedded` and `command` entities only. On those, 545 of 792
routes (69 percent) shared the analysts' name before the rulings below,
593 (75 percent, 446 exact) after the first four of them and 601 (76
percent, 448 exact) after all eight; that is the figure the suite's floor
guards.

Twelve definitions agree on every route. The net and the heuristic agree
with each other on all sixty (the sweep found one divergence, a placeholder
element counted as a literal, since fixed), so these are the heuristic's
scores as much as the net's, and the corpus is the first measure either has
had against a reading that is not its own. The guide also names more
entities than the analysts do (mean precision 0.53, recall 0.81 over
resource entities): the surplus is tags, verbs and wrappers that became
entities. The disagreements fall into families, and each is a feature the
network lacks:

- **Module and verb tags.** A route with no response component takes its
  tag's name, and tags such as `PDF`, `History`, `Publishing`, `Search`
  and `Retrieve` become entities where the analysts read the path noun
  (`Folder`, `Message`, `Location`). The largest family.
- **Generic response wrappers in small definitions.** `ResponseOk_NoneType_`
  names a delete, because a wrapper the suffix list does not know is
  infrequent in a definition of fourteen operations.
- **A short literal beside a component that names the key.** `/b/{bucket}`
  becomes `bnt`, the padded literal, though the component `Bucket` and the
  key parameter agree; the parameter's name is a signal nothing reads.
- **A placeholder file extension.** `/lists.{format}` becomes
  `listsformat`; the literal's `.{param}` tail is not stripped as `.json`
  is.
- **Commands and RPC paths.** `/#Action=AssumeRole` is named for its
  literal where the analysts name the request body; a convention apidef
  has no kind for, so a difference rather than a defect.
- **Projections of a parent.** `/teachers/{id}/grade_levels`, an array of
  strings, is a sub-entity here and a read of the teacher there; an array
  of scalars is a field, not a collection.
- **Virtual entities.** Inline responses the analysts name from their
  content (`AuthenticatorInventory`) are named here from the path or tag.

The suite scores the corpus when it is checked out beside this one or
`API_ENTITY_CORPUS_DIR` names it, over those three kinds, and holds a floor
of 65 percent on the relaxed match, so a change that loses ground fails and
one that gains it shows in the test's diagnostic line.

### Rulings

Each family was put to the maintainer with the routes that show it. The
rulings, each the rule to implement in both strategies, since the ruling
was that `heuristic01` changes too and the Go port follows it rule by rule:

1. **Tags.** The last collection literal names the entity whenever the
   path has one; a tag names only a route with no usable literal. In the
   implementation a tag that names a literal of the path is itself a path
   noun and keeps naming (the `things` tag on `/things/{id}/merge`, which
   is how verb routes reach their parent); a literal naming an identifier
   (`contentIds`) keys rather than names, so the tag stands; and a trailing
   verb literal, or the verb after a custom method's colon, names the noun
   before it and becomes an action.
2. **Wrappers.** A component whose name contains another component's
   name, or whose only structured property is a reference, is a wrapper
   and never names an entity: name from the wrapped component when there
   is one, else from the path.
3. **Key parameter.** When an item route's key parameter canonicalises to
   a component's name, that component names the entity over the literal.
4. **Placeholder extensions.** A literal ending in `.{param}` names as the
   part before the dot; the parameter stays an argument of the operation.
5. **Sub-reads.** A GET on `.../{id}/<singular literal>` whose response
   declares no id joins the parent as a load action; one whose response
   declares an id stays its own entity.
6. **Projections.** A nested route answering with an array of scalars
   joins the parent as a load action; only arrays of objects or references
   make a collection.
7. **Commands.** A POST with a body component and no collection noun in
   its path is named from the body component with its affixes stripped;
   the literal names only when there is no body component.
8. **POST reads.** A POST whose literal starts with a read verb (list,
   search, get, find, query) and whose response is a collection is the
   entity's list operation, with the body as the filter.

All eight are in: in `heuristic01`, in `neural01` and in `go/guide.go`,
where `pathNoun`, `tagNamesLiteral`, `keyParamOf`, `unwrapCmp`,
`WrapperOf`, `viewOnParent`, `responsePayload`, `commandName` and
`postRead` are the functions the TypeScript names. One fixture per ruling
in `ts/test/def/` pins the owner of every route under both strategies
(`ts/test/rulings.test.ts`) and under the Go port (`go/rulings_test.go`),
and `ts/test/wrapper-of.tsv` is the wrapper rule's shared contract.

For the first four the name network gained `cmp_names_key`,
`tag_name_avail`, `cmp_differs` and `cmp_foreign_tag`. For the last four
it gained `res_record`, `res_scalars`, `m_post`, `verbish`, `lit_last`,
`body_cmp_avail`, `item_beneath`, `same_path_record`, `post_read` and
`read_noun_avail`, with four gates: `view_singular` and `view_scalars`
(class `PARENT`, beside the verb gate), `command` (class `BODY`) and
`read_noun` (class `NOUN`). The command class scores above the sum of the
component gates, as the parent class does, since the heuristic applies the
rule after the component rules and overrides them; the two are exclusive
by their inputs. The operation network gained `view` and `post_read`, and
is decided a second time once the name has told a view and a POST read
apart, the first decision serving the envelope measurement as the
heuristic's pre-naming operation does.

The rulings took the manual corpus from 545 to 601 of 792 routes (448
exact, 614 with the same role), the first four to 593 and the last four
the rest: the listed POST read, the grade levels projection, the file
content view, the graphhopper and pdfbroker commands. The rulings as worded
leave some of the cited routes where they were: Clever's district status
declares an id, so it stays a sub-resource, and Google's bucket ACL
collections have item routes beneath them, so the literal names them
rather than the body.

The 191 routes still disagreeing after the eight were grouped into
families again and put to the maintainer, who ruled on each:

9. **Module affixes.** A literal whose last word is `api`, `controller`,
   `service`, `resource` or `endpoint`, with a remainder, names by the
   remainder: `ProductsApi` is `product`, `SubscriptionsApi/Enable` is
   `subscription` with the action `enable`. A literal that is only such a
   word keeps it.
10. **Prefix tags.** A tag keeps naming only when it names the literal the
    path itself would name, the collection or the noun before a verb. A
    tag naming a literal above that, `push` on
    `/push/deviceRegistrations/{device_id}` or `projects` on
    `/projects/{projectId}/hmacKeys`, is foreign and yields to the path
    noun: `device_registration`, `hmac_key`.
11. **Body media types.** The command rule reads the body schema under any
    media type and takes the first member of a `oneOf`; a `GET` on the same
    path as a command joins the command as its load. AWS STS's
    `/#Action=AssumeRole`, sent as XML, is `assume_role` for both methods;
    Ably's token request is `token`. Conjur's plain-text `authenticate`
    routes have no component and keep the literal.
12. **Path syntax.** A `{param}` fused to a literal is dropped from the name
    (`articles{mediaTypeExtension}` is `article`); a part that is only
    placeholders, or only an extension placeholder (`.{ext}`), is a
    parameter rather than a literal, and a route with no literal at all is
    named from its first parameter's noun (`pageName` gives `page`); a query
    string is cut from the path before anything reads it
    (`/templates?desc=html` is `template`).
13. **Record names.** When the item route under a collection answers with a
    component that declares an id and whose name is not the literal's, the
    component names both the item and the collection:
    `bucket_access_control` for `/b/{bucket}/acl`. A component name that
    contains the literal's words, `ExtendedRateplanEntry` around
    `rateplan`, is a wrapper of the literal, which keeps naming.
14. **Deeper views.** A `GET` whose path holds an item key, whose literals
    after that key are singular, and whose response declares no id joins
    the entity of the nearest item route above it as a load action named
    for the trailing literals (`sync_commerce_status`); with no item route
    above, the noun before the key names (`company`). An array of id-less
    objects still makes a collection.
15. **Embedded reads.** Plural reads under a key that answer id-less objects
    stay actions on the parent, as Wordnik's are; the wrapper rule learns
    the `<Noun>For<Parent>Response` affix, so
    `StudentContactsForStudentResponse` names `student_contact`.
16. **Roles.** Operations stay method-driven: a verb route keeps the CRUD
    slot its method gives, with the action selecting it. (The question
    described Surevoip's `GET /areacodes` as an unrecognised envelope; the
    route in fact declares no response schema at all, so no envelope rule
    reaches it.)

The guide stage costs the same under either strategy: within a few
milliseconds per definition on the test corpus, and within a tenth on a
synthetic definition of a thousand paths, where parsing takes thirty times
longer than either. The whole-definition scans are memoised, so the net is
a little quicker than the heuristic on GitHub's definition, the largest
real one, and the gap widens with size: on a synthetic definition of four
thousand paths the guide stage takes 7.1 s under the net and 11.6 s under
the heuristic, after a parse of 431 s. Both grow faster than the path
count, in the relational passes they share, so a large definition's time
is the parser's first and the guide's second.

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

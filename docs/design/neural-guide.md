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

| Definitions | Count | Routes | Agree |
|---|---|---|---|
| `ts/test/def` | 78 | 743 | 743 |
| `apidef-validate` (GitHub, GitLab, Cloudsmith, Contentful and the rest) | 15 | 3,244 | 3,244 |

`ts/test/neural.test.ts` pins that agreement, the solar guide, and the
verb-on-parent spec, and checks that the traces name the deciding units.
The `apidef-validate` sweep runs whenever that checkout is found beside this
one or through `APIDEF_VALIDATE_DIR`, as the Go goldens are found, and is
skipped otherwise. `sdkgen-validate` validates the same fifteen definitions,
by name, so the row covers both.

### Rulings

The maintainer ruled on families of classification questions, each put
with the routes that show it. Each ruling is a rule both strategies
implement, since `heuristic01` changes too, and the Go port follows it rule
by rule:

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
and `test/wrapper-of.tsv` is the wrapper rule's shared contract.

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

A second round of rulings:

9. **Module affixes.** A literal whose last word is `api`, `controller`,
   `service`, `resource` or `endpoint`, with a remainder, names by the
   remainder: `GadgetsApi` is `gadget`, `PlansApi/Enable` is `plan` with
   the action `enable`. A literal that is only such a word keeps it.
10. **Prefix tags.** A tag keeps naming only when it names the literal the
    path itself would name, the collection or the noun before a verb. A
    tag naming a literal above that, `alerts` on
    `/alerts/deviceSubscriptions/{device_id}` or `projects` on
    `/projects/{projectId}/signingKeys`, is foreign and yields to the path
    noun: `device_subscription`, `signing_key`.
11. **Body media types.** The command rule reads the body schema under any
    media type and takes the first member of a `oneOf`; a `GET` on the same
    path as a command joins the command as its load.
    `/#Action=StartSession`, sent as XML, is `start_session` for both
    methods, and `/keys/{keyName}/requestTicket` is `ticket`. Plain-text
    `authenticate` routes have no component and keep the literal.
12. **Path syntax.** A `{param}` fused to a literal is dropped from the name
    (`notes{fileExtension}` is `note`); a part that is only placeholders,
    or only an extension placeholder (`.{ext}`), is a parameter rather than
    a literal, and a route with no literal at all is named from its first
    parameter's noun (`sheetName` gives `sheet`); a query string is cut
    from the path before anything reads it (`/widgets?desc=html` is
    `widget`).
13. **Record names.** When the item route under a collection answers with a
    component that declares an id and whose name is not the literal's, the
    component names both the item and the collection:
    `shelf_access_control` for `/s/{shelf}/acl`. A component name that
    contains the literal's words, `ExtendedCroptypeEntry` around
    `croptype`, is a wrapper of the literal, which keeps naming.
14. **Deeper views.** A `GET` whose path holds an item key, whose literals
    after that key are singular, and whose response declares no id joins
    the entity of the nearest item route above it as a load action named
    for the trailing literals (`sync_billing_status`); with no item route
    above, the noun before the key names (`team`). An array of id-less
    objects still makes a collection.
15. **Embedded reads.** Plural reads under a key that answer id-less
    objects stay actions on the parent; the wrapper rule learns the
    `<Noun>For<Parent>Response` affix, so `OwnerPetsForOwnerResponse` names
    `owner_pet`.
16. **Roles.** Operations stay method-driven: a verb route keeps the CRUD
    slot its method gives, with the action selecting it.

A third round:

17. **Shared records.** A record that several collections' item routes
    answer names one entity, since the identity of a semantic entity is
    preserved, and the `$action` selector tells the paths apart: each
    collection whose literal is not the entity's name carries its literal
    as an action. `BookAccessControl` names `book_access_control` for both
    `defaultBookAcl` and `k/{book}/acl`.
18. **Verb results.** A trailing verb, or the verb after a custom method's
    colon, always names the noun before it and becomes its action; its
    response component shapes the action's result only.
    `croptypes/$count`, answering an `ItemCount`, is `croptype` with the
    action `count`.
19. **Verb phrases.** A literal whose first word is a verb word is a verb
    on the nearest resource up the path, named for the literals after that
    resource's key as the view rule names: `shelf` with the actions
    `lock_lending_policy` and `rbac_test_access`. The verb words gain
    `lock`, `test`, `inject` and `analyze`.
20. **Short literals.** A literal of fewer than three letters names
    nothing; the route is named as one with no literal would be, by its
    first parameter's noun, else its tag, else the padded literal as before.
    `/fr/{sheetName}{fileExtension}` is `sheet`.

A fourth round:

21. **Response media types.** A response schema is read under any media
    type, `application/json` first, then any other JSON type (`+json`,
    `text/json`), then `*/*`, and the range code `2XX` is a success:
    `GET /terms/{term}/meanings`, an array of `Meaning` under `*/*`, is
    named for what it answers.
22. **Namespace prefixes.** A leading run of words that more than half of
    a definition's components start with is a namespace and names nothing:
    among components most of which start with `AcmeApi`,
    `AcmeApiEncodeRequest` names `encode`.
23. **Word breaks.** A literal written as one word takes the word breaks of
    a tag, an operationId word or a component name with exactly its
    letters: `croptypes`, beside the tag `CropTypes`, is `crop_type`.
24. **Operation ids.** A command, a POST to a singular literal that is no
    collection, with no body or response component is named for the
    object of its operationId, the leading verb and a `Via`, `By` or
    `With` tail dropped: `getSessionKeyViaJwt` is `session_key`.
25. **Routes with no noun.** A route with no literal, only a short
    literal, only a verb word, or only a generic word (`history`, `list`,
    `results`) is named for the component it answers before its
    parameters, title or tag: `/{vendor}.json`, answering a map of
    `Plugin`, is `plugin`, and `/aq` is named for `aqIndexResult`.
26. **Written sub-paths.** A sub-path under an item key that is both read
    and written is a resource of its own, named for its component and
    never unwrapped (`preference`, `club_setting`); a write-only one whose
    body declares no id is an update action on the item (`parcel` with the
    action `address`).
27. **Records.** A record declares an id when it has an `id` field or the
    field the item route's key names (`homeRef` on `/homes/{homeRef}`),
    and a record inside a one-record envelope counts (`{data: Place}`); a
    literal after a collection that answers the collection's own record is
    a variant of its list (`place` with the action `by_circle`).
28. **Async results.** A POST answering 202 with no body creates what its
    results route reads: `POST /report/render`, read at
    `/report/renderResults/{resultId}`, is `render_operation_result`.
29. **Relationship links.** A `/relationships/<name>` route is an action
    on the resource before it:
    `/expenses/{expenseId}/relationships/tags` is `expense` with the
    action `tags`.
30. **Key nouns.** A singular literal followed by a key named for another
    noun is a view of that noun's item, its literals the action:
    `/tsp/answer/{jobId}` is `job` with the action `tsp_answer`.

A fifth ruling settled commands:

31. **Entities are minimised.** A command is an action on the entity it
    acts on, its request the action's parameters (the point's arguments and
    body fields), never an entity beside that entity. After classification,
    both strategies and the Go port fold an entity whose one route only
    writes, to a literal right beneath a route another entity holds, into
    that entity, with the literal, as written, for its action and the
    parameter names that entity's route gives. Plural literals fold too,
    so a create-only collection that nothing reads is a command as well
    (GitHub's `rerun-failed-jobs`, Contentful's `asset_keys`). A route
    another entity reads stays (GitHub's branch `protection`), commands on
    one route move together (Shortcut's `stories/bulk`), and a command
    beneath another follows it (GitLab's NuGet `symbolpackage`). A command
    with no route above it keeps an entity of its own. In `apidef-validate`
    the fold moves 44 routes in six definitions. Checking it turned up an
    older gap beside it: a literal after two keys took no action, so
    `/v3/notes/{bookId}/{id}/_pin` and `.../_mute` were two `create` points
    a call could not tell apart. Such a literal is now the action, in
    `heuristic01`, in a new gate of `neural01`'s action network
    (`act_l4_keys`) and in Go.

The maintainer declined one pattern, literal instances: a literal that
stands where sibling routes put a parameter, as `node-eu` beside routes
keyed by `{node}`, keeps its own name.

Rulings 9 to 16 are in, in both strategies and the Go port, with one
fixture each. Two refinements were needed where the rulings as worded
moved routes they did not mean to. The tag rule keeps a tag that names a
literal above the path's noun where the route is a leaf selector or a view
of that literal's resource (`/tiles/random`, `/member/{member_id}/fans`,
`/v1/BadgesApi/Active/{serial}`), since dropping every such tag lost more
routes than the prefix tags gained. The record rule at first named only
where one collection's item routes answered the record, since a record
several collections share, such as the taxonomy fixture's `Taxon` over
`domain` and `kingdom`, would otherwise merge them into one entity; ruling
17 later settled that merge as the intent, with `$action` telling the paths
apart. A version parameter is not an item key for the view rule, a custom
method on a key (`{id}:cancel`) names the collection before it, and `save`
joined the verb words.

The name network gained `param_avail`, `twin_cmd_avail`, `record_avail`,
`view_key`, `tail_singular` and `view_parent_avail`, with the gates `twin`,
`cmp_record` and `none_param`, and the view gates rewritten over any
depth. The two override classes, `TWIN` and `REC`, take the component
gates away by negative inputs rather than outscoring their sum. A record
that wraps the literal's words lets the literal name only after the
qualified-name rule has had its turn, and a record named for a literal of
the path and the naming literal, `CallRouteAllowedCaller` under
`/call_routes/{id}/allowed_callers`, is qualified rather than wrapped; the
`ForX` wrapper is also recognised once its response word is cleaned away.

Rulings 17 to 20 are in, in both strategies and the Go port, with one
fixture each (`shared-record`, `verb-result`, `verb-phrase` and
`short-literal`). Three refinements were needed. The verb rule precedes the
view rule, so a verb phrase keeps its own spelling (`rbac_test_grants`
rather than the view's singular `rbac_test_grant`); a plural collection of
its own between the key and the verb takes the verb (`croptype` with
`count`), where a singular sub-resource such as `rbac` does not; and the
short-literal fallback reads the key the route's shape gives first (`book`
for `/s/{shelf}/k`), then the sources a literal-less route has from its
parameters alone, since the preceding literal (`aaa` for `/aaa/aq`) is no
name. Two further changes came with them: a response component that holds
the literal's words, `CreateReportResponse` around `reports`, is a wrapper
too and the literal names; and an item route whose literal name the
collection's own record extends joins the collection under the record's
name (`catalog_bundle`), where the merge knew only the other direction
before. A trailing `s` after a digit is kept by the depluralizer, so
`node-k8s` names `node_k8s`.

The name network gained `verb_avail`, `verb_noun`, `short_lit`,
`key_noun_avail`, `view_avail` and `cmp_wraps`, with the gates `verb_item`
(class `VERB`, above every shaped class), `verb_noun_tpt` (class `VNOUN`)
and the five `short_*` gates, which lift the literal-less classes above the
shaped ones with `KEY` first and `TAG` last. The component and shape gates
take `verb_noun` as a negative input, the view gates `verb_avail`, and the
short gates `view_avail`, so a view of the item still precedes a short
literal as the heuristic orders them; the command, twin and read-noun
gates take `short_lit`, since the heuristic's short-literal branch returns
before those rules.

Rulings 21 to 30 are in, in both strategies and the Go port, with one
fixture each and an eleventh, `ruling-gaps`, for gaps in earlier rulings.
Refinements were needed where the rulings as worded moved routes they did
not mean to:

- A `*/*` response that declares binary content is not read: a file is no
  JSON record, and reading it let `FileContent` displace a tag.
- A namespace is a run at least two components share, holding no wrapper
  word, that no path literal holds and no component is named for exactly:
  a lone `UseCase`, the fixtures' `safe` and `thing`, and the `ResponseOk`
  wrapper family are not namespaces.
- The lone-verb and generic-word reading of ruling 25 applies to reads
  only, so `POST /deactivate` keeps its body's name and
  `POST /v1/GadgetsApi/List` stays a POST read.
- A singleton's read is a `load` of the whole component and its component
  is never an envelope; the envelope fixture's crew member path is now
  `crew_member`. A write-only sub-path is a `PUT` or `PATCH`; a `POST` keeps
  the command and verb rules, since operations stay method-driven.
- The record rule still reads a record through a list envelope first, then
  through the key field and the one-record envelope, and a route its record
  names ends in its collection's literal, so the action rules pass it by:
  `/regions/spots` had gained an action `spot`.
- Key nouns are reads with an identifier key (`Id`, `Key`, `Uuid`), since
  `/wiki/{sheetName}` names a sheet of the wiki, and the action on a
  key-noun route is named although its last part is a key.
- The tag fix holds a tag over a leaf with no key before it when the leaf
  is singular or the tag's literal is a verb word (`/search/notes` stays
  `search`, `/alerts/topics` is `topic`); beneath a key a singular sub-read
  answering an id of its own names itself unless it carries a property
  named for its literal (a journal's `digest` against its `following`).
- A body component name too short for a word names nothing, as a literal
  does: `MdRequestDto`, `md` once its affixes go, leaves its command named
  for the literal `mdconvert`.

The name network gained `link_avail`, `single_avail`, `subwrite_avail`,
`variant_avail`, `keynoun_avail`, `async_avail`, `ans_avail`, `view_fires`
and `nounless`, with the classes `LINK`, `SINGLE`, `SUBWRITE`, `VARIANT`,
`KEYNOUN`, `ASYNC` and `ANS`. `LINK` and `SINGLE` outrank every shaped
class and the parent classes, whose view gates take them as negative
inputs; the four classes after the views rank equally, since method and
shape make them exclusive; `ANS` sits below them and above the shaped
classes. The action network gained `view_act` and `rec_named`, and the
decoder reads a shared record's action from the record class deciding,
looked for through a collection or same-path override, not from the
record gate firing alone, which an earlier rule can outrank. The
operation-id command needed no feature: it is the command gate's name
source.

Merging main at 8.30.1 brought its own guide fixes in beside the rulings,
and where the two met, both were kept. One splitter, `guideParts`, now
cuts a query string and sets formats aside for every guide reading, and
the normalised paths the rulings compare are compared in that form. Main's
`actions` element only gathers the verb, so `/things/{id}/actions/archive`
is `archive` on `thing`, and a verb phrase keeps its own spelling under it,
so incident.io's `actions/add_tags` is `add_tags` where main had pinned
`add_tag`. A key noun stands down where the route answers a page its key
filters, so openSenseMap's `/boxes/{boxId}/data/{sensorId}` stays main's
filtered list of `data`, and `localSearch/.{ext}`, answering a page, is a
list. Main's fixtures that predate the rulings moved to the ruled names: a
menu answering no record is a view of its restaurant, a `constructor`
component names `constructor_item` through main's prototype guard, and the
incident.io fixture's wrapper, view and tag routes follow rulings 2, 5 and
1. The network gained `end_page` in the operation net, `parent_res` and
`filtered` in the parameter net, and a `COLLOWNER` class at 19.5 for main's
collection owner, whose route keeps the flags its shape decides. Both
strategies agree on every route, and Go matches TypeScript on every route
of the test definitions and `apidef-validate`.

Merging main at 8.31.0 changed field reading only. Merging 8.32.1 brought
three guide rules (a classifier or lookup key that filters a read-only path,
a list route that reads the object it ends in, and a page's metadata roles),
which `neural01` mirrors as they are, and two refinements where they met the
rulings: the view rule (ruling 5) stands down when the response holds a
record under the name the route ends in (`/users/{id}/user-role` answers
its `user_role`), and a key after a verb word that follows the entity's own
noun keys the entity (`/members/lookup/{member_id}` keys `member` by `id`),
the `verb_parent_ent` feature in the parameter net.

The guide stage costs the same under either strategy: within a few
milliseconds per definition on the test definitions, and within a tenth on
a synthetic definition of a thousand paths, where parsing takes thirty
times longer than either. The whole-definition scans are memoised, so the
net is a little quicker than the heuristic on GitHub's definition, the
largest real one, and the gap widens with size: on a synthetic definition
of four thousand paths the guide stage takes 7.1 s under the net and 11.6 s
under the heuristic, after a parse of 431 s. Both grow faster than the path
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

### Shared readings corrected

Twelve readings that both strategies share were wrong, and each is now fixed
in `heuristic01`, in `neural01` and in Go, with a definition under
`ts/test/def/` pinning it:

- **The strategies disagreed on a POST that reads beneath an item.**
  `heuristic01` set the post-read flag inside a naming branch that a verb
  route beneath an item never reached, so
  `POST /gadgets/{gadgetId}/getLinkedTags` stayed a `create` while
  `neural01` read it as a `list`. The flag is now read in the operation
  stage for every route (`postReadVerb`), as ruling 8 asks
  (`read-verb-item`).
- **Singular forms.** `cookies` read as `cooky` and `taxes` as `taxis`
  through the `axes` suffix; a singular noun ending in `s` lost it
  (`analysis` as `analysi`, `canvas` as `canva`). The irregular table gains
  the `-ie` nouns and the `tax` family, and `S_SINGULARS` with every `-sis`
  noun is kept whole (`test/depluralize.tsv`).
- **A record that holds lists read as a list.** Any array property made a
  `GET` a list, so `/me` answering an account with its email addresses was
  `list`. `listingProps` keeps a response that declares an identifier beside
  three or more values of its own, on a route its singular literal names, a
  record; the operation network's `res_array_prop` input reads the same
  helper (`record-array`).
- **Names that carry no entity.** `success`, `ok`, `default`, `response`,
  `result`, `empty`, `void` and identifier components named entities, as
  did version tags. `genericCmp` drops them from the component candidates
  and from the `DELETE` lookup in both strategies, the bare member of a
  family of results with them, and a version tag never holds a path
  (`generic-name`). `object` is among them only when its component
  declares no properties, as an untyped placeholder does; a storage API's
  `Object` record names `object` (`tag-key`).
- **A verb after three keys took no action.** `keyRunBefore` reads a run of
  three or more keys between the entity's literal and a trailing verb; the
  action network gains the `keys_run_ent` input and the `act_keys_run` gate
  (`keyed-verb-3`).
- **A fused placeholder stayed in an action's name**, as
  `walk_resetformat`, and a fused placeholder after a verb hid it.
  `verbActionName` drops the placeholder and `isVerb` reads the literal
  before it (`route-syntax`).
- **Route syntax reached names.** A fragment (`#keys`) is cut as a
  query string is, unless the route is all fragment, and `${id}` is read as
  `{id}` (`test/guide-parts.tsv`).
- **One path split across two entities** where one method answered no
  component. `componentReadOwner` joins such a method to the entity a read
  of its path takes from its component; the name network gains the
  `same_path_read` gate, which feeds `SAMEPATH` as the tag join does
  (`same-path-record`).
- **A verb word keyed by its own parameter** read as a verb:
  `/lines/{lineId}/stop/{stopId}` is a `stop` (`keyedBy` in `pathNoun`).
- **`TRACE` was dropped.** It is kept as `OPTIONS` is; the operation network
  gains the `m_trace` input, the `trace` unit and the `TRACE` class.
- **Missing verb words.** `autocomplete`, `bypass`, `contains`, `finish`,
  `reorder` and `shuffle` join the verb words, a verb word keeps its own
  spelling as an action (`contains`, `exists`), and a verb word is matched
  as spelt as well as in its canonical form (`verb-word`).
- **A tag held a route beneath another resource's key.** A tag naming an
  earlier literal held any leaf beneath a key as a view of its resource, so
  under `Teams` `/teams/{teamId}/players/{playerId}/activate` was a
  `create` of `team` with no action. `tagHolds` reads a view only beneath
  the tag literal's own key, so `activate` acts on `player` (`tag-key`).
  The `${id}` key, read correctly, exposed it.

## Known divergences from `heuristic01`

None on the test definitions or `apidef-validate`. Elsewhere the two can
differ wherever a rule of the heuristic has no feature here, and a
difference is a bug in the feature set or the weights, found by adding the
definition to `ts/test/def/`.

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

The weights are the training surface. A set of definitions with the
guides a person corrected in `guide.aontu` is a labelled set, and the
feature extractor is already the input encoder. Training would write
`nn/guide.safetensors` in place of the authored tables and keep everything
else, which is the reason to prefer named features, a dense read-out and a
standard weights container over a rule engine even while the weights are
set by hand. When that happens, the tables and the check that the file
matches them retire together.

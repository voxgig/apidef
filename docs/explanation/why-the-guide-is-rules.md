# Why the guide is a chain of rules

The guide stage turns paths into entities with a long chain of hand-written
rules, `heuristic01`. A chain like that invites doubt: each rule exists
because some definition needed it, and a learned model looks like the
natural replacement. apidef tried the nearest thing that could be built
without training data, a small neural network with weights written by hand,
as a second guide strategy beside the heuristic. It agreed with the heuristic
on every route it was measured against, and it was removed.

This page records what that experiment showed, and the shape of the
decisions it was built from, which is also the plainest description of what
the heuristic does. The rules themselves are in
[How path classification works](./classification-heuristics.md).

## What the guide decides

For every method of every path, the heuristic settles six things, in this
order:

| Decision | What it reads | What it produces |
|---|---|---|
| Component | the success response's `$ref`, any envelope around it, how often the schema is referenced, the tag | the schema the route answers with, or a tag |
| Name source | the path's shape, how the component's name relates to the path's literals, how widely the component is shared, the method, the request body, whether a verb follows a parent route | which text the entity name is read from |
| Operation | the method, whether the path ends in a parameter, whether the response is an array or carries one | `list`, `load`, `create`, `update`, `patch`, `remove`, `head` or `options` |
| Actions | the trailing literal and the literals before it, against the entity name | a verb on the entity |
| Renames | each parameter's place, whether it looks like an identifier, the literal before it, the entity name | `id`, `<parent>_id`, a snake-case name, or the name unchanged |
| Transforms | the envelope helpers the field transform also uses | `transform.res` and `transform.page` |

Then, over the whole guide, a collection joins its item route, folded names
merge, each entity's parameter names are settled across its routes, versioned
routes become actions, and an entity whose every operation is an access-token
exchange is emitted inactive. [The guide model](../reference/guide.md)
specifies what each decision writes.

Two properties of that table decide everything below. Almost every input is a
yes-or-no fact about one route. And the order is a precedence: a later
decision reads the earlier ones, as the action decision reads the entity
name.

## The network that was built

The strategy was called `neural01` and was chosen with the `strategy` option.
It turned each route into named facts that are nearly all `0` or `1`: the
method, the path's shape, what the success response is, how the component's
name relates to the path, whether a body is sent, whether a tag names a
component, and the evidence for a verb on a parent route. The heuristic's own
code computed the facts.

Seven small networks then took the decisions in the table's order. Each was a
hidden layer of rectified linear units and a linear read-out, and the largest
output was the decision. A hidden unit was written as a named gate:

| Gate | Weights | Bias |
|---|---|---|
| `AND(a, b, c)` | `a: 1, b: 1, c: 1` | `-2` |
| `OR(a, b)` | `a: 1, b: 1` | `0` |
| `a AND NOT b` | `a: 1, b: -1` | `0` |
| `NOT a` | `a: -1` | `1` |

The read-out weights made the gate for the heuristic's winning branch outrank
every other. The weights were kept in a `safetensors` file, laid out as a
trained two-layer module saves itself, so that a training run could one day
replace them without touching the pipeline.

## What it showed

**It agreed by construction.** On the test definitions and on the real-world
definitions apidef is validated against, some four thousand routes, the two
strategies gave the same entity, operation, actions, renames, and
transforms for every route. Any yes-or-no function of yes-or-no facts is one hidden
layer of gates away from a linear read-out, so a network written from the
rules reproduces them. It cannot be better than the rules it was written
from, and it is harder to read than the same rules as `if` statements.

**The relational rules stayed code.** Whether two routes would share a
selector, whether a rare schema is shared by two resources, which entity a
read of the item route resolved to, and whether a collection joins its item
route are facts about the definition as a whole. A network that looks at one
route at a time cannot see them. The heuristic's code computed them once and
handed them in as facts, or applied them afterwards in the passes the
heuristic runs anyway. Those rules hold most of the heuristic's case law, so
most of the heuristic stayed where it was.

**Names were chosen, not generated.** A network with hand-set weights cannot
spell `container_group_instance`. It chose a source for the name (the path
literal, the component, the tag), and the text was still read from the
definition and passed through `canonize()`. Entity names stayed singular with
no help from the weights.

**It cost a second copy of every rule.** The strategy came to about 2,900
lines of source beside the heuristic, and each new rule had to be written
twice: once in the heuristic, and again as facts, gates, and regenerated
weights. Bugs turned up that only the network's copy could reach. A Go port
of it would have been a fourth implementation of the guide, and one was
needed before the strategy could ever be the default.

**It was faster only at sizes no real definition reaches.** At 4,000
generated paths its guide stage took 7.1 seconds against the heuristic's
11.6. On real definitions, mostly under 500 paths, the two were milliseconds
apart.

## What training would change

The usual reason to prefer a network is that it can learn, and here that has
two limits. Its inputs are the heuristic's facts, so training could only
re-weight what the heuristic already computes, and the relational rules
cannot be learned one route at a time. A training set also has to agree with
how apidef should read a route. One labelled independently disagrees with
apidef wherever apidef reads a route its own way on purpose, and pulls the
network away from those readings. One made from the heuristic's output and
its corrections teaches the network to be the heuristic.

Corrected guides are the labelled set, if enough of them ever exist: a
`guide.aontu` that overrides the base guide records what a person decided a
route is. Trained weights would then bring a parity rule of their own. Both
ports would have to compute in 64-bit floating point and add a row's terms in
the same order, because floating-point addition is not associative and a
one-bit difference can flip a near tie. Hand-written integer weights never
meet that problem.

## What it left behind

**A margin on every decision.** Each network decision came with scores, so a
close call was visible. With hand-set weights the scores were not calibrated,
though, and a chain of rules can say just as cheaply which other readings
also applied.

**Differential testing.** Wherever the two strategies disagreed, one of them
was wrong, and several of those disagreements were defects in the heuristic:
a flag set in a branch that some routes never reached, for one. The Go port
gives the same check without a second strategy, since both ports read every
route of every test definition and a build fails when they differ. See
[The canonical TypeScript build and the Go parity port](./canonical-and-parity.md).

**This description.** The fact list and the gate table were the most compact
statement of the heuristic's decision structure there was, which is why the
table at the top of this page has the shape it has.

The strategy's code remains in the repository's history, on the
`neural-guide-strategy` branch. To see why a route was read the way it was,
switch on the traces with `why: { show: true }` and read `base-guide.aontu`;
to change the reading, override it in `guide.aontu`, as
[Correcting the guide](../reference/guide.md#correcting-the-guide) describes.

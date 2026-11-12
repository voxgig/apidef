# How path classification works

The hardest thing apidef does is turn a flat list of URL paths into a set of
**entities** with **CRUD operations**. OpenAPI does not record this structure —
it only has paths and methods — so apidef *infers* it. That inference is the
**guide** stage, and the default strategy is called `heuristic01`.

This page explains the ideas. For the exact output shape see
[The guide model](../reference/guide.md); for the resulting API model see
[The internal API model](../reference/model.md).

A second strategy, `neural01`, makes the same decisions another way. Each
classification of a route is a small network over named facts about the
route, such as its method, its path shape, and what its response carries,
with weights set by hand rather than learned, and the entity name is still
read from the definition and normalized as below. Select it with the
`strategy` option. It agrees with `heuristic01` on every one of the test
definitions, and its `why_*` traces name the network unit that decided
each classification, so a wrong default is corrected in `guide.aontu` the
same way. The weights are a safetensors file, `nn/guide.safetensors`, so
a trained set can replace the hand-set one without a change to the
pipeline.

## Paths are split into parts

A path like `/api/planet/{planet_id}/moon/{moon_id}` becomes the parts

```
[ api, planet, {planet_id}, moon, {moon_id} ]
```

Segments wrapped in `{…}` are **parameters**; the rest are **literals**.

A format a segment carries is set aside: a placeholder with an extension
(`{id}.json`, `{name}.{format}`) is read as the placeholder, a literal with
one (`repos.json`, `data.{format}`) as the literal, and a format alone
(`json`) is skipped. So `/repos/{slug}.json` is the item route of
`/repos.json`, and `/series/{code}/json` the item route of `/series`. The
model keeps each segment as written, so a request still goes to
`/repos/acme.json`.

These string parts belong to the GUIDE step alone — the classifier's own
working view of the path. They are not what the MODEL carries: a point's
path is emitted as a typed `segments` vector with the braces already
resolved away, because the model carries resolved structure rather than a
template for every consumer to parse again.
Reading the parts left to right, the guide recognizes the familiar REST
shapes: a *collection* segment (`planet`) optionally followed by an *item*
selector (`{planet_id}`), optionally nested (`moon`, `{moon_id}`).

A placeholder fused to a literal is not part of the name:
`/api/notes{fileExtension}` names `note`. A part that is only
placeholders, or an extension placeholder such as `/.{ext}`, is a
parameter rather than a literal, and so is a placeholder with an
extension, `{plugin}.json`. A route with no literal at all, answering no
component, is named for its first parameter's noun, so
`/{sheetName}{fileExtension}` is `sheet`. A query string in a path, as in
`/widgets?desc=html`, is cut away before anything reads the path, and so is
a fragment, as in `/labels/{labelId}#keys`, unless the route is nothing but
its fragment. A stray `$` before a placeholder is dropped, so
`/pets/${petId}` keys `pet` with `{petId}`.

## Naming an entity

The entity name is taken from the last collection literal, then normalized so
that wildly different spellings collapse onto one canonical identifier:

- **canonicalize** — strip casing/punctuation noise to a stable slug
  (`PlanetItems`, `planet-items`, `planet_items` → `planet_item`).
- **depluralize** — collection paths are plural, entities are singular, so
  `planets` → `planet`, `moons` → `moon`. English pluralization is irregular,
  so a curated table handles the exceptions (see
  [Customize entity naming](../how-to/customize-entity-naming.md)); a
  trailing `s` after a digit is part of a numeronym, so `k8s` stays `k8s`,
  and a singular noun that ends in `s` keeps it, as `analysis`, `canvas`
  and `news` do.
- **guard the first character** — no target language accepts an identifier
  that starts with a digit, so a name that does gets an `n` in front, cased
  to match what follows: `3ds_session` becomes `n3ds_session`, `3DSecure`
  becomes `N3DSecure`. Field names are exempt, because they have to keep
  matching the keys the server sends.
- **avoid a prototype name** — the model language cannot unify a spread with
  a key every object already owns, such as `constructor`, so such a name gains
  `_item`: a `constructors` collection names the entity `constructor_item`.

A path with no collection literal, such as `/`, `/{id}` or `/{org}/{id}`,
takes its name from the first of these that gives at least three letters:

1. the component it answers with: `/{vendor}.json`, answering a map of
   `Plugin`, is `plugin`;
2. the noun of its first parameter, a version aside: `{sheetName}` gives
   `sheet`;
3. the operation's `operationId`, without a leading verb: `get_service_status`
   names `service_status`, and `getUser` names `user`;
4. the title of its 200 or 201 response schema;
5. its last segment that is not a parameter.

So renaming the `operationId` of such a path renames its entity in every
generated SDK when neither its component nor its parameter names it. A
guide entry fixes the name whatever the definition says.

A literal of one or two letters is too short for a word and names nothing.
Such a route is named for the component it answers with, as
`/s/{shelf}/k`, ending in the short literal `k` and answering `Book`
records, is `book`. With no component, it is named as one with no literal
would be: by the noun of the key its shape gives, `sheet` for
`/fr/{sheetName}{fileExtension}` and `term` for
`/search/{versionNumber}/q/{term}.{ext}`; else by its parameters,
operation id, response title or tag; else by the literal padded to three
letters, `dbn` for a bare `/db`.

A read whose naming literal is a verb word with no literal before it,
`/list.json`, or a generic word, `history`, `list` or `results`, is named
for the component it answers with first, as a route with no literal is: a
`/history` that answers `placedOrder` records is `placed_order`. A write
whose literal is a verb stays a command.

A literal written as one word takes the word breaks the definition spells
for the same letters in a tag, an operation id or a component name:
`croptypes`, tagged `CropTypes`, is `crop_type`, and `boxsizes`, beside a
`BoxSize` component, is `box_size`. A literal nothing else spells, such as
`zipcodes`, stays one word.

Nested collections become nested entities with an **ancestor** relationship:
`moon` records that it lives under `planet`.

## When a schema names the entity

A response that refers to a component schema offers a second name, and the
two can disagree. The schema might be the entity itself, or it might be a
shape many entities share, such as an error body. The guide decides by how
often the schema is used. A schema whose name is the path's name, or begins
with it, agrees with the path, and the path's name stands.

A response is read under `application/json` first, then under any other
JSON media type, a `+json` type or `text/json`, then under `*/*` unless
that declares binary content, a file rather than a record. A `2XX` range
code answers for the success codes a definition does not name. So
`/terms/{term}/meanings`, declared under `*/*` as an array of `Meaning`,
is `meaning`, as it would be under `2XX`.

A leading run of words that more than half of a definition's components
start with, and at least two, is a namespace and names nothing: where
most components start with `AcmeApi`, `AcmeApiEncodeRequest` names
`encode`. A run that a path literal holds, that names a component
exactly, or that holds a wrapper word, as `ResponseOk` does, names a
resource or a wrapper instead.

A response schema that is an envelope is judged by what it carries, never
by its own name. An envelope wraps the record in its one structured
property: for a list operation, an array of records beside nothing but
paging, like `{ items: [Observation], page, pageSize, total }`; for a
single-item operation, a lone property like `{ data: Item }`. The guide
unwraps the envelope and applies the rule below to the record's schema,
with that schema's count and that schema's name. It starts from the test
the field transform uses to unwrap a response, so an entity named after a
record takes its fields from that record too.

The naming test is narrower than the field transform's, which accepts any
schema whose only structured property is one list or one nested object. An
envelope declares no `id`, and a single-item envelope holds nothing beside
the item. A page holds nothing beside its records but paging: a count or
total, a page number or size, a limit or offset, a cursor, a next or
previous link, a has-more flag, or the `object` and `url` of a list object.
Any other property is data, such as the totals of a test report beside its
suites or a balance beside a list of errors, and it makes the schema a
record that keeps its own name. Being an envelope also belongs to the
schema rather than to one operation. An operation unwraps only the response
it reads its result from: its `200`, its `201` when it has no `200`, or its
`202` when it has neither. When any operation that answers with the schema
would not unwrap it, such as a create that returns the whole list of
members, or an operation that answers with it only beside a `200` of
another shape, no operation unwraps it for naming. The operations on one
resource then stay under one name, and no entity is named after a record
that its operations never unwrap. A response that spells its envelope
inline offers no component name, so the rule leaves it alone.

An Accepted response names nothing either, because its body may describe
the work the service queued rather than the resource. A read is the
exception when another operation answers with the same record in a `200` or
`201`, the two compared through any envelope they carry. SaladCloud answers a container group instance's read with a `202`
carrying the instance, the record its update answers with a `200`, so the
read joins `container_group_instance`. Named from its tag instead, the read
made a second entity, `container_group`, for one resource, and the
instance's restart, recreate, and reallocate followed it there. A write that
only a `202` answers still names nothing from it: GitHub's fork and transfer
answer with the repository they act on, and stay verbs on `repo`.

When more than one envelope carries the same record, none of them names
through it. Two usage reports, one wrapping a metrics record as `tokens`
and the other as `packages`, are two resources, and their own names are
what tell them apart. Named after the metrics record, they would merge into
one entity with a single load, and where both reports take the same owner
and repository, that load could not choose between them. Each report is
judged by its own schema instead, as it would be with no envelope rule.

A page and a single-item envelope can be one resource's list and one of its
items. A video service lists its jobs as a page of job summaries beside a
row count, and answers a job's cancel, beneath the same route, with one
summary. Both name through the summary record, because the routes say they
are one resource, and the two cannot collide in one operation, because one
is a list and the other is not. Without that evidence the rule holds: a
gallery's page of artworks and an auction's single lot stay two resources,
though both carry the artwork record.

A list always reads records rather than the object they arrive in. An object
holding one list of records beside data of its own, such as a parent beside
its children, is read through that list. When it holds several, a list named
for the entity wins. Lists that share one item schema are categories of one
record, so the list reads the one the definition's example fills, as an SDK's
definition test counts it. Otherwise it reads the first by name that is not
named for errors or messages. The entity's own record is not such an
object, whatever lists it holds: GitLab declares one `API_Entities_Member`
for `/groups/{id}/billable_members`, which answers with an array of members,
so the list reads its whole body rather than a member's `custom_attributes`.
Each list that drops other lists of records is reported with a warning that
names them, and so is a list that reads its whole body. A guide entry that
sets the operation's transform settles either case.

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

A rate cannot tell a rare record from a rare shape that several resources
happen to share. GitHub answers its secret and variable writes with one
empty object, and two branch-protection settings with one flag schema.
Each schema is rare, so each would name an entity, and five different
writes would land in `empty_object`. The guide therefore also asks which
resources answer with a rare schema, and when two or more do, each of their
routes keeps the name its own path gives: `variable`, `enforce_admin`,
`required_signature`.

Counting resources by path name alone counts too many. A filtered read
(`/gists/public`), a selector (`/builds/latest`), an action that returns its
target (`.../reviews/{id}/dismissals`), a relation (`/users/{u}/subscriptions`)
and an older spelling of a route (`/bank_accounts/{id}` beside
`/external_accounts/{id}`) each give the records of one resource a second
path name. Named after their paths, they split one resource into several
entities, or put its records into an entity named for another. The schema
carries the evidence that separates the two cases: a record declares an
`id`, and a shape that several resources share declares none. A record is
never shared, however many path names reach it, and its routes keep the
schema's name as they would with no sharing rule. The envelope rule already
reads the same evidence: an envelope declares no `id` either.

A shape can still be reached through views and aliases, so neither counts.
A route beneath a path that names another resource of the same schema is a
view of that resource, and two item routes with the same parent and the
same parameters are two spellings of one resource. A name is also withheld
where taking it would merge two schemas, as when two manifest shapes are
both reached through `.../digest`, or two routes an SDK could not tell
apart, as with the two secret writes GitHub offers under one organisation,
which take the same parameters.

The cost is paid by records with qualified names. `minimal_repository` and
`api_entities_project` keep them, where the paths' `repository` and
`project` read better. That is a question about how a qualified schema name
relates to a path, not about sharing, and the rule leaves it alone. The
[Shared schemas](../reference/guide.md#shared-schemas) section of the guide
reference states the rule, and the `shared-routes` rows of the shared
fixtures pin each clause.

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

The shape is a default the answer can overrule. A `GET` on an item path
that answers a page of records is a `list`: a central-bank feed's
`/v1/press-releases/{currency}` answers the press releases of one currency,
and none of them carries the currency. Read as a load, the route gave the
press release an identity no record could match. The page test is strict,
since an item's own record often holds a list: a page holds its one list of
records beside nothing but status, paging and its own metadata, and a list
beside an `id`, or beside data the response owns, stays a record. The rule
reads what the route answers and not what the parameter is called, so a
route that answers its one record wrapped in a list, as TheAudioDB's
lookup routes do, is a list too, which is how an SDK can read that record.

A `GET` answering an object that holds a list is read as a `list`, unless
the object is a record that holds lists: on a route its singular literal
names, it declares an identifier beside three or more values of its own,
as `/me` answering the signed-in account with its list of email addresses
does.

Only the method keys of a path item are classified: `get`, `put`, `post`,
`delete`, `options`, `head`, `patch`, `query` and `trace`. A `TRACE` is kept
in the guide as `OPTIONS` is, and gives no SDK operation. Its `parameters`,
`servers`, `summary`, `description` and extension keys describe the path, so
none of them becomes an operation or names an entity.

A single operation can have **several points** — one per path/method that
produces it — which is why the model keeps `op.<name>.points[]` rather than a
single path (see [the internal model](./the-internal-model.md)).

A `POST` whose last literal opens with a read verb, `list`, `search`, `get`,
`find` or `query`, and that answers with a collection is the entity's `list`
operation rather than a `create`: the body is the filter, as a `QUERY` body
is. `POST /listSavedCards` lists `saved_card`, named for the noun after
the verb, and `POST /things/search` is a `list` of `thing` with `search`
as its action. The rule holds however the route is named, so
`POST /gadgets/{gadgetId}/getLinkedTags`, a verb on a gadget, is a `list`
too.

## Some names carry no entity

A component named for a word that says nothing about a resource names no
entity: `success`, `ok`, `default`, `response`, `result`, `object`, `empty`
or `void`, or an identifier such as `GroupId`. Neither does the bare member
of a family of results, as `AcmeResult` is beside `AcmeKindsResult` and
`AcmeZonesResult`. The path names those routes instead.

A method that answers no component of its own joins the entity that a read
of its path takes from the component it answers. A `DELETE` answering a
plain acknowledgement lands on the record its `GET` names, instead of on an
entity of its own named for the path.

## A tag names a route only where the path cannot

A route with no response component takes its name from a tag only when
the tag names a literal of the path, as `things` does on
`PUT /things/{id}/merge`, or when the path has no usable literal at all.
A tag foreign to the path groups routes by module or audience, `Settings`
on `/keys/{key_id}` or `Admin` on `DELETE /teams/{team_id}`, and the path's
own noun names them: `key` and `team`. A literal that names an identifier,
such as `contentIds` in Apicurio's `/ids/contentIds/{contentId}`, keys a
resource rather than naming one, so there the tag still names, and the
reads stay on `artifact`. A trailing literal that is a verb, `send` in
`/message/send`, names the noun before it, and the verb becomes an action
of `message`; so does the verb after a colon in a custom method, as
`count` in `/schedules:count` acts on `schedule`.

A tag that names a literal earlier in the path than its own noun keeps
naming only where the route is a selector or a view of that literal's
resource. With no key before it, that is a leaf ending in a singular
literal, as `/tiles/random` under the `tiles` tag, or in anything a
verb tag acts over, as `/search/notes` under `Search`; a plural leaf
beneath a module is a collection, so `/alerts/topics` is `topic`. Beneath
a key, it is a view, as `/member/{member_id}/fans` under `Member`, but not
a singular sub-read that answers an `id` of its own, as a journal's
`/journal/{journal_id}/digest` does. A route ending in a key whose literal
is singular keeps the tag too, as `/v1/BadgesApi/Active/{serial}`. A
collection with items beneath it names itself whatever tag it carries:
`/projects/{projectId}/signingKeys/{keyId}`, tagged `projects`, is
`signing_key`. An item route beneath a module is not named for the module
either: `/alerts/deviceSubscriptions/{device_id}`, answering a
`DeviceInfo` record, is `device_info`.

A literal's trailing module word, `api`, `controller`, `service`,
`resource` or `endpoint`, is not part of the name when another word
remains: `/v1/GadgetsApi` names `gadget`, and `/v1/PlansApi/Enable` is
`plan` with the action `enable`. A tag is read the same way.

A version tag, such as `v1` or `v2beta`, groups routes by release and
never names one.

## A command is named for its body

A `POST` addressed to a singular literal that names no component, with no
item route it could be a verb on and none beneath it to be a collection, is
a command, and its request body component names it with its affixes
stripped. `POST /#Action=StartSession` sends a `StartSessionRequest` and
is `start_session`; `POST /keys/{keyName}/requestTicket` sends a
`TicketRequest` and is `ticket`. The literal names only when the body is no
component, or no object, such as an upload. A path whose read answers with
a record keeps the literal: `POST /account` beside a `GET /account` that
answers an `Account` is the account's `create`.

The body is read under whatever media type the definition offers, XML and
form bodies included, and a `oneOf` body is read through its first member.
A read on a command's path is the command's load:
`GET /#Action=StartSession`, which sends the same fields as query
parameters, joins `start_session` beside the `POST`.

A command that neither its body nor its response names is named for the
object of its operation id, the leading verb and a tail opening with
`Via`, `By` or `With` dropped. Routes such as
`POST /signin/{account}/{login}/authenticate` send an API key or a token
and answer with no schema, and their operation ids, such as
`getSessionKeyViaJwt`, name them `session_key`.

## A record names its item and its collection

The record an item route answers with names the item and its collection,
whatever its frequency, when its name is not the literal's:
`/s/{shelf}/acl/{entity}` answers a `ShelfAccessControl` that declares an
`id`, so the ACL routes are `shelf_access_control`. A record name that
holds the literal's words, `ExtendedCroptypeEntry` around `croptypes` or
`CiRunnerDetail` around `runners`, is a wrapper of the literal, which keeps
naming, unless the record is named for a literal of the path and the
naming literal, as `CallRouteAllowedCaller` is under
`/call_routes/{id}/allowed_callers`. So is a response component that holds
the literal's words, `CreateReportResponse` around `reports`: the
literal names, and the component shapes the result. A one-member wrapper
named for its noun and its parent, `OwnerPetsForOwnerResponse`, wraps the
noun it names: `owner_pet`.

A record that several collections' item routes share is one semantic
entity, and names them all: `BookAccessControl`, answered by both
`/s/{shelf}/defaultBookAcl/{entity}` and
`/s/{shelf}/k/{book}/acl/{entity}`, names `book_access_control` for both
collections. Each collection whose literal is not the entity's name
carries that literal as an action, `default_book_acl` and `acl` here, so
`$action` selects the path and no route is lost in the merge.

A record declares an id when it has an `id` field, or the field its item
route's key names: `/homes/{homeRef}` answers an `Offer` with a
`homeRef`, so its routes are `offer`. A record inside an envelope that
carries one record beside its metadata counts too, as
`/regions/spots/{spotsId}` answers `{data: Place, meta}` and is `place`. A
read on a literal right after a collection, answering that collection's
own record, is a variant of its list: `/regions/spots/by-circle` is the
`list` of `place` with the action `by_circle`.

## A collection joins its items

The collection and its items can be named apart. A `/keys` path that
answers with its own `ApiKeys` schema names `api_key`, while
`/keys/{key_id}` answers with no schema and takes `key` from its path.
Once every method is classified, the collection path moves to the entity
that holds the item path, so `key` lists, creates, and removes its keys.
`api_key` is left with no path, and is removed rather than emitted
inactive: an entity with no path is not a classification `guide.aontu`
could switch back on.

The joined entity keeps the owner's name, except where the owner only
writes and its name extends the one the list's record gives. Roadie's set
push answers with a push response and names `entity_set_push`, while its
list of `EntitySet` records names `entity_set`; the push is an operation on
the set, so the joined entity is `entity_set`. A load names the record it
returns, so an owner that reads keeps its name.

A route deeper than the item joins on the record alone. With no item route,
a collection joins a verb such as `/tokens/{slug}/refresh` when the verb
returns the token the list holds, and stays apart from a sub-collection such
as `/plans/{plan_id}/accounts`, which lists purchases rather than plans.
When a tag names the delete of an item and the record names its read, the
collection joins the read.

Two shapes keep a collection's operations apart from an item route they
would otherwise join. A create that answers with a record of its own in a
`200` or `201`, declaring its own `id` and sharing no more than half of its
properties with the item's record, is another resource: GitLab's runner registration answers
with a token for the new runner rather than the runner's details, and stays
apart. A create whose answer is named apart from the item's record still
joins when it carries that record's fields, because vendors name the answer
to a create apart from the record it creates. A list never stays apart,
since its records are the collection's items however far they are
summarised.

The other shape runs the join the other way. An item route that answers
nothing and takes its name from a tag can carry another resource's record
onto the collection's: GitHub's `/user/repository_invitations/{invitation_id}`
is tagged `repos`, and joining the invitation list to `repo` gave
repositories the invitation's fields. When the tag names a resource with a
record of its own, and the list's record carries the list path's own name,
the item route joins the list's entity, `repository_invitation`, instead.

A tag can gather such item routes from several collections, and one entity
then holds them all, where a generated SDK reaches only the first of two
points that share a selector. Apicurio Registry tags its well-known agents,
MCP tools and schemas `WellKnown`, so a load meant for an MCP tool fetched an
agent card. Two of a tag's collections share a selector when their item
routes take the same parameters, as the agents and MCP tools do, or when
both collections are read, since each list then selects by nothing. When a
tag that names no resource gathers two such collections, each item route it
gathers takes the name the last segment of its collection gives: `mcp_tool`
for `/well-known/mcp-tools` and `schema` for `/well-known/schemas`. A name
that a route outside the collection takes, wherever it sorts, takes the
tag's name before it. `/well-known/agent.json` names `agent`, so the agents
become `well_known_agent`, and neither list hides the other. A segment that
gives the tag's own name is not taken by the routes the tag names, since
they already sit on the entity the item route would join: the SMS Works'
message reads join `message` beside its send, rather than becoming
`message_message`. Names compare
as they are stored, so `ef`, padded to `efn`, meets an `efn` taken
elsewhere. A collection nested inside this one, as `/well-known/nest/v2/nest`
is inside `/well-known/nest`, is another resource, so its item routes and
the routes under them count as outside it. A route that sorts after the
item route is not named yet when the item route is, so the guide first
works out the name each route takes from its path, its record and its tag,
before it names any. That leaves out the item routes this rule names, since
this rule is what names them: such a route counts once it is named, so of
two tags' item routes that this rule names from collections ending in the
same segment, the later one takes its tag's name, and the two still stay
apart. The tag's name can be taken as well: by a route outside the
collection that has that name, or, once named, by another collection of the
same tag that ends in the same segment. The item route then takes a number
from 2 after the stored form of the tag's name, as `well_known_qq2`. A name
longer than the stored form allows is cut before the number goes on, so the
cut cannot drop it, and those stay apart too: [the guide
reference](../reference/guide.md) gives the cases. A verb on such an item
route counts as taking the segment's name. Apicurio's reads of artifact
content by content ID and by global ID each select by their own parameter,
so they share no selector and stay on `artifact`, the entity their tag
names.

The move is part of the heuristic, so it shapes the base guide and nothing
after it. When the collection is a resource of its own, `guide.aontu` can
declare `/keys` on `api_key` and switch the path off on `key`, and the
model keeps that assignment.

## A command joins the entity it acts on

Entities are kept to as few as the API needs. Once every method is
classified, an entity whose one route only writes, to a literal right
beneath a route another entity holds, is a command on that entity rather
than a resource. The route moves there, the literal as written becomes its
action, and the request body becomes the action's parameters. A document
service's conversions, such as `POST /api/doc/mdconvert` and
`POST /api/doc/docmerge`, are `create` on `doc`, the entity of
`GET /api/doc`, with the actions `mdconvert` and `docmerge`;
`POST /v3/notes/{bookId}/_bulk` is `create` on `note` with the action
`bulk`.

The moved route takes the parameter names the owner's route gives, since
its parameters are that route's: `{run_id}` in GitHub's
`POST /repos/{owner}/{repo}/actions/runs/{run_id}/rerun-failed-jobs` is the
`id` of `run`, as on the run's own route, and the action is
`rerun_failed_jobs`. A plural literal moves as well when nothing reads it,
as Contentful's create-only `asset_keys` does.

The move stops where the route is a resource's. A route that another entity
reads stays: GitHub's `PUT .../branches/{branch}/protection` sits beside the
`GET` that names `branch_protection`. Several commands on one route move
together, so Shortcut's `POST`, `PUT` and `DELETE` on `/api/v3/stories/bulk`
all become `story` with the action `bulk`, and a command beneath another
follows it: GitLab's `.../packages/nuget/symbolpackage` joins `package`
after `.../packages/nuget` does. A command with no parent route, such as
`POST /deactivate`, keeps an entity of its own, named for the command.
Like the collection move, this shapes the base guide, and `guide.aontu` can
declare the route on an entity of its own again.

## Actions: the non-CRUD leftovers

A trailing literal after an item selector is not another entity — it is an
**action** on the entity. In `/api/planet/{planet_id}/terraform`, `terraform`
is an action on `planet`, not an entity called "terraform". Actions surface in
the model as points with a `select.$action` marker, so downstream tooling can
generate a method like `planet.terraform(...)` rather than inventing a bogus
entity.

A verb that answers with a schema of its own is still a verb: its response
is its result, not an entity. GitHub's
`PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge` returns a
`pull-request-merge-result`, and naming an entity after it would leave
`merge` unreachable from `pull`; `GET /farms/{farmId}/croptypes/$count`
answers an `ItemCount` and is the action `count` on `croptype`. A trailing
verb word, or the verb after a custom method's colon, names the noun before
it whatever it answers with, and joins the entity a read of the item
returns, however the two paths spell the key.

A singular literal that is no verb word is a verb on the parent too when
six things hold: the method writes, the response component occurs nowhere
else in the spec, the literal is singular, that literal is not the name of
the component's own member shape, the item selector
(`.../pulls/{pull_number}`) is a path of the spec, and nothing extends the
verb's path. A literal with paths beneath it is a collection and keeps the
component rule.

A verb word keeps its own spelling as an action, so `GET /books/contains` is
the action `contains` on `book`. A placeholder fused to a verb is dropped
from it: `POST /notices/{noticeId}/retract{format}` is `retract` on
`notice`. A verb after three or more keys acts on the entity named before
them, as `POST /shops/{owner}/{shop}/{orderNum}/cancel` is `cancel` on
`shop`. A verb word followed by a key named for it is a noun:
`/lines/{lineId}/stop/{stopId}` reads a `stop`.

A literal that opens with a verb word and continues is a verb as well, on
the nearest resource up the path. `POST /s/{shelf}/lockLendingPolicy`
is the action `lock_lending_policy` on `shelf`, and
`GET /s/{shelf}/rbac/testAccess` is `rbac_test_access` on `shelf`: the
literals after the key name the action, the path nouns in singular and
the verb in its own spelling. `POST /node-k8s/{service_id}/inject_root_cert`
acts on `node_k8s`. A
plural collection of its own between the key and the verb takes the verb
instead, so `/things/{id}/labels/archive` is `archive` on `label` where
`/things/{id}/actions/archive`, with no `actions` route, is `archive` on
`thing`, the `actions` element only gathering the verb; a singular
sub-resource such as `rbac` does not. A bare verb word right after the key
follows the preceding rules. With no key before it, a verb phrase acts on
the collection before it: `POST /LedgerLinks/ArchiveEntries` is the action
`archive_entries` on `ledger_link`.

A sub-path under an item key that is both read and written with one
component is a resource of its own. It takes that component's name and is
read whole: `/teams/{teamId}/sync/config`, read and written as a
`Preference`, is `preference`, and `/clubs/{name}/settings` is
`club_setting`, its one property never unwrapped as an envelope. A `PUT`
or `PATCH` to a singular literal right after an item key, on a path
nothing reads or extends, whose body declares no `id`, updates the item:
`PUT /parcels/{id}/address` is the `update` of `parcel` with the action
`address`.

A JSON:API relationships route is an action on the resource before it:
`POST /expenses/{expenseId}/relationships/tags` is `expense` with the
action `tags`. A `POST` answered by an empty `202 Accepted` creates what
the route that reads its results answers with: `POST /report/render`,
read at `/report/renderResults/{resultId}`, is `render_operation_result`,
with the noun it acts on, `report`, as the action. A read of a singular
literal followed by an identifier key named for another noun, answering
no record of its own, views that noun's item: `/tsp/answer/{jobId}` is
`job` with the action `tsp_answer`. A key that names an item, such as
`{sheetName}`, names an item of the literal itself.

A `GET` beneath an item key is a view of the item when it answers with no
record of its own and every literal after the key is singular: an object
that declares no `id`, as `/files/{file_id}/content` does, or an array of
scalars, as `/owners/{id}/nick_names` does with its strings. The nearest
resource up the path takes the view as a `load` action named for the
literals after the key: `content` on `file`, `nick_name` on `owner`, and
`sync_billing_status` on `team` for
`/meta/teams/{teamId}/sync/billing/status`, where the noun before the key
names because no item route precedes the view. A
version parameter is no item key. A read whose response declares an `id` of its
own, or whose items do, is a sub-resource and keeps the component rule,
and a plural read answering an array of id-less objects stays a
collection.

Plurality decides first, and on its own. A verb reads as one instruction —
`merge`, `revoke`, `resend_confirmation` — where a plural literal names a
collection whatever it answers with. Contentful's
`POST /spaces/{sid}/environments/{eid}/asset_keys` answers with an
`Assets keys` component and GitLab's `.../merge_requests/{iid}/approvals`
with an `ApprovalState`; neither component is the literal's member shape,
so only the plural makes these collections rather than verbs. GitLab reads
its approvals, so `approval` stays an entity; nothing reads Contentful's
asset keys, so that collection is a command on the environment, as
[A command joins the entity it acts on](#a-command-joins-the-entity-it-acts-on)
describes.

An action borrows an op slot rather than owning one: `PUT .../merge` sits in
`update`. When every point in `update` is an action, a `PATCH` on the item
path is promoted to `update` and the action points ride along, so a plain
`update()` reaches the real update and `$action` selects the verb.

A literal after two keys is an action too.
`POST /v3/notes/{bookId}/{id}/_pin` and `.../_mute` belong to `note`
through their tag, and take `pin` and `mute` as actions, so `$action`
selects between them where their parameters cannot.

Only a literal names an action. An element that holds a placeholder, such as
`{threadId}.json` in `/{board}/thread/{threadId}.json`, carries a parameter,
never a verb. A custom method writes its verb after a colon in the last
element, as `/schedules:count` or `/schedules/{scheduleId}:cancel`, and reads
as that verb written as a trailing element: `count` and `cancel` become actions
on `schedule`, and `{scheduleId}` is renamed as on
`/schedules/{scheduleId}/cancel`. The entity such a path joins is decided from
the path as written, so a count whose path no tag or schema ties to
`schedule` stays an entity of its own, as `/messages/count` would.

A verb route named only from its tag joins the entity that owns its
collection. incident.io tags `POST /v2/escalations/{escalation_id}/actions/respond`
with `Escalations V2`, which names no resource, and the route answers nothing.
Its collection, `/v2/escalations`, belongs to `escalation`, so `respond`
becomes an action on `escalation` and `{escalation_id}` is renamed to `id`.
An `actions` element only gathers the verbs: `/{id}/actions/cancel` names the
action `cancel`, not `action_cancel`.

The route joins only as a verb the entity can take as an action. One or two
singular words follow the item, behind an optional `actions`, and the entity
is named for the collection. A plural word names a sub-collection, so
Contentful's `/spaces/{space_id}/api_keys` stays `api_key`, and
Statuspage's `/pages/{page_id}/subscribers/reactivate` does not join
`page`: it is a command on `subscriber`, the entity of the collection it
writes beneath.

A result wrapper names the resource
before its verb when the words after the verb name nothing the spec defines:
`AlertsAddTagsResultV2` names `alert`, so `POST /v2/alerts/{id}/actions/add_tags`
joins `alert` as the action `add_tags`, the verb in its own spelling.

A route an API keeps in several versions, `/v1/things/{id}` beside
`/v2/things/{id}` and `/v3/things/{id}`, would give every version the same
selector, so only one could ever be reached. The highest version with an
operation the spec does not deprecate is the route. Each older version
becomes an action named for it, `v1`, or suffixes the action its path already
has, `archive_v2`, so `$action` still reaches it.

## Parameter renames

A path parameter named after its entity — `{planet_id}` on the `planet`
entity — is the entity's identifier. The guide renames it to the canonical
`id` and records the mapping under `rename.param`, so the generated SDK
exposes a uniform `id` while the original wire name is preserved for building
the request URL.

The path decides this on its own. An item operation often answers with a
schema named for one view of the entity rather than the entity itself:
GitHub's `GET /orgs/{org}/actions/runner-groups/{runner_group_id}` answers
with `runner-groups-org`, and `GET /repos/{owner}/{repo}/branches/{branch}`
with `branch-with-protection`. Letting that name veto the rename withholds
`id` from exactly those keys. What it would catch instead is a trailing
parameter that selects a scope rather than the entity, as `{owner}` does in
Cloudsmith's `/repos/{owner}/`, which lists every repository an account owns.
The answer catches that one: a page of repositories makes the path's read a
list, and no route on the path, its create included, renames `{owner}` to
`id`. A map of records is a scope too: FXMacroData's
`/v1/data_catalogue/{currency}` answers the catalogue entries of one
currency under indicator slugs, so `{currency}` is no entry's key. So is the
parameter of a random route: `/random/category/{category}` answers a
different record on each call, and none of them equals the category. Neither
is renamed, and neither adds an `id` the record never returns. A scope whose
read answers anything else is still renamed, and
[the guide](../reference/guide.md#correcting-the-guide) is where to correct
it.

A route need not say `random` to answer a different record on each call.
In a joke API, `/joke/{category}` answers a random joke of the category it
is given, and in a cat-picture API, `/cat/{tag}` answers a random cat with
the tag. Many records share a category or a tag, so neither parameter is a
key. A lookup verb says the same: in an anime API, `/api/find/{name}` looks
a show up by name and answers its numeric `id`, the record's identity. A
parameter after a lookup verb whose name ends in `id` is a key of the
entity the noun before the verb names: `/members/lookup/{member_id}` is the
`load` of `member`, keyed `id`. The
parameter's name is all the path offers here, so the reading stays narrow.
It needs a path that only reads, since a parameter that a `PUT` or `DELETE`
addresses is a key, whatever its name. It also needs a path that is not a
collection of the shared value itself, as `/categories/{category}` is. The
shared values are a short list, and a name such as `/pokemon/{name}` stays a
key.

A parameter before the last segment keys the parent when the entity is
named for both segments. `/owners/{id}/pets` lists `owner_pet` records,
and its `{id}` is the owner's: read as a pet's own key, it would give
every pet the owner's identifier and an identity check no pet could pass.
The parameter is `owner_id`. A route under an item key that answers no record of its own,
such as a restaurant directory's `/restaurants/{id}/menu`, is a view of the
parent instead, and `{id}` stays the parent's `id`. A route that holds a
record under the name it ends in answers that record, though other data
sits beside it: `/users/{id}/user-role` answers a `user_role` beside the
user's assigned courses, so it lists `user_role`, keyed by `user_id`.

A parameter before another segment keys a parent, such as `{project_name}`
in SaladCloud's `/projects/{project_name}/containers/{container_group_name}`.
Its place in the path decides its name, and one parameter sits in different
places in an entity's paths: second from last in the container list, deeper
in a container's load. Decided path by path, the list kept `project_name` and
the load renamed it `project_id`, so a caller passed one value under two
names. The guide therefore gives each parameter of an entity one name, and
where its paths disagree that name is the specification's own, in snake
case. A name is never renamed to an identifier either, because the value is
a name: `project_id` described a project's name as its identifier.

The entity's own key is left as each path names it. A path keyed by a
parent can still look like an item path whose read answers no page, and the
trailing-key rule then makes the parent's parameter the entity's `id` there.
Spreading that `id` to the entity's other paths would name the parent as the
identifier of every record. So an action can still name the entity's key
apart from its load, as SaladCloud's container start does with
`container_group_name`. The
[guide reference](../reference/guide.md#parameter-renames) states the rules.

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

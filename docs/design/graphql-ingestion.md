# Design: GraphQL ingestion for apidef / sdkgen

- **Status:** draft — for review
- **Date:** 2026-08-10
- **Scope:** apidef (primary), sdkgen (model schema + templates), create-sdkgen (scaffold)
- **Case studies:** [linear.app](https://linear.app/developers) (CRUD-regular GraphQL),
  [dagger.io](https://docs.dagger.io) (object-graph DAG API — the stress case)

## Summary

sdkgen's principal design choice — break an API into semantic **entities**
with a **standard operation set** (`create/load/list/update/remove`), folding
even "command" endpoints into entity operations — extends naturally to
GraphQL. GraphQL enters as a **second front-end to apidef**, not as a new
mode of sdkgen: the pipeline classifies schema **root fields** the way it
classifies REST paths today, and emits the same apimodel, extended with one
additive concept — an operation *point* whose `kind` is `graphql` and which
carries a **precomputed operation document** instead of `method` + `parts`.

The end result is the goal stated for the project: generated SDKs expose the
**same methods and objects** for a GraphQL API as for a REST API. GraphQL
knowledge is confined to apidef (which computes documents once, in one
place) and to one small API-independent transport template per language.

## Why the current architecture is already close

The entity/op model is nearly transport-neutral today. The REST-specific
surface area is small and localized:

- **In the model:** only the `ModelPoint` record couples to HTTP —
  `method`, `parts`, and arg kinds (`ts/src/model.ts:98-122`). Everything
  else (entities, fields, op maps, `select`, `transform`) is
  transport-agnostic.
- **In generated SDKs:** only the spec/request steps couple to HTTP —
  `MakeSpecUtility`, `MakeUrlUtility`, `MakeFetchDefUtility` in sdkgen's
  `ts/project/.sdk/tm/ts/src/utility/`. The op pipeline around them
  (`makeContext → makePoint → makeSpec → makeRequest → makeResponse →
  makeResult → done`, with feature hooks and `ctx.out.*` overrides at every
  step) never looks at a URL.

And the guide's job is transport-independent: it classifies a flat namespace
of callable things into `{entity, op}`. Today that namespace is
`METHOD /path` pairs; in GraphQL it is root fields. The problems are
isomorphic:

| REST (today) | GraphQL (Linear) |
|---|---|
| `GET /api/planet/{planet_id}` → `planet.load` | `issue(id: String!): Issue!` → `issue.load` |
| `GET /api/planet` → `planet.list` | `issues(filter, first, after): IssueConnection!` → `issue.list` |
| `POST /api/planet` → `planet.create` | `issueCreate(input): IssuePayload!` → `issue.create` |
| `POST /api/planet/{id}/terraform` → `create` point, `select.$action: "terraform"` | `issueArchive(id): IssueArchivePayload!` → op point, `select.$action: "archive"` |
| `GET /api/planet/{planet_id}/moon` → `moon.list` with `planet_id` param | `issue(id) { comments(...) }` → `comment.list` point with `issue_id` arg |

Five existing mechanisms carry over unchanged and do most of the work:

1. **Parse dispatch** — `ts/src/parse.ts` already switches on input `kind`
   (`'OpenAPI' === kind`). A `'GraphQL'` kind slots in beside it. The kind
   must also become caller-selectable: `ApiDef.generate` currently calls
   `parse('OpenAPI', ...)` unconditionally (`ts/src/apidef.ts:184`) and
   `makeBuild` hardcodes `kind: 'openapi3'` in its config, so ingestion
   adds an `opts.kind` (defaulted by input sniffing: `.graphql`/`.graphqls`
   extension or `type Query` content → GraphQL; `__schema` JSON →
   introspection) propagated through both entry points.
2. **Guide strategy** — `ts/src/guide/guide.ts` dispatches on
   `ctx.opts.strategy` (`'heuristic01'`). The GraphQL classifier is a
   sibling strategy emitting the *same* guide grammar, so the override
   story needs zero new design: the generated `base-guide.aontu` is
   included by the user-editable `guide.aontu` and merged by aontu
   unification, exactly as for REST.
3. **Command folding** — action endpoints already become extra `points`
   under a canonical op, discriminated at runtime by `select.exist` /
   `select.$action` matching (see the solar fixture's `terraform`/`forbid`
   actions, and `MakePointUtility` in sdkgen). Linear's large command
   residue (`issueArchive`, `issueSubscribe`, `attachmentLinkURL`,
   `userSuspend`, …) is exactly this shape, spelled as mutation names
   instead of path suffixes.
4. **Envelope unwrapping** — `ModelPoint.transform.res` already declares
   response unwrapping (`` `body` ``, `` `body.<entity>` ``; see
   `transform/operation.ts` and the `envelope-prop.tsv` /
   `request-envelope.tsv` fixtures). GraphQL's mutation payload convention
   (`data.issueCreate.issue`) is a deeper unwrap path through the *same*
   mechanism — not a new problem.
5. **Ragged op sets** — sdkgen's Entity component emits only the ops
   present in `entity.op`. GraphQL schemas are ragged by nature (Linear's
   `viewer`/`organization` singletons have `load` only; Dagger has no
   `list`/`remove` at all); no special handling is needed.

## Goals and non-goals

**Goals (v1):**

- Ingest a GraphQL schema (SDL file or introspection JSON) and emit the
  same apimodel sdkgen consumes today, with per-op GraphQL wire data.
- Generated SDK surface identical in shape to REST-generated SDKs:
  `client.Issue().load({id})`, `.list()`, `.create()`, `.update()`,
  `.remove()`, plus `$action`-dispatched commands.
- Classification driven by type shape first, naming conventions second,
  user-overridable through the existing guide mechanism.
- One GraphQL transport template per language; components unchanged except
  for emitting document constants.
- A raw escape hatch (`client.graphql(query, variables)`) built on the
  existing `direct()`/`prepare()` machinery.

**Non-goals (v1) — each reachable through the escape hatch:**

- Per-call selection sets / a selection DSL (the single most expensive
  feature to hold in ~23-language parity; Dagger's lazy builder is the
  existence proof of the cost).
- Typed filter builders (Linear's comparator input-type graph as native
  types in every language).
- Client-side chain reification / lazy batching (Dagger-style one-query-
  per-resolved-chain).
- GraphQL subscriptions (Linear ships none — webhooks instead; neither
  Linear's nor Dagger's own generated SDKs support them).
- Multipart file upload (`graphql-multipart-request-spec`); the staged
  signed-URL pattern models as ordinary ops instead.

## Ingestion

### Input formats

Accept both **SDL** (`.graphql` schema file) and **introspection JSON**
(normalized into the same internal schema graph). SDL is canonical:
introspection strips directive *applications*, so SDL is the only channel
for in-schema generator hints (e.g. a future
`@sdk(entity:"issue", op:"archive")`). A schema arriving via introspection
is treated as hint-free — classification then rests entirely on the
heuristic profile plus the guide file.

Linear publishes its full SDL (`packages/sdk/src/schema.graphql` in the
`linear/linear` monorepo). Dagger is introspection-only by nature (the
schema is per-session and extended dynamically by modules).

### Build inputs the schema cannot supply

Two model inputs that OpenAPI carries in-band are absent from a GraphQL
schema and must arrive as build options:

- **Endpoint URL.** `topTransform` requires `def.servers[0].url` and fails
  the build without it (`ts/src/transform/top.ts:104-112`) — correctly, as
  a usable SDK needs a base URL. SDL and introspection carry no deployment
  URL, so GraphQL ingestion adds an `endpoint` option (e.g.
  `https://api.linear.app/graphql`) normalized into `kit.info.servers` so
  the existing check and sdkgen's `options.base` default both work
  unchanged.
- **Auth metadata.** When an OpenAPI spec declares no security schemes,
  `topTransform` stamps an explicit no-auth signal (`kit.info.auth =
  false`, `ts/src/transform/top.ts:54-64`) that suppresses downstream auth
  code, docs, and examples. A GraphQL schema *never* declares HTTP auth,
  so applying `specDeclaresAuth` as-is would wrongly mark every secured
  GraphQL API (Linear included) as auth-free. GraphQL ingestion takes an
  `auth` option (scheme + header prefix, e.g. bare-key `Authorization` for
  Linear) — supplied directly or by the naming profile — and emits the
  no-auth signal only when the option explicitly says so.

### Classification: shape first, names second

Naming conventions diverge across ecosystems (Hasura `insert_<table>_one`,
Amplify `createTodo`, Linear `issueCreate`, PostGraphile `createUser` — and
PostGraphile's inflector plugin proves names are one plugin away from
changing), but type-shape signals are framework-independent:

| Signal | Op |
|---|---|
| `Query` field returning an entity type, single required id-ish arg | `load` |
| `Query` field returning a connection-of-entity (`edges/nodes/pageInfo`) or list-of-entity | `list` |
| `Mutation` whose input type is `<Entity>CreateInput`, or whose payload wraps the entity, no id arg | `create` |
| `Mutation` with id arg + `<Entity>UpdateInput` | `update` |
| `Mutation` named `*Delete`/`*Remove` returning a delete-ish payload | `remove` |
| **Any other mutation touching the entity** | **action** — never dropped |

Actions attach as extra points with `select.$action`, host op chosen by
shape (id arg + entity-bearing payload → `update`-flavored; no id →
`create`-flavored) — mirroring how `FindActions` in `heuristic01.ts`
handles REST action paths.

Entity discovery: object types reachable from root fields that own an `id`
field and at least one op. Connection / Edge / PageInfo / Payload / Input /
Filter types are machinery, not entities.

Naming **profiles** (`linear`, `relay`, `hasura`, `amplify`, `opencrud`,
`postgraphile`, …) layer regex conventions on top of the shape rules —
analogous to `heuristic01`'s rate constants. Each framework is internally
regular even though they diverge from each other. A schema matching no
profile classifies conservatively and leans on the guide file rather than
guessing: every GraphQL↔REST bridge that survives irregular schemas (Sofa,
GraphQL Mesh) does so via per-endpoint overrides, not smarter heuristics.

The classifier also derives per-op metadata the transform stage needs:
pagination style (`relay` | `items-token` | none), payload-unwrap path
(`issueCreate → issue`), filter input type name, id-arg name.

### Guide grammar

Root fields take the place of paths — same structure, same aontu-merge
override mechanics, same `why` traces and metrics
(`count: field` alongside `count: path`):

```
guide: entity: issue: {
  field: "issue":        { op: load: optype: *query }
  field: "issues":       { op: list: optype: *query }
  field: "issueCreate":  { op: create: optype: *mutation }
  field: "issueUpdate":  { op: update: optype: *mutation }
  field: "issueDelete":  { op: remove: optype: *mutation }
  field: "issueArchive": { action: "archive": {}  op: update: optype: *mutation }
  rename: arg: "id": *"id"
}
```

`validateBaseBuide`'s coverage check carries over: every root field must be
assigned to some entity, or explicitly excluded.

The canonical guide schema must grow the new branch in the same step:
`model/guide.aontu` currently admits only `path:` entries whose ops carry a
`method` string, so a guide emitting `field:`/`optype:` entries would fail
aontu unification against it. Extend the schema with the field-keyed shape
(alongside `path:`) and synchronize the package mirrors and the Go parity
port, per the canonical-model conventions in `AGENTS.md`.

## Model extension: documents are data

The decisive choice: **apidef precomputes the complete GraphQL operation
document per op and stores it in the model as a string.** Languages emit
the document as a constant and never construct GraphQL. The alternative —
storing structured selection data and having each language's runtime
assemble query strings — means N query-assembly implementations that must
stay semantically identical; one document renderer in apidef (TS canonical,
Go parity) versus that is decisive. Documents render with sorted field
order, so output stays byte-stable and schema drift is visible in ordinary
model diffs.

`ModelPoint` extends additively; `kind` defaults to `http`, so existing
REST models are untouched:

```
op: load: points: [ {
  kind: "graphql"                     # 'http' (default) | 'graphql'
  orig: "query issue"                 # provenance, like the REST path
  graphql: {
    optype: "query"                   # query | mutation
    field: "issue"
    doc: "query IssueLoad($id: String!) { issue(id: $id) { ...IssueFields } }
          fragment IssueFields on Issue { assignee { id } createdAt id title }"
    vars: [ { name: "id", from: "id", gqltype: "String!" } ]
    page: {                           # list ops only
      style: "relay"
      nodes: "nodes"
      cursor: "pageInfo.endCursor"
      more: "pageInfo.hasNextPage"
    }
  }
  args: { params: [ { name: "id", kind: "param", reqd: true, type: "`$STRING`" } ] }
  select: { exist: ["id"] }           # unchanged — $action dispatch works identically
  transform: { req: "`reqdata`", res: "`body.data.issue`" }
} ]
```

The canonical apidef model schema is part of this change, not an
afterthought: `model/apidef.aontu` currently *requires* every point to
carry `method` (constrained to the HTTP verb disjunction) and `parts`, so
a GraphQL point omitting them would fail unification. The point schema
becomes transport-discriminated — `method`/`parts` required when `kind` is
`http`, the `graphql` block required when `kind` is `graphql` — with the
package mirrors and Go port synchronized alongside (`AGENTS.md`
canonical-model rules; the same applies to sdkgen's `model/sdkgen.aontu`
via `make sync-model`).

Entity fields come from the GraphQL object type's scalar fields through the
existing `ModelField` shape. Relations get real data from the schema:
to-one relations recorded as id-stub references; to-many relations as
parent-scoped `list` points on the child entity (the GraphQL analogue of
`/planet/{planet_id}/moon`).

### Default selection sets

The fragment baked into each document follows Linear's proven scheme (it is
what `@linear/sdk`'s own generator does):

- all **non-deprecated scalar fields** of the entity type;
- **excluding scalar fields that take required arguments** — selecting
  `download(format: Format!): String!` without binding its argument fails
  GraphQL validation, so such fields are dropped from the default fragment
  (a guide entry can adopt one explicitly, binding its arguments as op
  vars);
- **to-one relations reduced to `{ id }`**;
- recursion cut at every relation boundary (to-many relations omitted from
  the default fragment);
- unions/interfaces: shared fields + `__typename`, variants id-only.

Overrides live in the guide: per-entity `fields:` include/exclude lists, or
a fragment-override file validated against the schema and re-canonicalized
(sorted) by apidef for byte-stability.

## sdkgen side

Applying the two-layer rule — *same for every API → template; depends on
the API → component*:

- **Template, one file per language**
  (`tm/<lang>/src/utility/GraphqlUtility.*`): given `(doc, variables)`,
  POST `{query, variables}` to `options.base`; check top-level `errors[]`;
  map `extensions.code`/`type` onto the same error categories the REST path
  derives from status codes (auth, ratelimit, invalid input, network); on
  success hand the body to the normal `transform.res` unwrap. If `errors[]`
  is non-empty the op **fails** — partial-data semantics do not exist in
  the REST surface and must not leak into the uniform one.
- **Dispatch**: `makeSpec`/`makeFetchDef` branch on `point.kind`. A GraphQL
  spec carries `{ method: 'POST', body: { query, variables } }` and skips
  URL-part assembly; `prepareAuth`, headers, features, and the whole hook
  chain run unchanged.
- **Component**: `Entity`/`EntityOperation` emit the same five methods; the
  only delta is emitting document constants and binding variables from op
  args. `MakePointUtility`, `select.exist`, `$action` dispatch: untouched.
- **Paging**: the existing `PagingFeature` already stamps cursors outbound
  and reads `next`/`cursor`/`hasMore` signals into `ctx.result.paging`.
  Teach it the relay shape (map `ctrl.paging.cursor` → the `after`
  variable; read `pageInfo` per the point's `page` descriptor). The surface
  stays "list with cursor option", identical to REST.
- **Filters**: pass a plain nested map through verbatim as the `filter`
  variable — GraphQL variables make pass-through safe (no string
  interpolation). The model records the filter type name for docs; a
  generated TS filter type is cheap tier-1 sugar, later.
- **Auth**: `prepareAuth` already supports Linear's bare-API-key style — an
  empty `auth.prefix` sends the credential as-is in `Authorization`.

Generated surface (Linear):

```ts
const client = LinearSDK({ apikey })
const issue = await client.Issue().load({ id })
const page  = await client.Issue().list({ filter: { state: { type: { eq: 'started' } } } })
const made  = await client.Issue().create({ title, teamId })   // unwraps IssuePayload.issue
await client.Issue().update({ id, $action: 'archive' })        // issueArchive via point select
```

## Escape hatches: `direct`, `prepare`, and a `graphql` sugar

Generated SDKs already ship a client-level raw hatch: `direct(fetchargs)`
(and `prepare(fetchargs)`, which returns the auth-ready fetch definition
without executing). `direct` reuses `base/prefix/suffix`, merges SDK
default headers, applies `prepareAuth`, JSON-encodes object bodies, and
returns `{ok, status, headers, data}` — gated by `options.allow.op`.

This matters for GraphQL twice over. First, it **already works** as a raw
GraphQL client with zero changes:

```ts
const res = await client.direct({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: { query: 'query($id:String!){issue(id:$id){id title}}', variables: { id } },
})
```

Second, it is the pressure valve that makes every v1 non-goal defensible:
per-call selections, typed filters, batching, unions, unmapped mutations —
all reachable today through `direct`, and `prepare()` lets users hand the
SDK's credential/config handling to a dedicated GraphQL client (Apollo,
urql) when they want full GraphQL power.

Changes needed:

1. **`client.graphql(query, variables, ctrl?)` sugar** — thin wrapper over
   the `prepare`/`direct` path, not new machinery. The one genuine semantic
   fix it carries: `direct`'s `ok` is HTTP-status-based, but GraphQL errors
   ride HTTP 200 with a top-level `errors[]` — so a failed query reports
   `ok: true` through raw `direct`. The sugar sets POST + content-type,
   wraps the body, then lifts `errors[]` into `ok: false` with
   `extensions.code` mapped through the same table `GraphqlUtility` uses
   for entity ops. `direct` itself stays as-is (honest at the HTTP layer;
   its `data` includes the full envelope).
2. **Content-Type default** — `prepareHeaders` never sets `content-type`
   and `makeFetchDef` stringifies object bodies without adding one; most
   GraphQL servers reject that. The sugar sets it; optionally `direct`
   learns "object body → default `application/json`" (benefits REST too).
3. **`allow.op` governance** — add `graphql` as its own token (the default
   list already gates `direct`, and already reserves `command`). To be
   precise about what it buys: the token gates the *sugar only* — an
   identical raw request remains expressible through `direct`, so an
   operator who wants to block raw schema access must disable both
   `graphql` and `direct`. Document that pairing rather than pretending
   the token alone is a boundary; entity ops are unaffected either way.
4. **Absolute-URL override (optional)** — `makeUrl` always joins
   `base + prefix + path + suffix`, so `direct` cannot reach a different
   host. Linear's staged file upload (mutation returns a signed S3 URL,
   client PUTs bytes there) needs exactly that. Honor `fetchargs.url` as an
   absolute override (the `Spec` class already carries a `url` field) —
   and preserve **binary bodies**: `makeFetchDef` JSON-stringifies any
   object body today, which would corrupt a `Buffer`/`Uint8Array`/`Blob`/
   stream upload. The upload path must detect binary body types, pass the
   bytes through untouched, and skip the JSON content-type default for
   them.

Documented caveat (not a change): `direct` bypasses the feature pipeline —
no `featureHook` calls, so retry/ratelimit/paging features do not apply to
it, and the `graphql()` sugar inherits that. Worth a README line for
GraphQL specifically, since APIs like Linear enforce aggressive rate and
complexity limits.

## Case study: Linear (the acceptance target)

Linear's schema is strictly entity-prefixed and shape-regular: prefix-strip
plus the shape rules recover the entity/op split almost perfectly across
~100 entities. Key mappings:

| Schema member | Model |
|---|---|
| `issue(id)` / `issues(filter, first, after)` | `issue.load` / `issue.list` (relay paging descriptor) |
| `issueCreate(input)` → `IssuePayload{success, lastSyncId, issue}` | `issue.create`, `transform.res` unwraps `body.data.issueCreate.issue` |
| `issueUpdate(id, input)` / `issueDelete(id)` | `issue.update` / `issue.remove` |
| `issueArchive`, `issueUnarchive`, `issueSubscribe`, `issueAddLabel`, `issueBatchUpdate` | `$action` points (`archive`, `unarchive`, …) on `update`/`create` |
| `attachmentLinkURL`, `attachmentLinkGitHubPR`, … | `$action` points on `attachment` |
| `viewer`, `organization` | singleton entities, `load` only (ragged op set) |
| `searchIssues(term)` | `issue` action `search` |
| `fileUpload` → signed-URL PUT | action returning `UploadFile`; byte PUT via `direct` + absolute URL |
| Errors: top-level `errors[]` with `extensions` (`AUTHENTICATION_ERROR`, `RATELIMITED`, …) | `GraphqlUtility` error table |
| Auth: bare API key in `Authorization` | `auth.prefix: ''` (already supported) |
| Real-time | webhooks, not subscriptions — out of scope, unchanged |

The generated SDK is semantically `@linear/sdk` minus lazy relation getters
and typed filters — a deliberate, documentable delta. Their lazy
`issue.team` getter is replaced by `client.Team().load({ id })` from the
id-stub; generating per-relation loader ops is a clean v2 addition since it
is pure delegation to existing ops. A Linear SDL snapshot belongs in the
test corpus as the GraphQL analogue of solardemo.

## Case study: Dagger (the boundary)

Dagger's API is a lazily-evaluated object DAG: everything hangs off `Query`
(no `Mutation` type), most fields return new immutable objects
(`container().from("alpine").withExec([...])`), execution happens only when
a scalar leaf resolves (`stdout`, `publish`), IDs are serialized pipeline
descriptions rather than database keys, and the schema is per-session,
extended dynamically by modules.

**What maps cleanly:**

- `loadContainerFromID(id)` → `load` — an exact, universal match (the
  engine generates the `id`/`loadXFromID` pair for every type).
- Root constructors (`container()`, `git(url)`, `cacheVolume(key)`,
  `setSecret(...)`) → `create`-flavored factories.
- Object-vs-scalar return type is a mechanically reliable classifier:
  object-returning `with*` fields are builder actions (returning a new
  instance with a new ID); scalar-returning leaves (`stdout`, `exitCode`,
  `export`, `publish`, `sync`) are executing actions.

**What resists:**

- `list` and `remove` have no possible binding (nothing enumerates DAG
  values; deletion is meaningless under content-addressed immutability).
  Correctly absent — the ragged-op machinery makes this a non-event.
- **Laziness is load-bearing.** An eager one-request-per-op SDK is correct
  (IDs self-contain the pipeline, so ID-rehydration between calls works)
  but loses the single-nested-query DAG submission that BuildKit's caching
  and parallelism feed on, and grows request payloads with chain length.
  Note: the claim "computing an ID does not execute side effects" in
  modern Dagger must be verified before even the degraded mode is
  advertised as correct.
- Per-session dynamic schemas (modules) break "generate once from a static
  model"; a snapshot-in, SDK-out workflow is the honest posture.

**Recommendation:** Dagger goes in the corpus as the graceful-degradation
guard — proving the classifier emits honest partial op sets and clear
diagnostics — not as a supported target. Chain reification is a possible
tier-1-only future feature behind the existing parity-tier mechanism. Its
lasting contributions to this design: the `kind` transport seam, the
object-vs-scalar classifier signal, and per-entity opaque id-scalar
support.

## Delivery plan

1. **apidef ingestion** — GraphQL parse (`kind: 'GraphQL'`), with
   `opts.kind` selection propagated through `ApiDef.generate` and
   `makeBuild` (both hardcode OpenAPI today); `endpoint` and `auth` build
   options (see *Build inputs the schema cannot supply*); shape classifier
   + `linear`/`relay` profiles as a new guide strategy; document renderer;
   Linear SDL fixture; TSV fixtures for classifier decisions.
   **Go parity port is definition-of-done**, with `Mirrors src/...`
   comments and shared `.tsv` fixtures (apidef is dual-implementation).
2. **Model schema extension** — new point fields in `ts/src/model.ts` and
   the builders, plus the canonical schemas: transport-discriminated point
   shape in `model/apidef.aontu`, the field-keyed guide branch in
   `model/guide.aontu`, and package-mirror/Go sync for both; in sdkgen,
   `model/sdkgen.aontu` + `make sync-model` + the `model-mirror` drift
   guard + `make check-model`.
3. **sdkgen ts/js reference** — `GraphqlUtility` template, `makeSpec`/
   `makeFetchDef` dispatch on `point.kind`, `PagingFeature` relay support,
   `client.graphql()` sugar + `allow.op` token, document-constant emission
   in components (new components must pass `check-scaffold`). Validate
   end-to-end against a Linear-like test schema.
4. **Roll across languages by parity tier**; corpus entries in
   `parity.test.ts` for the Linear snapshot (and later Dagger as the
   degradation case).
5. **create-sdkgen** — scaffold slot for a schema file + profile/guide
   selection; a GraphQL reference SDK project (the solardemo analogue) so
   the `add-target` → `generate` → test propagation loop has a real
   consumer. Watch the merge gotcha: new templates containing
   `ProjectName`-style placeholders are not re-substituted on merge.

## Risks and open questions

- **Selection fatness on cost-metered APIs.** All-scalars fragments can hit
  complexity budgets (Linear meters per-query and hourly complexity;
  GitHub/Shopify-scale schemas are worse — Shopify deliberately declined
  an entity-style GraphQL SDK for this reason). Mitigations: deprecated
  fields excluded, guide-level field lists, fragment-override files. Open:
  should `list` default to a thinner fragment than `load`?
- **Schema drift.** GraphQL schemas roll continuously with no versioning;
  regeneration can silently change fragments. Documents-in-model makes
  drift visible in diffs; add a snapshot-comparison guard in CI. Open: the
  semver story for regenerated SDKs when a deprecated field is removed.
- **Testing.** Generated GraphQL SDKs need a canned-response / mock-server
  harness per language for the `Test` component. Least-designed part of
  this proposal; deserves its own pass.
- **`$action` ergonomics at Linear scale.** Linear's command residue is
  much larger than typical REST action sets. `$action`-through-canonical-op
  is uniform with today's surface, but may eventually motivate first-class
  named command ops in `OpName` (a closed union today, `ts/src/model.ts:9`;
  the generated-SDK `allow.op` default already reserves a `command` token).
  Orthogonal, pre-existing question — deliberately not forced here.
- **Relation surface.** v1 ships id-stubs only (`{ id }` in fragments).
  Open for v2: generated to-one loader ops (`issue.team()` as delegation to
  `team.load`) and to-many scoped lists as first-class surface, both
  portable without laziness.
- **Introspection-only inputs** carry no annotation channel; classification
  quality then depends entirely on profile + guide. Position: require a
  profile or a guide file rather than guessing on unrecognized schemas.

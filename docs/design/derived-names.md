# Derived names must survive their target languages

apidef derives identifiers from a specification: entity names from paths and
schemas, parameter names from path segments. Four ways that went wrong, each
found by a real vendor definition, each now guarded.

## A pluralised acronym is one word

`snakify` splits at the last capital before a lowercase, which is right for
`HTTPHeaders` and wrong for a trailing plural `s`: `StaticIPs` became
`static_i_ps`, and `depluralize` left `static_i_p`.

So checkly's `/v1/static-ips` canonized to `static_ip` while the name derived
for `StaticIPs` canonized to `static_i_p` — two entities for one resource. It
is general: `APIs` gave `ap_i`, `URLs` gave `ur_l`, `IDs` gave `i_d`.

`canonize` now lowercases the plural `s` into the acronym before the split. The
run must be two or more capitals and the `s` must end the word, so `APIKeys`
and `AWS` are untouched.

## Two names that differ only in case are one file

Generators name files after an entity's camel form, and APFS and NTFS treat
`OptOutEntity.ts` and `OptoutEntity.ts` as the same file.

Customer.io's App API produced `opt_out` (from the schema) and `optout` (from
the `/v1/optouts` path segment) for one resource, and `tsc` refused to compile:
*"File name ... differs from already included file name ... only in casing."*
apidef's own flow files hit the quieter version of this — the second write
replaced the first and the model came out with one flow fewer than it had
entities, surfacing much later as a missing `main.kit.flow.*` path.

Names that collide this way almost always name one resource twice: once from
a schema, which keeps the word boundary, and once from a path segment, which
has lost it. The guide stage merges them (`mergeFoldedEntities`, after
`mergeCollectionPaths`): every active entity whose name folds to the same key
(`foldName`: camel form, lowercased) hands its paths to the spelling with the
most words, then the lowest in code-point order, so `use_case` keeps them and
`usecase` is gone. The merged paths stay visible in the base guide, where
`guide.aontu` can move one back.

deduped's static JSON API shows why the collection merge alone is not enough:
`/usecases/{id}.json` is named for its `UseCase` schema and `/usecases.json`
for its segment, and the `.json` suffix hides from `mergeCollectionPaths` that
one is the item of the other. Left apart, sdkgen renamed `usecase` to
`usecase2` in the model it generates from, so every README and class said
`Usecase2` while the model on disk still said `usecase`, and the publishing
gate, which reads that model, called the entity a phantom. A rule applied
after apidef cannot reach everything that reads apidef's output.

The merge is refused when the two hold the same operation on the same path,
since one of them would be lost, and an inactive entity takes no part, so a
merge cannot undo a deactivation. `casecollideTransform` then sees the pair:
it drops a colliding entity that carries no operations, logging the drop, and
where both carry operations it warns instead, because dropping either would
silently remove operations from the SDK, which is worse than a build that
fails loudly.

Flow file names are disambiguated positionally, because `snakify` does not
separate the pair either.

## A derived parameter name must be an identifier

An id parameter is renamed to `<parent-segment>_id`, on the assumption that the
parent segment names the resource that owns it. HubSpot versions its paths by
date, so the parent of the id in
`/marketing/campaigns/2026-09/{campaignGuid}/assets/{assetType}` is a date, and
the rename produced a name beginning with a digit. The generated TypeScript
carried it as an object key and would not parse.

`updateParamRename` rejects a name that cannot be an identifier and keeps the
one the specification gave. Guarded there rather than at the call sites,
because several derive from the same path text.

## Two parameters of one path must not share a name

A path can carry two parameters that end up wanting the same name.
`/crm/lists/2026-09/records/{objectTypeId}/{recordId}/memberships` renamed
`objectTypeId` to the same name `recordId` canonizes to, and the generated path
repeated one parameter — one value substituted into two positions, so the SDK
asked for a URL that does not exist.

The clash is with what the other parameters of the path END UP CALLED: their
rename if they have one, their own canonical name if they do not. Checking only
the renames left this case broken.

### What this says about the generated tests

That defect was caught by one assertion in the whole suite — the `direct-list`
test, which asserts `calls[0].url`. Every other generated test asserts the
mock's response, which comes back whatever URL is asked for, so the SDK passed
610 of 611 tests while being unable to work.

Colon-style path parameters (`/projects/:slug`, which Stytch's Management API
uses throughout) were invisible for the same reason until that one assertion
fired.

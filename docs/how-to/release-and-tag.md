# How to release and tag

apidef ships **two artifacts from one repository**, and they release by
different mechanisms:

| artifact | source of the version | released by | tag |
| --- | --- | --- | --- |
| npm `@voxgig/apidef` | `ts/package.json` `"version"` | publishing to the registry | `v<version>` |
| Go `github.com/voxgig/apidef/go` | `go/apidef.go` `const VERSION` | **the tag itself** | `go/v<version>` |

That second row is the one that surprises people. A Go module has no
registry upload step: `proxy.golang.org` serves whatever a tag points at, so
**pushing the tag *is* the release**. There is nothing else to do, and
nothing to undo it.

## The normal path

One dispatch does everything:

**Actions → release → Run workflow**, on `main`, with `npm` and `go` ticked
as needed. That single run publishes to npm and pushes both tags.

The equivalent from a shell:

```sh
gh workflow run release.yml --ref main -f npm=true -f go=true
```

Bump the versions **first**, in a normal reviewed PR. The workflow never
commits — it reads what is already on `main` and releases exactly that, so
the bump stays a diff someone approved and the release stays a button.

```sh
# ts/package.json  "version": "7.2.0"
# go/apidef.go     const VERSION = "0.2.2"
```

Release only the half that changed. A TypeScript-only change needs
`npm=true, go=false`; leaving `go=true` with an unchanged `VERSION` is
harmless — the workflow refuses rather than moving an existing tag.

## Why it is one workflow and not two

Two separate credentials are in play, and conflating them is the usual
mistake.

**OIDC cannot create a tag.** Trusted publishing exchanges a GitHub-issued
OIDC token for a short-lived credential *at npm* — its audience is the
registry, and it grants publish rights on a package. Writing a git ref is a
GitHub operation under a different authority: the per-run `GITHUB_TOKEN`,
with `permissions: contents: write`. Same trust model — short-lived, scoped
to one run, no stored secret — but it has to be asked for. `publish.yml`
deliberately keeps `contents: read` and therefore cannot tag.

**A ref pushed with `GITHUB_TOKEN` does not start another workflow run.**
GitHub suppresses that so workflows cannot trigger themselves. So the
tempting design — tag in one workflow, let `publish.yml` fire on the `v*`
tag — publishes **nothing, silently**. Hence one job that publishes and then
tags.

## What the workflow refuses to do

Guards that fail closed, in the order they run:

1. **A tag that already exists.** Means the version was not bumped.
   Re-releasing would either be refused later or move a published tag, so it
   stops here.
2. **A failing build, test, or `make check-model`.** The Go half additionally
   builds and tests `go/` — `build.yml` does **not** cover Go on pushes or
   PRs, so this release gate is the only automated check standing between a
   Go change and a tagged module.

And one guard that fails *open*, on purpose:

3. **A version already on npm** is published-checked, not assumed. The
   registry is the source of truth for "is this released", not the tag —
   `publish.yml` can publish *without* tagging, leaving a version on npm with
   no tag pointing at it. Without this check that state is unrecoverable: the
   publish step dies on `cannot publish over the previously published
   versions` before ever reaching the tag step. So the workflow publishes only
   what is missing and tags either way, which makes a dispatch idempotent and
   able to reconcile a half-finished release.

Publishing happens **before** tagging, so a tag only ever exists for a
release that actually reached the registry. A failed publish writes no tag,
and the dispatch can simply be re-run.

## If something goes wrong

**The run failed at the tag step.** The publish succeeded; only the ref
write did not. Re-dispatch — the registry check skips the completed publish
and retries the tag. If it fails again, a tag protection rule is refusing
`GITHUB_TOKEN`, and that is a repository settings fix, not a workflow one.

**The version is on npm but untagged.** Same remedy: re-dispatch. This is
exactly the case guard 3 exists for.

**A tag was pushed pointing at the wrong commit.** For the Go module, assume
it is permanent. `proxy.golang.org` caches module versions immutably and by
design, so deleting and re-pushing a `go/vX.Y.Z` tag does **not** change what
consumers resolve. Do not try to fix a Go tag in place — bump to the next
patch version and tag that instead.

**npm refuses the publish.** That version already exists. npm does not allow
republishing a version, ever. Bump and re-release.

## The manual path, and why to avoid it

`publish.yml` still triggers on a pushed `v*` tag, so a human pushing a tag
by hand publishes the npm package. It does not tag the Go module, and it
cannot — `contents: read`.

`make publish-go V=x.y.z` rewrites `const VERSION`, commits, tags and pushes
in one step. It works, but it commits straight to `main` from a developer
machine, which is precisely what the workflow exists to avoid.

Neither path can double-publish: npm refuses an existing version, which is a
safe way to fail.

## Registering the trusted publisher — read this before the first release

**npm's trusted publisher is registered against a workflow *filename*, not a
repository.** A trusted publisher entry names owner, repo, and the workflow
file allowed to publish. `publish.yml` is the historically registered one.

So `release.yml` can only publish once it is **also** registered on
npmjs.com, under the package's *Settings → Trusted publishers*. Until then
its publish step is rejected by npm even though the OIDC token itself is
perfectly valid — the token simply does not match a registered publisher.

The same trap catches a rename: moving or renaming a publishing workflow
breaks publishing until the npm-side entry is updated to match.

If `release.yml` is not registered and you need the release out now, the two
workflows compose, because of guard 3 above:

```sh
# 1. publish via the registered workflow
gh workflow run publish.yml --ref main

# 2. then tag — the registry check sees the version is already
#    published, skips the publish step, and writes both tags
gh workflow run release.yml --ref main -f npm=true -f go=true
```

Never run `npm run repo-publish` locally: it publishes over a token and
bypasses OIDC entirely.

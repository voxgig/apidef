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

**Actions → publish → Run workflow**, on `main`, leaving `go` ticked unless
only the npm package changed. That single run publishes to npm and pushes
both tags.

The equivalent from a shell:

```sh
gh workflow run publish.yml --ref main -f go=true
```

**There is no version input, deliberately.** The dispatch releases whatever
the ref already says, so bump the versions **first**, in a normal reviewed PR:

```sh
# ts/package.json  "version": "7.2.1"
# go/apidef.go     const VERSION = "0.2.2"
```

A version input would let the dispatch and the files disagree — you would tag
`v7.3.0` on a package that says `7.2.0`. Reading from the files makes that
impossible by construction, and keeps the bump a diff someone approved while
the release stays a button.

Release only the half that changed. A TypeScript-only change wants
`go=false`; leaving it ticked with an unchanged `VERSION` is harmless — the
workflow refuses rather than moving an existing tag.

## Why publishing and tagging live in the same file

**npm allows exactly one workflow file per trusted publisher.** The entry
registered on npmjs.com names owner, repo, and a single workflow *filename*.
There is no second slot.

The *name* is arbitrary — the `tabnas` repositories register `release.yml`
and publish from it perfectly well; every `@voxgig` package registers
`publish.yml`. What matters is that **only the registered file can publish**.
So anything that must accompany a publish — here, the tags — has to live
inside that one file rather than in a workflow of its own.

Splitting them was tried here, and it fails in a way worth recognising. An
OIDC token from an unregistered workflow is rejected, and npm reports it as:

```
npm error 404 Not Found - PUT https://registry.npmjs.org/@voxgig%2fapidef
npm error 404  The requested resource '@voxgig/apidef@7.2.0' could not be
               found or you do not have permission to access it.
```

Read literally that says the package does not exist, which is nonsense — npm
answers an unregistered publisher with **404 rather than 403** so as not to
leak whether a package exists. Expect to lose an hour to the wrong hypothesis
unless you know this.

Renaming the registered file breaks publishing until the npm-side entry is
updated to match.

### Two credentials, easily conflated

Both are needed, and neither can do the other's job:

| permission | authority | does |
| --- | --- | --- |
| `id-token: write` | OIDC, exchanged for a short-lived credential *at npm* | publishes |
| `contents: write` | the per-run `GITHUB_TOKEN` | writes tags |

OIDC **cannot create a tag** — its audience is the registry, not GitHub.
`GITHUB_TOKEN` is the same trust model worth liking about OIDC (short-lived,
scoped to one run, no stored secret), just aimed at GitHub; it only has to be
asked for.

**They live in separate jobs, and that separation is load-bearing.** The
`publish` job runs `npm ci`, the build and the tests — dependency lifecycle
scripts and project code — and keeps `contents: read`. The `tag` job runs git
and nothing else, and is the only place `contents: write` exists. In one job
they would share a credential: `checkout` persists its token into the git
config for the whole job, so every dependency `postinstall` executed during
`npm ci` would be running alongside a repository-write credential it has no
business having.

And a second reason the two cannot be split across workflows: **a ref pushed
with `GITHUB_TOKEN` does not start another workflow run.** GitHub suppresses
that so workflows cannot trigger themselves. So "tag in workflow A, let the
publisher fire on the `v*` tag" publishes **nothing, silently**.

## What the workflow refuses to do

Guards that fail closed, in the order they run:

1. **A tag that already exists *on a different commit*.** Means the version
   was not bumped, and moving it would rewrite a published release. A tag
   already pointing at **this** commit is the idempotent case — nothing to
   create, not an error — which is what makes re-dispatching after a partial
   release safe. Checked only on the dispatch path.
2. **A pushed tag that disagrees with the package version.** On the manual
   `v*` path only: pushing `v7.3.0` while `ts/package.json` still says
   `7.2.0` would resolve 7.2.0, find it already published, skip the publish
   and go green — leaving a tag with no release behind it.
3. **A failing build, test, or `make check-model`.** The Go half additionally
   builds and tests `go/` — `build.yml` does **not** cover Go on pushes or
   PRs, so this release gate is the only automated check standing between a
   Go change and a tagged module.

And one guard that fails *open*, on purpose:

4. **A version already on npm** is checked, not assumed. The registry is the
   source of truth for "is this released", not the tag: a run can publish and
   then fail before tagging, leaving a version on npm with nothing pointing at
   it. Without this check that state is unrecoverable — the publish step dies
   on `cannot publish over the previously published versions` before reaching
   the tag steps. Publishing only what is missing, and tagging either way,
   makes a dispatch idempotent and able to reconcile a half-finished release.

Publishing happens **before** tagging, so a tag only ever exists for a
release that actually reached the registry. A failed publish writes no tag,
and the dispatch can simply be re-run.

## If something goes wrong

**The run failed at the tag step.** The publish succeeded; only the ref write
did not. Re-dispatch — the registry check skips the completed publish and
retries the tag. If it fails again, a tag protection rule is refusing
`GITHUB_TOKEN`, and that is a repository settings fix, not a workflow one.
(`GITHUB_TOKEN` is known to be able to push tags in this repo: it wrote
`v7.2.0` and `go/v0.2.2`.)

**The version is on npm but untagged.** Same remedy: re-dispatch. This is
exactly the case guard 4 exists for.

**A tag was pushed pointing at the wrong commit.** For the Go module, assume
it is permanent. `proxy.golang.org` caches module versions immutably and by
design, so deleting and re-pushing a `go/vX.Y.Z` tag does **not** change what
consumers resolve. Do not try to fix a Go tag in place — bump to the next
patch version and tag that instead.

**npm refuses the publish.** That version already exists. npm does not allow
republishing a version, ever. Bump and re-release.

## The manual paths, and why to prefer the button

Pushing a `v*` tag by hand still triggers `publish.yml`, which publishes the
npm package. It does **not** tag the Go module — the tag steps are skipped on
that path, because the `v*` tag already exists and nothing has told the run to
create the Go one.

`make publish-go V=x.y.z` rewrites `const VERSION`, commits, tags and pushes
in one step — and it is sharper than it looks. It commits to whatever branch
is **currently checked out**, tags that commit, then runs
`git push origin main go/vX.Y.Z`. Run from a feature branch it therefore
publishes an immutable Go module version pointing at unreviewed code, while
pushing a `main` that does not contain that commit at all.

The target now refuses unless you are on `main`, with a clean tree, not behind
`origin/main`. Prefer the dispatch anyway: it runs the tests and the guards,
and it never commits.

Neither path can double-publish: npm refuses an existing version, which is a
safe way to fail.

Never run `npm run repo-publish` locally: it publishes over a token and
bypasses OIDC entirely.

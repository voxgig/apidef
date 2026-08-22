.PHONY: all build test clean build-ts build-go test-ts test-go clean-ts clean-go \
        publish publish-go check-go-major tags-go reset sync-model check-model

all: check-model build test

build: build-ts build-go

test: test-ts test-go

clean: clean-ts clean-go

# Shared aontu model. Canonical copies live at model/; each packaging system
# can only ship files under its own root, so they are mirrored into ts/model/
# (npm) and go/model/ (go:embed). Edit model/, then `make sync-model`.
MODEL_FILES = apidef.aon guide.aon

sync-model:
	@for f in $(MODEL_FILES); do \
	  cp model/$$f ts/model/$$f; \
	  cp model/$$f go/model/$$f; \
	done
	@echo "synced model/ -> ts/model/, go/model/"

check-model:
	@for f in $(MODEL_FILES); do \
	  cmp -s model/$$f ts/model/$$f || { echo "DRIFT: ts/model/$$f != model/$$f (run: make sync-model)"; exit 1; }; \
	  cmp -s model/$$f go/model/$$f || { echo "DRIFT: go/model/$$f != model/$$f (run: make sync-model)"; exit 1; }; \
	done
	@echo "model mirrors in sync"

# TypeScript
build-ts:
	cd ts && npm run build

test-ts:
	cd ts && npm test

clean-ts:
	rm -rf ts/dist ts/dist-test

# Go
build-go:
	cd go && go build ./...

test-go:
	cd go && go test -v ./...

clean-go:
	cd go && go clean


# ONE COMMAND, BOTH ARTIFACTS — WITH THEIR OWN VERSION SERIES.
#
#   make publish V=7.3.0 GOV=0.2.3   # release both
#   make publish V=7.3.0             # npm only
#   make publish GOV=0.2.3           # Go module only
#
# npm and the Go module are versioned independently, deliberately: sharing a
# major would put the Go module at v2+, and Go requires the major in the
# module path from v2 on (see check-go-major), which changes every consumer's
# import path. Two numbers is the cheaper trade.
#
# Bumps whichever versions are given, runs the full suite, commits, pushes
# main, and dispatches the publish workflow with matching inputs.
#
# Every guard runs BEFORE anything is written, because half of this cannot be
# taken back: npm never allows republishing a version, and proxy.golang.org
# caches a Go module version immutably.
publish:
	@test -n "$(V)$(GOV)" || \
	  (echo "Usage: make publish [V=x.y.z] [GOV=x.y.z]   (npm version, Go module version)" && exit 1)
	@if [ -n "$(V)" ]; then \
	  echo "$(V)" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$$' || \
	    { echo "publish: V=$(V) is not a semver x.y.z (build metadata is not accepted)"; exit 1; }; \
	  case "$(V)" in *+*) echo "publish: V=$(V) carries +build metadata, which npm discards"; exit 1 ;; esac; \
	fi
	@if [ -n "$(GOV)" ]; then \
	  echo "$(GOV)" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$$' || \
	    { echo "publish: GOV=$(GOV) is not a semver x.y.z (build metadata is not accepted)"; exit 1; }; \
	  case "$(GOV)" in *+*) echo "publish: GOV=$(GOV) carries +build metadata, which npm discards"; exit 1 ;; esac; \
	  $(MAKE) --no-print-directory check-go-major V=$(GOV); \
	fi
	@command -v gh >/dev/null 2>&1 || \
	  (echo "publish: needs the gh CLI to dispatch the workflow" && exit 1)
	@test "$$(git rev-parse --abbrev-ref HEAD)" = "main" || \
	  (echo "publish: must be on main (currently $$(git rev-parse --abbrev-ref HEAD))" && exit 1)
	@test -z "$$(git status --porcelain)" || \
	  (echo "publish: working tree is not clean" && exit 1)
	@git fetch origin main --quiet && test -z "$$(git rev-list HEAD..origin/main)" || \
	  (echo "publish: local main is behind origin/main" && exit 1)
	@# ASK THE REMOTE, NOT THE CLONE. `git fetch origin main` does not fetch
	@# tags, so a local rev-parse passes in a fresh or stale clone while the
	@# tag already exists on origin — and by the time the workflow refuses,
	@# this target has already bumped and pushed main.
	@if [ -n "$(V)" ] && git ls-remote --exit-code --tags origin "refs/tags/v$(V)" >/dev/null 2>&1; then \
	  echo "publish: tag v$(V) already exists on origin"; exit 1; fi
	@if [ -n "$(GOV)" ] && git ls-remote --exit-code --tags origin "refs/tags/go/v$(GOV)" >/dev/null 2>&1; then \
	  echo "publish: tag go/v$(GOV) already exists on origin"; exit 1; fi
	@if [ -n "$(V)" ] && git rev-parse -q --verify "refs/tags/v$(V)" >/dev/null 2>&1; then \
	  echo "publish: tag v$(V) already exists locally"; exit 1; fi
	@if [ -n "$(GOV)" ] && git rev-parse -q --verify "refs/tags/go/v$(GOV)" >/dev/null 2>&1; then \
	  echo "publish: tag go/v$(GOV) already exists locally"; exit 1; fi
	@if [ -n "$(V)" ]; then cd ts && npm version --no-git-tag-version $(V); fi
	@if [ -n "$(GOV)" ]; then \
	  perl -pi -e 's/^const VERSION = ".*"/const VERSION = "$(GOV)"/' go/apidef.go; \
	  grep -q '^const VERSION = "$(GOV)"' go/apidef.go || \
	    { echo "publish: failed to set VERSION in go/apidef.go"; exit 1; }; \
	fi
	$(MAKE) all
	@if [ -n "$(V)" ];   then git add ts/package.json ts/package-lock.json; fi
	@if [ -n "$(GOV)" ]; then git add go/apidef.go; fi
	git commit -m "release:$(if $(V), npm $(V))$(if $(GOV), go $(GOV))"
	git push origin main
	@# `--ref main` is a MOVING target: another commit can land between the
	@# push above and the run resolving, and be released under the version
	@# just bumped. Pin the dispatch to the SHA we pushed.
	gh workflow run publish.yml --ref main \
	  -f npm=$(if $(V),true,false) -f go=$(if $(GOV),true,false) \
	  -f expect_sha=$$(git rev-parse HEAD)
	@echo
	@echo "dispatched. watch with:  gh run list --workflow=publish.yml --limit 1"

# Go's semantic import versioning: from v2 on, the MAJOR must appear in the
# module path. Tagging go/v7.3.0 while go.mod still says
# `module github.com/voxgig/apidef/go` produces a version the toolchain will
# not resolve — and the tag cannot be taken back. Refuse instead.
check-go-major:
	@test -n "$(V)" || (echo "Usage: make check-go-major V=x.y.z" && exit 1)
	@major=$$(echo "$(V)" | cut -d. -f1); \
	 path=$$(sed -n 's/^module //p' go/go.mod); \
	 if [ "$$major" -ge 2 ]; then \
	   case "$$path" in \
	     */v$$major) : ;; \
	     *) echo "publish: go.mod says '$$path' but v$(V) is major $$major."; \
	        echo "         Go requires the major in the module path from v2 on:"; \
	        echo "           module $$path/v$$major"; \
	        echo "         Every consumer's import path changes with it."; \
	        exit 1 ;; \
	   esac; \
	 else \
	   case "$$path" in \
	     */v[0-9]*) echo "publish: go.mod path '$$path' carries a major suffix but V=$(V) is major $$major." && exit 1 ;; \
	     *) : ;; \
	   esac; \
	 fi

# Publish Go module: make publish-go V=0.1.1
publish-go: test-go
	@test -n "$(V)" || (echo "Usage: make publish-go V=x.y.z" && exit 1)
	@# BRANCH AND CLEANLINESS GUARDS, checked before anything is written.
	@#
	@# This target commits to the CURRENT branch, tags THAT commit, and then
	@# pushes `main` plus the tag. Run from a feature branch it therefore tags
	@# unreviewed code and publishes it as an immutable Go module version,
	@# while pushing a `main` that does not contain the commit at all — a
	@# module release nobody reviewed, which proxy.golang.org will then cache
	@# forever. Prefer the publish workflow; if you must use this, be on main.
	@test "$$(git rev-parse --abbrev-ref HEAD)" = "main" || \
	  (echo "publish-go: must be on main (currently $$(git rev-parse --abbrev-ref HEAD))" && exit 1)
	@test -z "$$(git status --porcelain)" || \
	  (echo "publish-go: working tree is not clean" && exit 1)
	@git fetch origin main --quiet && test -z "$$(git rev-list HEAD..origin/main)" || \
	  (echo "publish-go: local main is behind origin/main" && exit 1)
	@# Portable in-place edit: `sed -i ''` is BSD/macOS only and fails on GNU
	@# sed, which reads '' as the script. It failed silently here before — the
	@# constant said 0.1.2 while go/v0.1.3 was already tagged. The grep below
	@# stops a release whose VERSION constant did not actually get rewritten.
	perl -pi -e 's/^const VERSION = ".*"/const VERSION = "$(V)"/' go/apidef.go
	@grep -q '^const VERSION = "$(V)"' go/apidef.go || \
	  (echo "publish-go: failed to set VERSION in go/apidef.go" && exit 1)
	git add go/apidef.go
	git commit -m "go: v$(V)"
	git tag go/v$(V)
	git push origin main go/v$(V)
	if command -v gh >/dev/null 2>&1; then gh release create go/v$(V) --title "go/v$(V)" --notes "Go module release v$(V)"; fi

tags-go:
	git tag -l 'go/v*' --sort=-version:refname

reset:
	cd ts && npm run reset
	cd go && go clean -cache
	cd go && go build ./...
	cd go && go test -v ./...

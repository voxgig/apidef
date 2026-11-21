/* Copyright (c) 2026 Voxgig, MIT License */

package apidef

import (
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"
)

func foldRoutes(entities map[string]any) map[string][]string {
	out := map[string][]string{}
	for _, name := range sortedKeys(entities) {
		entity, _ := entities[name].(map[string]any)
		paths, _ := entity["path"].(map[string]any)
		routes := []string{}
		for _, path := range sortedKeys(paths) {
			pd, _ := paths[path].(map[string]any)
			ops, _ := pd["op"].(map[string]any)
			for _, op := range sortedKeys(ops) {
				routes = append(routes, op+" "+path)
			}
		}
		sort.Strings(routes)
		out[name] = routes
	}
	return out
}

func foldEntity(name string, paths map[string][]string, active any) map[string]any {
	pm := map[string]any{}
	for path, ops := range paths {
		om := map[string]any{}
		for _, op := range ops {
			om[op] = map[string]any{"method": "GET"}
		}
		pm[path] = map[string]any{"op": om}
	}
	entity := map[string]any{"name": name, "path": pm}
	if active != nil {
		entity["active"] = active
	}
	return entity
}

// Mirrors the TS `guide-fold-merge` case, and requires the base guide that
// case writes to ts/test/fold-merge/guide/base-guide.aontu.
func TestGuideFoldMerge(t *testing.T) {
	folder := stageGuideEntry(t, t.TempDir(), "")
	res, err := NewApiDef(ApiDefOptions{Folder: folder, Strategy: "heuristic01"}).Generate(map[string]any{
		"model": map[string]any{"name": "fold-merge", "def": "fold-merge-def.json"},
		"build": map[string]any{"spec": map[string]any{"base": "../ts/test/fold-merge"}},
		"ctrl": map[string]any{"step": map[string]any{
			"parse": true, "guide": true, "transformers": true,
			"builders": false, "generate": false,
		}},
	})
	if err != nil || res == nil || !res.OK {
		t.Fatalf("generate failed: err=%v res=%+v", err, res)
	}

	gents, _ := res.Guide["entity"].(map[string]any)
	want := map[string][]string{
		"repo":     {"list /repos.json"},
		"use_case": {"list /usecases.json", "load /usecases/{id}.json"},
	}
	if got := foldRoutes(gents); !reflect.DeepEqual(got, want) {
		t.Errorf("guide routes = %v, want %v", got, want)
	}
	main, _ := res.ApiModel["main"].(map[string]any)
	kit, _ := main[KIT].(map[string]any)
	entities, _ := kit["entity"].(map[string]any)
	if got := strings.Join(sortedKeys(entities), ","); got != "repo,use_case" {
		t.Errorf("model entities = %s, want repo,use_case", got)
	}

	wantSrc, err := os.ReadFile("../ts/test/fold-merge/guide/base-guide.aontu")
	if err != nil {
		t.Fatal(err)
	}
	gotSrc, err := os.ReadFile(filepath.Join(folder, "guide", "base-guide.aontu"))
	if err != nil {
		t.Fatal(err)
	}
	if string(gotSrc) != string(wantSrc) {
		t.Errorf("base guide differs from the TypeScript one:\n%s", string(gotSrc))
	}
}

func TestMergeFoldedEntities(t *testing.T) {
	t.Run("the spelling with the most words keeps every path", func(t *testing.T) {
		guide := map[string]any{"entity": map[string]any{
			"usecase":  foldEntity("usecase", map[string][]string{"/usecases": {"list"}}, nil),
			"use_case": foldEntity("use_case", map[string][]string{"/usecases/{id}": {"load"}}, nil),
			"UseCase":  foldEntity("UseCase", map[string][]string{"/v2/usecases": {"list"}}, nil),
		}}
		if got := mergeFoldedEntities(guide); !reflect.DeepEqual(got, []string{"UseCase", "usecase"}) {
			t.Errorf("merged = %v", got)
		}
		want := map[string][]string{
			"use_case": {"list /usecases", "list /v2/usecases", "load /usecases/{id}"},
		}
		if got := foldRoutes(guide["entity"].(map[string]any)); !reflect.DeepEqual(got, want) {
			t.Errorf("routes = %v, want %v", got, want)
		}
	})

	t.Run("one operation on one path keeps both apart", func(t *testing.T) {
		guide := map[string]any{"entity": map[string]any{
			"opt_out": foldEntity("opt_out", map[string][]string{"/optouts": {"list"}}, nil),
			"optout": foldEntity("optout",
				map[string][]string{"/optouts": {"list"}, "/optouts/{id}": {"load"}}, nil),
		}}
		if got := mergeFoldedEntities(guide); len(got) != 0 {
			t.Errorf("merged = %v", got)
		}
		if got := strings.Join(sortedKeys(guide["entity"].(map[string]any)), ","); got != "opt_out,optout" {
			t.Errorf("entities = %s", got)
		}
	})

	t.Run("an inactive entity is left to guide.aontu", func(t *testing.T) {
		guide := map[string]any{"entity": map[string]any{
			"opt_out": foldEntity("opt_out", map[string][]string{"/optouts": {"list"}}, nil),
			"optout":  foldEntity("optout", map[string][]string{"/optouts/{id}": {"load"}}, false),
		}}
		if got := mergeFoldedEntities(guide); len(got) != 0 {
			t.Errorf("merged = %v", got)
		}
		if got := strings.Join(sortedKeys(guide["entity"].(map[string]any)), ","); got != "opt_out,optout" {
			t.Errorf("entities = %s", got)
		}
	})

	t.Run("names that fold apart are untouched", func(t *testing.T) {
		guide := map[string]any{"entity": map[string]any{
			"use":      foldEntity("use", map[string][]string{"/uses": {"list"}}, nil),
			"use_case": foldEntity("use_case", map[string][]string{"/usecases": {"list"}}, nil),
			"case":     foldEntity("case", map[string][]string{"/cases": {"list"}}, nil),
			"constructor": foldEntity("constructor",
				map[string][]string{"/constructors": {"list"}}, nil),
		}}
		if got := mergeFoldedEntities(guide); len(got) != 0 {
			t.Errorf("merged = %v", got)
		}
		if got := strings.Join(sortedKeys(guide["entity"].(map[string]any)), ","); got != "case,constructor,use,use_case" {
			t.Errorf("entities = %s", got)
		}
	})
}

func TestMergeCommandEntities(t *testing.T) {
	ops := func(name string, paths map[string][]string, active any) map[string]any {
		return foldEntity(name, paths, active)
	}
	actionsAt := func(guide map[string]any, ename string, path string) string {
		entity, _ := guide["entity"].(map[string]any)[ename].(map[string]any)
		paths, _ := entity["path"].(map[string]any)
		pd, _ := paths[path].(map[string]any)
		action, _ := pd["action"].(map[string]any)
		return strings.Join(sortedKeys(action), ",")
	}

	t.Run("a command joins the entity whose route it writes beneath", func(t *testing.T) {
		guide := map[string]any{"entity": map[string]any{
			"doc":              ops("doc", map[string][]string{"/api/doc": {"load"}}, nil),
			"mdconvert":        ops("mdconvert", map[string][]string{"/api/doc/mdconvert": {"create"}}, nil),
			"run":              ops("run", map[string][]string{"/runs/{run_id}": {"load"}}, nil),
			"rerun_failed_job": ops("rerun_failed_job", map[string][]string{"/runs/{run_id}/rerun-failed-jobs": {"create"}}, nil),
		}}
		entities := guide["entity"].(map[string]any)
		entities["run"].(map[string]any)["path"].(map[string]any)["/runs/{run_id}"].(map[string]any)["rename"] =
			map[string]any{"param": map[string]any{"run_id": map[string]any{"target": "id"}}}
		entities["rerun_failed_job"].(map[string]any)["path"].(map[string]any)["/runs/{run_id}/rerun-failed-jobs"].(map[string]any)["rename"] =
			map[string]any{"param": map[string]any{"run_id": map[string]any{"target": "run_id"}}}
		if got := mergeCommandEntities(guide); !reflect.DeepEqual(got, []string{"mdconvert", "rerun_failed_job"}) {
			t.Errorf("merged = %v", got)
		}
		want := map[string][]string{
			"doc": {"create /api/doc/mdconvert", "load /api/doc"},
			"run": {"create /runs/{run_id}/rerun-failed-jobs", "load /runs/{run_id}"},
		}
		if got := foldRoutes(entities); !reflect.DeepEqual(got, want) {
			t.Errorf("routes = %v, want %v", got, want)
		}
		if got := actionsAt(guide, "doc", "/api/doc/mdconvert"); got != "mdconvert" {
			t.Errorf("mdconvert actions = %s", got)
		}
		if got := actionsAt(guide, "run", "/runs/{run_id}/rerun-failed-jobs"); got != "rerun_failed_jobs" {
			t.Errorf("rerun actions = %s", got)
		}
		moved := entities["run"].(map[string]any)["path"].(map[string]any)["/runs/{run_id}/rerun-failed-jobs"].(map[string]any)
		param := moved["rename"].(map[string]any)["param"].(map[string]any)
		if target := param["run_id"].(map[string]any)["target"]; target != "id" {
			t.Errorf("run_id renames to %v, want id", target)
		}
	})

	t.Run("a command beneath another joins where that one went", func(t *testing.T) {
		guide := map[string]any{"entity": map[string]any{
			"package":       ops("package", map[string][]string{"/p/{id}/packages": {"list"}}, nil),
			"nuget":         ops("nuget", map[string][]string{"/p/{id}/packages/nuget": {"update"}}, nil),
			"symbolpackage": ops("symbolpackage", map[string][]string{"/p/{id}/packages/nuget/symbolpackage": {"update"}}, nil),
		}}
		if got := mergeCommandEntities(guide); !reflect.DeepEqual(got, []string{"nuget", "symbolpackage"}) {
			t.Errorf("merged = %v", got)
		}
		if got := strings.Join(sortedKeys(guide["entity"].(map[string]any)), ","); got != "package" {
			t.Errorf("entities = %s", got)
		}
		if got := actionsAt(guide, "package", "/p/{id}/packages/nuget/symbolpackage"); got != "symbolpackage" {
			t.Errorf("symbolpackage actions = %s", got)
		}
	})

	t.Run("commands on one route join together, a route another entity reads stays", func(t *testing.T) {
		guide := map[string]any{"entity": map[string]any{
			"story":             ops("story", map[string][]string{"/stories": {"create"}}, nil),
			"bulk":              ops("bulk", map[string][]string{"/stories/bulk": {"remove"}}, nil),
			"create_story":      ops("create_story", map[string][]string{"/stories/bulk": {"create"}}, nil),
			"branch":            ops("branch", map[string][]string{"/branches/{id}": {"load"}}, nil),
			"branch_protection": ops("branch_protection", map[string][]string{"/branches/{id}/protection": {"load"}}, nil),
			"protected_branch":  ops("protected_branch", map[string][]string{"/branches/{id}/protection": {"update"}}, nil),
		}}
		if got := mergeCommandEntities(guide); !reflect.DeepEqual(got, []string{"bulk", "create_story"}) {
			t.Errorf("merged = %v", got)
		}
		entities := guide["entity"].(map[string]any)
		if got := foldRoutes(entities)["story"]; !reflect.DeepEqual(got,
			[]string{"create /stories", "create /stories/bulk", "remove /stories/bulk"}) {
			t.Errorf("story routes = %v", got)
		}
		if got := actionsAt(guide, "story", "/stories/bulk"); got != "bulk" {
			t.Errorf("bulk actions = %s", got)
		}
		if got := strings.Join(sortedKeys(entities), ","); got != "branch,branch_protection,protected_branch,story" {
			t.Errorf("entities = %s", got)
		}
	})

	t.Run("a read, a key, a root route or an inactive entity is no command", func(t *testing.T) {
		guide := map[string]any{"entity": map[string]any{
			"thing":   ops("thing", map[string][]string{"/things/{id}": {"load"}}, nil),
			"view":    ops("view", map[string][]string{"/things/{id}/view": {"load"}}, nil),
			"part":    ops("part", map[string][]string{"/things/{id}/{part}": {"update"}}, nil),
			"disable": ops("disable", map[string][]string{"/disable": {"create"}}, nil),
			"archive": ops("archive", map[string][]string{"/things/{id}/archive": {"create"}}, false),
		}}
		if got := mergeCommandEntities(guide); len(got) != 0 {
			t.Errorf("merged = %v", got)
		}
		if got := strings.Join(sortedKeys(guide["entity"].(map[string]any)), ","); got != "archive,disable,part,thing,view" {
			t.Errorf("entities = %s", got)
		}
	})
}

/* Copyright (c) 2026 Voxgig Ltd, MIT License */

package apidef

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"
)

// Mirrors ts/test/def-routes.test.ts: the port reads every route of every
// OpenAPI test definition as test/def-routes.tsv records it.

var defRouteDefRE = regexp.MustCompile(`\.(json|ya?ml)$`)

func defRouteDefinitions(t *testing.T) []string {
	t.Helper()
	entries, err := os.ReadDir(filepath.Join("..", "ts", "test", "def"))
	if err != nil {
		t.Fatal(err)
	}
	defs := []string{}
	for _, entry := range entries {
		name := entry.Name()
		if defRouteDefRE.MatchString(name) && !strings.Contains(name, ".graphql.") {
			defs = append(defs, name)
		}
	}
	sort.Strings(defs)
	return defs
}

func defRouteTransform(transform any) string {
	clean := dropNilValues(transform)
	if m, ok := clean.(map[string]any); !ok || len(m) == 0 {
		return ""
	}
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(clean)
	return strings.TrimSuffix(buf.String(), "\n")
}

func dropNilValues(val any) any {
	switch v := val.(type) {
	case map[string]any:
		out := map[string]any{}
		for key, item := range v {
			if item != nil {
				out[key] = dropNilValues(item)
			}
		}
		return out
	case []any:
		out := make([]any, len(v))
		for i, item := range v {
			out[i] = dropNilValues(item)
		}
		return out
	}
	return val
}

func defRoutes(t *testing.T, def string) map[string]string {
	t.Helper()
	folder := stageGuideEntry(t, t.TempDir(), "")
	res, err := NewApiDef(ApiDefOptions{Folder: folder, Strategy: "heuristic01"}).Generate(map[string]any{
		"model": map[string]any{"name": "routes", "def": def},
		"build": map[string]any{"spec": map[string]any{"base": "../ts/test/rulings"}},
		"ctrl": map[string]any{"step": map[string]any{
			"parse": true, "guide": true, "transformers": false,
			"builders": false, "generate": false,
		}},
	})
	if err != nil || res == nil || !res.OK {
		t.Fatalf("%s: generate failed: err=%v", def, err)
	}
	out := map[string]string{}
	entities, _ := res.Guide["entity"].(map[string]any)
	for _, ename := range sortedKeys(entities) {
		ent, _ := entities[ename].(map[string]any)
		active := "true"
		if b, ok := ent["active"].(bool); ok && !b {
			active = "false"
		}
		paths, _ := ent["path"].(map[string]any)
		for _, path := range sortedKeys(paths) {
			gp, _ := paths[path].(map[string]any)
			actions, _ := gp["action"].(map[string]any)
			rename, _ := gp["rename"].(map[string]any)
			params, _ := rename["param"].(map[string]any)
			renames := []string{}
			for from, to := range params {
				if m, ok := to.(map[string]any); ok {
					to = m["target"]
				}
				renames = append(renames, from+"->"+safeStr(to))
			}
			sort.Strings(renames)
			ops, _ := gp["op"].(map[string]any)
			for _, opname := range sortedKeys(ops) {
				op, _ := ops[opname].(map[string]any)
				out[safeStr(op["method"])+" "+path] = strings.Join([]string{
					ename, active, opname, strings.Join(sortedKeys(actions), ","),
					strings.Join(renames, ","), defRouteTransform(op["transform"]),
				}, "\t")
			}
		}
	}
	return out
}

func TestDefRoutes(t *testing.T) {
	table := map[string]map[string]string{}
	for _, row := range loadTsv(t, "def-routes") {
		def := row["def"]
		if table[def] == nil {
			table[def] = map[string]string{}
		}
		table[def][row["route"]] = strings.Join([]string{
			row["entity"], row["active"], row["op"], row["actions"], row["renames"], row["transform"],
		}, "\t")
	}

	defs := defRouteDefinitions(t)
	known := map[string]bool{}
	for _, def := range defs {
		known[def] = true
	}
	for def := range table {
		if !known[def] {
			t.Errorf("test/def-routes.tsv has rows for %s, which is gone: make def-routes", def)
		}
	}

	for _, def := range defs {
		t.Run(def, func(t *testing.T) {
			got := defRoutes(t, def)
			want := table[def]
			for _, route := range sortedKeys(toAnyMap(want)) {
				if got[route] != want[route] {
					t.Errorf("%s\n  go:    %q\n  table: %q", route, got[route], want[route])
				}
			}
			for _, route := range sortedKeys(toAnyMap(got)) {
				if _, ok := want[route]; !ok {
					t.Errorf("%s\n  go:    %q\n  table: (none)", route, got[route])
				}
			}
		})
	}
}

func toAnyMap(m map[string]string) map[string]any {
	out := make(map[string]any, len(m))
	for k, v := range m {
		out[k] = v
	}
	return out
}

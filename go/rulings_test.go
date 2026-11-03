/* Copyright (c) 2026 Voxgig Ltd, MIT License */

package apidef

import (
	"strings"
	"testing"
)

// Mirrors ts/test/rulings.test.ts: each fixture shows one ruling on the
// manual corpus, and the port must classify it as the TypeScript guide does.

// The entity and operation of each route, keyed `METHOD path`.
func rulingOwners(guide map[string]any) map[string]string {
	out := map[string]string{}
	entities, _ := guide["entity"].(map[string]any)
	for _, ename := range sortedKeys(entities) {
		ent, _ := entities[ename].(map[string]any)
		paths, _ := ent["path"].(map[string]any)
		for _, p := range sortedKeys(paths) {
			gp, _ := paths[p].(map[string]any)
			ops, _ := gp["op"].(map[string]any)
			actions, _ := gp["action"].(map[string]any)
			names := sortedKeys(actions)
			for _, opname := range sortedKeys(ops) {
				op, _ := ops[opname].(map[string]any)
				owner := ename + " " + opname
				if 0 < len(names) {
					owner += " " + strings.Join(names, ",")
				}
				out[safeStr(op["method"])+" "+p] = owner
			}
		}
	}
	return out
}

func TestRulings(t *testing.T) {
	rulings := []struct {
		def    string
		expect map[string]string
	}{
		{
			def: "tag-noun-def.json",
			expect: map[string]string{
				"GET /folders/":                               "folder list",
				"POST /folders/":                              "folder create",
				"GET /folders/{folder_id}":                    "folder load",
				"DELETE /folders/{folder_id}":                 "folder remove",
				"GET /reference-data/locations/pois/{poisId}": "poi load",
				"GET /{id}":                                   "thing load",
			},
		},
		{
			def: "wrapper-cmp-def.json",
			expect: map[string]string{
				"GET /templates":           "template list",
				"POST /templates":          "template create",
				"GET /templates/{id}":      "template load",
				"DELETE /templates/{id}":   "template remove",
				"GET /templates/{id}/file": "template_file load",
			},
		},
		{
			def: "key-param-def.json",
			expect: map[string]string{
				"GET /b":                     "bucket list",
				"POST /b":                    "bucket create",
				"GET /b/{bucket}":            "bucket load",
				"PATCH /b/{bucket}":          "bucket patch",
				"DELETE /b/{bucket}":         "bucket remove",
				"GET /b/{bucket}/o":          "object list",
				"GET /b/{bucket}/o/{object}": "object load",
			},
		},
		{
			def: "placeholder-ext-def.json",
			expect: map[string]string{
				"GET /lists.{format}":       "list list",
				"GET /lists/names.{format}": "name list",
				"GET /reviews.{format}":     "review list",
			},
		},
	}

	for _, ruling := range rulings {
		t.Run(ruling.def, func(t *testing.T) {
			folder := stageGuideEntry(t, t.TempDir(), "")
			res, err := NewApiDef(ApiDefOptions{Folder: folder, Strategy: "heuristic01"}).Generate(map[string]any{
				"model": map[string]any{"name": "rulings", "def": ruling.def},
				"build": map[string]any{"spec": map[string]any{"base": "../ts/test/rulings"}},
				"ctrl": map[string]any{"step": map[string]any{
					"parse": true, "guide": true, "transformers": false,
					"builders": false, "generate": false,
				}},
			})
			if err != nil || res == nil || !res.OK {
				t.Fatalf("generate failed: err=%v res=%+v", err, res)
			}
			got := rulingOwners(res.Guide)
			for route, want := range ruling.expect {
				if got[route] != want {
					t.Errorf("%s = %q, want %q", route, got[route], want)
				}
			}
		})
	}
}

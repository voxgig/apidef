/* Copyright (c) 2026 Voxgig Ltd, MIT License */

package apidef

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

// Mirrors ts/test/array-body.test.ts: the same expectations, and the base
// guide that case writes to ts/test/array-body/guide/.
func TestArrayBody(t *testing.T) {
	folder := t.TempDir()
	entry, err := os.ReadFile("../ts/test/array-body/guide/guide.aontu")
	if err != nil {
		t.Fatal(err)
	}
	if err := writeGuideEntry(folder, "", string(entry)); err != nil {
		t.Fatal(err)
	}
	res, err := NewApiDef(ApiDefOptions{Folder: folder, Strategy: "heuristic01"}).Generate(map[string]any{
		"model": map[string]any{"name": "array-body", "def": "array-body-def.json"},
		"build": map[string]any{"spec": map[string]any{"base": "../ts/test/array-body"}},
		"ctrl": map[string]any{"step": map[string]any{
			"parse": true, "guide": true, "transformers": true,
			"builders": false, "generate": false,
		}},
	})
	if err != nil || res == nil || !res.OK {
		t.Fatalf("generate failed: err=%v res=%+v", err, res)
	}

	want, err := os.ReadFile("../ts/test/array-body/guide/base-guide.aontu")
	if err != nil {
		t.Fatal(err)
	}
	got, err := os.ReadFile(filepath.Join(folder, "guide", "base-guide.aontu"))
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != string(want) {
		t.Errorf("base guide differs from the TypeScript one:\n%s", string(got))
	}

	var expected struct {
		Points []string                             `json:"points"`
		Fields map[string]map[string]map[string]any `json:"fields"`
	}
	src, err := os.ReadFile("../ts/test/array-body/expected.json")
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(src, &expected); err != nil {
		t.Fatal(err)
	}

	main, _ := res.ApiModel["main"].(map[string]any)
	kit, _ := main[KIT].(map[string]any)
	entities, _ := kit["entity"].(map[string]any)
	points := []string{}
	fields := map[string]map[string]map[string]any{}
	for _, ename := range sortedKeys(entities) {
		ent, _ := entities[ename].(map[string]any)
		ops, _ := ent["op"].(map[string]any)
		for _, opname := range sortedKeys(ops) {
			mop, _ := ops[opname].(map[string]any)
			list, _ := mop["points"].([]any)
			for _, pt := range list {
				ptm, _ := pt.(map[string]any)
				q, _ := ptm["q"].(map[string]any)
				exist := []string{}
				ev, _ := q["exist"].([]any)
				for _, e := range ev {
					exist = append(exist, e.(string))
				}
				action, _ := q["$action"].(string)
				tm, _ := ptm["t"].(map[string]any)
				req, _ := json.Marshal(tm["req"])
				points = append(points, ename+"."+opname+" "+ptm["m"].(string)+" "+ptm["o"].(string)+
					" exist="+strings.Join(exist, ",")+" action="+action+" req="+string(req))
			}
		}
		fields[ename] = map[string]map[string]any{}
		fmap, _ := ent["fields"].(map[string]any)
		for _, fv := range fmap {
			f, _ := fv.(map[string]any)
			view := map[string]any{"t": f["t"], "r": f["r"]}
			if sh, ok := f["sh"]; ok {
				view["sh"] = sh
			}
			fields[ename][f["n"].(string)] = view
		}
	}

	if !reflect.DeepEqual(points, expected.Points) {
		t.Errorf("points\ngot\n%s\nwant\n%s", strings.Join(points, "\n"), strings.Join(expected.Points, "\n"))
	}
	if !reflect.DeepEqual(fields, expected.Fields) {
		t.Errorf("fields\ngot  %v\nwant %v", fields, expected.Fields)
	}
}

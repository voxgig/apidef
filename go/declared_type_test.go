/* Copyright (c) 2026 Voxgig Ltd, MIT License */

package apidef

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

// Mirrors ts/test/declared-type.test.ts: the same expectation, and the base
// guide that case writes to ts/test/declared-type/guide/.
func TestDeclaredType(t *testing.T) {
	base := "../ts/test/declared-type"
	folder := t.TempDir()
	entry, err := os.ReadFile(base + "/guide/guide.aontu")
	if err != nil {
		t.Fatal(err)
	}
	if err := writeGuideEntry(folder, "", string(entry)); err != nil {
		t.Fatal(err)
	}
	res, err := NewApiDef(ApiDefOptions{Folder: folder, Strategy: "heuristic01"}).Generate(map[string]any{
		"model": map[string]any{"name": "declared-type", "def": "declared-type-def.json"},
		"build": map[string]any{"spec": map[string]any{"base": base}},
		"ctrl": map[string]any{"step": map[string]any{
			"parse": true, "guide": true, "transformers": true,
			"builders": false, "generate": false,
		}},
	})
	if err != nil || res == nil || !res.OK {
		t.Fatalf("generate failed: err=%v res=%+v", err, res)
	}

	want, err := os.ReadFile(base + "/guide/base-guide.aontu")
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
		Fields map[string]map[string]any            `json:"fields"`
		Args   map[string]map[string]map[string]any `json:"args"`
		Bodies map[string]any                       `json:"bodies"`
	}
	src, err := os.ReadFile(base + "/expected.json")
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(src, &expected); err != nil {
		t.Fatal(err)
	}

	main, _ := res.ApiModel["main"].(map[string]any)
	kit, _ := main[KIT].(map[string]any)
	entities, _ := kit["entity"].(map[string]any)
	fields := map[string]map[string]any{}
	args := map[string]map[string]map[string]any{}
	bodies := map[string]any{}
	for ename, ev := range entities {
		ent, _ := ev.(map[string]any)
		fields[ename] = map[string]any{}
		fmap, _ := ent["fields"].(map[string]any)
		for _, fv := range fmap {
			f, _ := fv.(map[string]any)
			view := map[string]any{"t": f["t"]}
			if fo, ok := f["fo"]; ok {
				view["fo"] = fo
			}
			fields[ename][f["n"].(string)] = view
		}
		ops, _ := ent["op"].(map[string]any)
		for opname, ov := range ops {
			mop, _ := ov.(map[string]any)
			points, _ := mop["points"].([]any)
			for _, pv := range points {
				pt, _ := pv.(map[string]any)
				var rb any
				if src, err := json.Marshal(pt["rb"]); err != nil || json.Unmarshal(src, &rb) != nil {
					t.Fatalf("rb of %s.%s does not round-trip: %v", ename, opname, pt["rb"])
				}
				bodies[ename+"."+opname] = rb
				g, _ := pt["g"].(map[string]any)
				for kind, lv := range g {
					list, _ := lv.([]any)
					for _, av := range list {
						arg, _ := av.(map[string]any)
						key := ename + "." + opname
						if args[key] == nil {
							args[key] = map[string]map[string]any{}
						}
						if args[key][kind] == nil {
							args[key][kind] = map[string]any{}
						}
						args[key][kind][arg["n"].(string)] = arg["t"]
					}
				}
			}
		}
	}

	if !reflect.DeepEqual(fields, expected.Fields) {
		t.Errorf("fields\ngot  %v\nwant %v", fields, expected.Fields)
	}
	if !reflect.DeepEqual(args, expected.Args) {
		t.Errorf("args\ngot  %v\nwant %v", args, expected.Args)
	}
	if !reflect.DeepEqual(bodies, expected.Bodies) {
		t.Errorf("bodies\ngot  %v\nwant %v", bodies, expected.Bodies)
	}
}

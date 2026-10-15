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

// Mirrors ts/test/swagger-twin.test.ts: the same operations written as
// Swagger 2 and as OpenAPI 3 build the same model, the expectation that case
// pins, and the base guides it writes to ts/test/swagger-twin/guide/.
func TestSwaggerTwin(t *testing.T) {
	base := "../ts/test/swagger-twin"
	build := func(kind string) map[string]any {
		folder := t.TempDir()
		entry, err := os.ReadFile(base + "/guide/" + kind + "-guide.aontu")
		if err != nil {
			t.Fatal(err)
		}
		if err := writeGuideEntry(folder, kind+"-", string(entry)); err != nil {
			t.Fatal(err)
		}
		res, err := NewApiDef(ApiDefOptions{Folder: folder, OutPrefix: kind + "-", Strategy: "heuristic01"}).Generate(map[string]any{
			"model": map[string]any{"name": "twin", "def": "swagger-twin-" + kind + "-def.json"},
			"build": map[string]any{"spec": map[string]any{"base": base}},
			"ctrl": map[string]any{"step": map[string]any{
				"parse": true, "guide": true, "transformers": true,
				"builders": false, "generate": false,
			}},
		})
		if err != nil || res == nil || !res.OK {
			t.Fatalf("%s generate failed: err=%v res=%+v", kind, err, res)
		}
		want, err := os.ReadFile(base + "/guide/" + kind + "-base-guide.aontu")
		if err != nil {
			t.Fatal(err)
		}
		got, err := os.ReadFile(filepath.Join(folder, "guide", kind+"-base-guide.aontu"))
		if err != nil {
			t.Fatal(err)
		}
		if string(got) != string(want) {
			t.Errorf("%s base guide differs from the TypeScript one:\n%s", kind, string(got))
		}
		main, _ := res.ApiModel["main"].(map[string]any)
		kit, _ := main[KIT].(map[string]any)
		return kit
	}

	// A point's contract names the format it was read from, and nothing else differs.
	unsourced := func(v any) any {
		src, err := json.Marshal(v)
		if err != nil {
			t.Fatal(err)
		}
		var out any
		if err := json.Unmarshal(src, &out); err != nil {
			t.Fatal(err)
		}
		var strip func(any)
		strip = func(n any) {
			switch m := n.(type) {
			case map[string]any:
				delete(m, "source")
				for _, each := range m {
					strip(each)
				}
			case []any:
				for _, each := range m {
					strip(each)
				}
			}
		}
		strip(out)
		return out
	}

	swagger := build("swagger")
	openapi := build("openapi")
	if !reflect.DeepEqual(unsourced(swagger["entity"]), unsourced(openapi["entity"])) {
		a, _ := json.MarshalIndent(unsourced(swagger["entity"]), "", " ")
		b, _ := json.MarshalIndent(unsourced(openapi["entity"]), "", " ")
		t.Errorf("entities differ\nswagger %s\nopenapi %s", a, b)
	}
	if !reflect.DeepEqual(unsourced(swagger["flow"]), unsourced(openapi["flow"])) {
		t.Errorf("flows differ\nswagger %v\nopenapi %v", swagger["flow"], openapi["flow"])
	}

	var expected struct {
		Points []string                             `json:"points"`
		Fields map[string]map[string]map[string]any `json:"fields"`
	}
	src, err := os.ReadFile(base + "/expected.json")
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(src, &expected); err != nil {
		t.Fatal(err)
	}

	entities, _ := unsourced(swagger["entity"]).(map[string]any)
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
				args := []string{}
				g, _ := ptm["g"].(map[string]any)
				for _, kind := range sortedKeys(g) {
					kargs, _ := g[kind].([]any)
					for _, a := range kargs {
						am, _ := a.(map[string]any)
						args = append(args, am["k"].(string)+":"+am["n"].(string))
					}
				}
				q, _ := ptm["q"].(map[string]any)
				exist := []string{}
				ev, _ := q["exist"].([]any)
				for _, e := range ev {
					exist = append(exist, e.(string))
				}
				tm, _ := ptm["t"].(map[string]any)
				req, _ := json.Marshal(tm["req"])
				rb, _ := ptm["rb"].(map[string]any)
				kind, _ := rb["kind"].(string)
				bf, _ := json.Marshal(ptm["bf"])
				points = append(points, ename+"."+opname+" "+ptm["m"].(string)+" "+ptm["o"].(string)+
					" args="+strings.Join(args, ",")+" exist="+strings.Join(exist, ",")+
					" req="+string(req)+" rb="+kind+" bf="+string(bf))
			}
		}
		fields[ename] = map[string]map[string]any{}
		fmap, _ := ent["fields"].(map[string]any)
		for _, fv := range fmap {
			f, _ := fv.(map[string]any)
			view := map[string]any{"t": f["t"], "r": f["r"]}
			if fo, ok := f["fo"]; ok {
				view["fo"] = fo
			}
			if op, ok := f["op"].(map[string]any); ok && 0 < len(op) {
				view["op"] = op
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

package apidef

import (
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strconv"
	"strings"
	"testing"
)

func TestFlowStepCompactFixture(t *testing.T) {
	source, err := os.ReadFile("../ts/test/flow-step.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		Entity map[string]any `json:"entity"`
		Steps  []any          `json:"steps"`
	}
	if err := json.Unmarshal(source, &fixture); err != nil {
		t.Fatal(err)
	}
	flow := map[string]any{"entity": "widget", "step": []any{}}
	ctx := &ApiDefContext{ApiModel: map[string]any{
		"main": map[string]any{KIT: map[string]any{
			"entity": map[string]any{"widget": fixture.Entity},
			"flow":   map[string]any{"BasicWidgetFlow": flow},
		}},
	}}
	if _, err := FlowstepTransform(ctx); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(flow["step"], fixture.Steps) {
		t.Fatalf("flow steps mismatch: got %#v, want %#v", flow["step"], fixture.Steps)
	}
}

func TestFlowStepJSONAttributes(t *testing.T) {
	step := ModelEntityFlowStep{
		Op: "update", Input: map[string]any{"ref": "widget01"},
		Match: map[string]any{"op": "payload"}, Data: map[string]any{"input": false},
		Spec:  []map[string]any{{"apply": "TextFieldMark"}},
		Valid: []map[string]any{{"apply": "ItemExists"}},
	}
	data, err := json.Marshal(step)
	if err != nil {
		t.Fatal(err)
	}
	var actual map[string]any
	if err := json.Unmarshal(data, &actual); err != nil {
		t.Fatal(err)
	}
	expected := map[string]any{
		"o": "update", "i": map[string]any{"ref": "widget01"},
		"m": map[string]any{"op": "payload"}, "d": map[string]any{"input": false},
		"s": []any{map[string]any{"apply": "TextFieldMark"}},
		"v": []any{map[string]any{"apply": "ItemExists"}},
	}
	if !reflect.DeepEqual(actual, expected) {
		t.Fatalf("flow JSON mismatch: got %#v, want %#v", actual, expected)
	}
}

func TestFlowStepFileRoundTrip(t *testing.T) {
	source := `{"o":"load","f":[{"via":"slot","action":"","dir":"put","content":"bytes","size":0,"seed":1},` +
		`{"via":"field","action":"","field":"audio","dir":"get","content":"bytes"}]}`
	var step ModelEntityFlowStep
	if err := json.Unmarshal([]byte(source), &step); err != nil {
		t.Fatal(err)
	}
	data, err := json.Marshal(step)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != source {
		t.Fatalf("file step changed: got %s, want %s", data, source)
	}
}

func TestFlowStepActivationRoundTrip(t *testing.T) {
	for _, source := range []string{`{"o":"list"}`, `{"a":false,"o":"list"}`, `{"a":true,"o":"list"}`} {
		t.Run(source, func(t *testing.T) {
			var step ModelEntityFlowStep
			if err := json.Unmarshal([]byte(source), &step); err != nil {
				t.Fatal(err)
			}
			data, err := json.Marshal(step)
			if err != nil {
				t.Fatal(err)
			}
			if string(data) != source {
				t.Fatalf("activation changed: got %s, want %s", data, source)
			}
		})
	}
}

func TestTsvFlowStep(t *testing.T) {
	rows := loadTsv(t, "flow-step")
	if len(rows) == 0 {
		t.Fatal("no flow-step rows loaded")
	}
	for _, row := range rows {
		t.Run(row["ops"], func(t *testing.T) {
			var ops map[string][]any
			var fieldDecls []any
			var want any
			unmarshalCol(t, row, "ops", &ops)
			unmarshalCol(t, row, "fields", &fieldDecls)
			unmarshalCol(t, row, "expected", &want)

			opmap := map[string]any{}
			for name, specs := range ops {
				points := []any{}
				for _, spec := range specs {
					points = append(points, flowTestPoint(spec))
				}
				opmap[name] = map[string]any{"name": name, "points": points}
			}
			// A field is a string unless the row gives its type.
			fields := map[string]any{}
			for _, decl := range fieldDecls {
				if name, ok := decl.(string); ok {
					fields[name] = map[string]any{"n": name, "t": "`$STRING`"}
				} else if field, ok := decl.(map[string]any); ok {
					fields[field["n"].(string)] = field
				}
			}
			flow := map[string]any{"name": "BasicThingFlow", "entity": "thing", "kind": "basic", "step": []any{}}
			ctx := &ApiDefContext{ApiModel: map[string]any{
				"main": map[string]any{KIT: map[string]any{
					"entity": map[string]any{"thing": map[string]any{"name": "thing", "fields": fields, "op": opmap}},
					"flow":   map[string]any{"BasicThingFlow": flow},
				}},
			}}
			if _, err := FlowstepTransform(ctx); err != nil {
				t.Fatal(err)
			}

			got := []any{}
			steps, _ := flow["step"].([]any)
			for _, s := range steps {
				step := s.(map[string]any)
				shown := map[string]any{"o": step["o"]}
				if false == step["a"] {
					shown["a"] = false
				}
				if m := step["m"].(map[string]any); len(m) > 0 {
					shown["m"] = m
				}
				if d := step["d"].(map[string]any); len(d) > 0 {
					shown["d"] = d
				}
				if tf, ok := step["i"].(map[string]any)["textfield"]; ok {
					shown["tf"] = tf
				}
				if step["o"] == "load" && !hasTextFieldMark(step["v"]) {
					shown["mark"] = false
				}
				got = append(got, shown)
			}
			if !jsonEqual(got, want) {
				gotJSON, _ := json.Marshal(got)
				t.Errorf("steps\ngot  %s\nwant %s", gotJSON, row["expected"])
			}
		})
	}
}

func TestTsvFlowTextField(t *testing.T) {
	rows := loadTsv(t, "flow-textfield")
	if len(rows) == 0 {
		t.Fatal("no flow-textfield rows loaded")
	}
	for _, row := range rows {
		t.Run(row["name"], func(t *testing.T) {
			var list []map[string]any
			var want any
			unmarshalCol(t, row, "fields", &list)
			unmarshalCol(t, row, "expected", &want)

			fields := map[string]any{}
			for _, f := range list {
				fields[f["n"].(string)] = f
			}
			opmap := map[string]any{}
			for name, path := range map[string]string{
				"create": "/things", "update": "/things/{id}", "load": "/things/{id}",
			} {
				opmap[name] = map[string]any{"name": name, "points": []any{flowTestPoint(path)}}
			}
			flow := map[string]any{"name": "BasicThingFlow", "entity": "thing", "kind": "basic", "step": []any{}}
			ent := map[string]any{"name": "thing", "fields": fields, "op": opmap}
			if "" != row["id"] {
				var id map[string]any
				unmarshalCol(t, row, "id", &id)
				ent["id"] = id
			}
			ctx := &ApiDefContext{ApiModel: map[string]any{
				"main": map[string]any{KIT: map[string]any{
					"entity": map[string]any{"thing": ent},
					"flow":   map[string]any{"BasicThingFlow": flow},
				}},
			}}
			if _, err := FlowstepTransform(ctx); err != nil {
				t.Fatal(err)
			}

			var got any
			steps, _ := flow["step"].([]any)
			for _, s := range steps {
				step := s.(map[string]any)
				if step["o"] == "update" {
					got = step["i"].(map[string]any)["textfield"]
				}
			}
			if got != want {
				t.Errorf("textfield = %v, want %v", got, want)
			}
		})
	}
}

// Mirrors the TS `flow-patch` case.
func TestFlowPatchStep(t *testing.T) {
	const def = "patch-flow-def.json"
	dir := t.TempDir()
	folder := stageGuideEntry(t, filepath.Join(dir, "model"), "")
	src, err := os.ReadFile(filepath.Join("..", "ts", "test", "def", def))
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(dir, "def"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "def", def), src, 0644); err != nil {
		t.Fatal(err)
	}
	res, err := NewApiDef(ApiDefOptions{Folder: folder, Strategy: "heuristic01"}).Generate(map[string]any{
		"model": map[string]any{"name": "patch-flow", "def": def},
		"build": map[string]any{"spec": map[string]any{"base": folder}},
		"ctrl": map[string]any{"step": map[string]any{
			"parse": true, "guide": true, "transformers": true,
			"builders": false, "generate": false,
		}},
	})
	if err != nil || res == nil || !res.OK {
		t.Fatalf("generate failed: err=%v res=%+v", err, res)
	}

	var kit struct {
		Entity map[string]struct {
			Op map[string]struct {
				Points []struct {
					M string `json:"m"`
				} `json:"points"`
			} `json:"op"`
		} `json:"entity"`
		Flow map[string]struct {
			Step []map[string]any `json:"step"`
		} `json:"flow"`
	}
	data, err := json.Marshal(res.ApiModel["main"].(map[string]any)[KIT])
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(data, &kit); err != nil {
		t.Fatal(err)
	}

	for _, name := range []string{"note", "page"} {
		ops := kit.Entity[name].Op
		names := []string{}
		for opname := range ops {
			names = append(names, opname)
		}
		sort.Strings(names)
		if got := strings.Join(names, ","); got != "create,list,load,patch,remove,update" {
			t.Errorf("%s ops = %s", name, got)
		}
		for opname, method := range map[string]string{"update": "PUT", "patch": "PATCH"} {
			points := ops[opname].Points
			if len(points) != 1 || points[0].M != method {
				t.Errorf("%s %s points = %v, want one %s", name, opname, points, method)
			}
		}
	}

	for name, want := range map[string]string{
		"BasicNoteFlow": `{"i":{"ref":"note_ref01","srcdatavar":"note_ref01_data","suffix":"_pt0","textfield":"body"},` +
			`"o":"patch","s":[{"apply":"TextFieldMark","def":{"mark":"Mark01-note_ref01"}}]}`,
		"BasicPageFlow": `{"d":{"notebook_id":"notebook01"},` +
			`"i":{"ref":"page_ref01","srcdatavar":"page_ref01_data","suffix":"_pt0","textfield":"heading"},` +
			`"o":"patch","s":[{"apply":"TextFieldMark","def":{"mark":"Mark01-page_ref01"}}]}`,
	} {
		steps := kit.Flow[name].Step
		ops := []string{}
		for _, step := range steps {
			ops = append(ops, step["o"].(string))
		}
		if got := strings.Join(ops, ","); got != "create,list,update,patch,load,remove,list" {
			t.Fatalf("%s steps = %s", name, got)
		}
		var wantStep any
		if err := json.Unmarshal([]byte(want), &wantStep); err != nil {
			t.Fatal(err)
		}
		if !jsonEqual(steps[3], wantStep) {
			gotJSON, _ := json.Marshal(steps[3])
			t.Errorf("%s patch step\ngot  %s\nwant %s", name, gotJSON, want)
		}
	}
}

// flowTestPoint builds a point from its route as tsv.test.ts does: the
// placeholders are its params, sorted, unless the row lists them.
func flowTestPoint(spec any) map[string]any {
	desc, _ := spec.(map[string]any)
	path, _ := spec.(string)
	if desc != nil {
		path, _ = desc["path"].(string)
	}
	segments := []any{}
	names := []string{}
	for _, part := range strings.Split(path, "/") {
		if part == "" {
			continue
		}
		if strings.HasPrefix(part, "{") {
			segments = append(segments, map[string]any{"var": part[1 : len(part)-1]})
			names = append(names, part[1:len(part)-1])
		} else {
			segments = append(segments, map[string]any{"lit": part})
		}
	}
	sortUTF16(names)
	if listed, ok := desc["params"].([]any); ok {
		names = []string{}
		for _, n := range listed {
			names = append(names, n.(string))
		}
	}
	params := []any{}
	for _, n := range names {
		params = append(params, map[string]any{"n": n, "k": "param", "r": true, "t": "`$STRING`"})
	}
	point := map[string]any{"s": segments, "g": map[string]any{"params": params}}
	if rename, ok := desc["rename"].(map[string]any); ok {
		point["r"] = map[string]any{"param": rename}
	}
	if action, ok := desc["action"].(string); ok {
		point["q"] = map[string]any{"exist": []any{}, "$action": action}
	}
	for _, key := range []string{"rb", "rs"} {
		if kind, ok := desc[key].(string); ok {
			point[key] = map[string]any{"kind": kind}
		} else if body, ok := desc[key].(map[string]any); ok {
			point[key] = body
		}
	}
	if bn, ok := desc["bn"].(map[string]any); ok {
		point["bn"] = bn
	}
	if active, ok := desc["a"].(bool); ok {
		point["a"] = active
	}
	return point
}

// Mirrors the TS `tsv-flow-file-step` suite: an entity's file flow, from its
// routes, or null when it gets none.
func TestTsvFlowFileStep(t *testing.T) {
	rows := loadTsv(t, "flow-file-step")
	if len(rows) == 0 {
		t.Fatal("no flow-file-step rows loaded")
	}
	for _, row := range rows {
		t.Run(row["name"], func(t *testing.T) {
			var ops map[string][]any
			var extra map[string]any
			var want any
			unmarshalCol(t, row, "ops", &ops)
			unmarshalCol(t, row, "entity", &extra)
			unmarshalCol(t, row, "expected", &want)

			opmap := map[string]any{}
			for name, specs := range ops {
				points := []any{}
				for _, spec := range specs {
					points = append(points, flowTestPoint(spec))
				}
				opmap[name] = map[string]any{"name": name, "points": points}
			}
			ent := map[string]any{"name": "thing", "fields": map[string]any{}, "op": opmap}
			for key, value := range extra {
				ent[key] = value
			}
			flows := map[string]any{}
			ctx := &ApiDefContext{
				ApiModel: map[string]any{"main": map[string]any{KIT: map[string]any{
					"entity": map[string]any{"thing": ent},
					"flow":   flows,
				}}},
				Guide: map[string]any{"entity": map[string]any{"thing": map[string]any{}}},
			}
			if _, err := FlowTransform(ctx); err != nil {
				t.Fatal(err)
			}
			if _, err := FlowstepTransform(ctx); err != nil {
				t.Fatal(err)
			}

			names := sortedKeys(flows)
			wantNames := []string{"BasicThingFlow"}
			if want != nil {
				wantNames = append(wantNames, "FileThingFlow")
			}
			if !reflect.DeepEqual(names, wantNames) {
				t.Fatalf("flows = %v, want %v", names, wantNames)
			}

			var got any
			if flow, ok := flows["FileThingFlow"].(map[string]any); ok {
				if flow["entity"] != "thing" || flow["kind"] != "file" {
					t.Errorf("flow entity %v kind %v", flow["entity"], flow["kind"])
				}
				shown := []any{}
				for _, s := range flow["step"].([]any) {
					step := s.(map[string]any)
					entry := map[string]any{"o": step["o"]}
					if false == step["a"] {
						entry["a"] = false
					}
					if m := step["m"].(map[string]any); len(m) > 0 {
						entry["m"] = m
					}
					if f, ok := step["f"]; ok {
						entry["f"] = f
					}
					shown = append(shown, entry)
				}
				got = shown
			}
			if !jsonEqual(got, want) {
				gotJSON, _ := json.Marshal(got)
				t.Errorf("steps\ngot  %s\nwant %s", gotJSON, row["expected"])
			}
		})
	}
}

func TestTsvFlowFileContent(t *testing.T) {
	rows := loadTsv(t, "flow-file-content")
	if len(rows) == 0 {
		t.Fatal("no flow-file-content rows loaded")
	}
	for _, row := range rows {
		t.Run(row["content"]+" "+row["size"]+" "+row["seed"], func(t *testing.T) {
			size, _ := strconv.Atoi(row["size"])
			seed, _ := strconv.Atoi(row["seed"])
			out := FileContent(row["content"], size, seed)
			got := hex.EncodeToString(out)
			if row["content"] == "text" {
				var quoted strings.Builder
				enc := json.NewEncoder(&quoted)
				enc.SetEscapeHTML(false)
				if err := enc.Encode(string(out)); err != nil {
					t.Fatal(err)
				}
				got = strings.TrimSuffix(quoted.String(), "\n")
			}
			if got != row["expected"] {
				t.Errorf("content = %s, want %s", got, row["expected"])
			}
		})
	}
}

func TestFlowFileContentCarriesEncoderBreakers(t *testing.T) {
	bytes := FileContent("bytes", 512, 1)
	for _, pair := range []string{"\x00\x00", "\xff\xff", "\r\r", "\n\n", `""`, "--"} {
		if !strings.Contains(string(bytes), pair) {
			t.Errorf("bytes lack %q", pair)
		}
	}
	text := string(FileContent("text", 192, 1))
	for _, part := range []string{"\n\n", `""`, "--"} {
		if !strings.Contains(text, part) {
			t.Errorf("text lacks %q", part)
		}
	}
}

func hasTextFieldMark(valid any) bool {
	list, _ := valid.([]any)
	for _, v := range list {
		if m, _ := v.(map[string]any); m["apply"] == "TextFieldMark" {
			return true
		}
	}
	return false
}

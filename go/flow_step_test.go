package apidef

import (
	"encoding/json"
	"os"
	"reflect"
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
				if m := step["m"].(map[string]any); len(m) > 0 {
					shown["m"] = m
				}
				if d := step["d"].(map[string]any); len(d) > 0 {
					shown["d"] = d
				}
				if tf, ok := step["i"].(map[string]any)["textfield"]; ok {
					shown["tf"] = tf
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
	return point
}

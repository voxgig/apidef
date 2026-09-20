package apidef

import (
	"encoding/json"
	"os"
	"reflect"
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

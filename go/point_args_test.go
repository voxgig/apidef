package apidef

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"
)

func TestCompactPointArgs(t *testing.T) {
	var fixture struct {
		Parameters []map[string]any `json:"parameters"`
		Rename     map[string]any   `json:"rename"`
		Expected   map[string]any   `json:"expected"`
	}
	data, err := os.ReadFile("../ts/test/point-args.json")
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(data, &fixture); err != nil {
		t.Fatal(err)
	}
	point := map[string]any{"r": fixture.Rename, "o": "/pets/{petId}"}
	resolveArgs(nil, "pet", "load", point, fixture.Parameters)
	entity := map[string]any{"op": map[string]any{"load": map[string]any{"points": []any{point}}}}
	clean := stripEntityDefaults(entity).(map[string]any)
	result := clean["op"].(map[string]any)["load"].(map[string]any)["points"].([]any)[0].(map[string]any)
	if !reflect.DeepEqual(result["g"], fixture.Expected) {
		t.Fatalf("args: got %#v, want %#v", result["g"], fixture.Expected)
	}
}

func TestPointDefaultsPreserveDisabledArgumentsAndExamples(t *testing.T) {
	arg := map[string]any{"n": "flag", "a": false, "ex": map[string]any{"a": true}}
	point := map[string]any{"a": false, "g": map[string]any{"query": []any{arg}}}
	entity := map[string]any{"op": map[string]any{"load": map[string]any{"points": []any{point}}}}
	if got := stripEntityDefaults(entity); !reflect.DeepEqual(got, entity) {
		t.Fatalf("explicit activation or example changed: %#v", got)
	}
}

package apidef

import (
	"encoding/json"
	"reflect"
	"testing"
)

func TestContractFacts(t *testing.T) {
	for _, method := range []string{"POST", "QUERY"} {
		point := map[string]any{"method": method, "orig": "/item"}
		body := map[string]any{"content": map[string]any{"application/json": map[string]any{"schema": map[string]any{"type": "object", "additionalProperties": false}, "example": map[string]any{}}}}
		verb := "post"
		if method == "QUERY" {
			verb = "query"
		}
		ctx := &ApiDefContext{ApiModel: map[string]any{"main": map[string]any{"kit": map[string]any{"entity": map[string]any{"item": map[string]any{"name": "item", "op": map[string]any{"create": map[string]any{"name": "create", "points": []any{point}}}}}}}}, Guide: map[string]any{}, Def: map[string]any{"paths": map[string]any{"/item": map[string]any{verb: map[string]any{"security": []any{}, "requestBody": body}}}}}
		if _, err := ContractTransform(ctx); err != nil {
			t.Fatal(err)
		}
		if _, err := CleanTransform(ctx); err != nil {
			t.Fatal(err)
		}
		c := point["contract"].(map[string]any)
		facts := map[string]any{}
		json.Unmarshal([]byte(c["json"].(string)), &facts)
		if !reflect.DeepEqual(facts["security"], []any{}) {
			t.Fatal("lost public access")
		}
		if !reflect.DeepEqual(facts["requestBody"], body) {
			t.Fatal("lost empty request schema/example")
		}
	}
}

func TestRecursiveContract(t *testing.T) {
	schema := map[string]any{"type": "object"}
	schema["properties"] = map[string]any{"child": schema}
	facts := contractCopy(map[string]any{"a/b~c": schema, "second": schema}).(map[string]any)
	for key, pointer := range map[string]string{"a/b~c": "#/a~1b~0c", "second": "#/second"} {
		node := facts[key].(map[string]any)
		child := node["properties"].(map[string]any)["child"]
		if !reflect.DeepEqual(child, map[string]any{"$ref": pointer}) {
			t.Fatalf("bad recursion reference: %v", child)
		}
	}
}
func TestGraphqlInputContract(t *testing.T) {
	types := map[string]any{
		"Input":  map[string]any{"kind": "INPUT_OBJECT", "fields": map[string]any{"child": map[string]any{"type": "Input"}, "choice": map[string]any{"type": "Choice"}}},
		"Choice": map[string]any{"kind": "ENUM", "values": []any{"A", "B"}},
		"Output": map[string]any{"kind": "OBJECT"},
	}
	selected := graphqlInputTypes(map[string]any{"args": []any{map[string]any{"type": "Input"}}}, types)
	if len(selected) != 2 || selected["Choice"] == nil || selected["Input"] == nil {
		t.Fatalf("wrong input closure: %v", selected)
	}
}

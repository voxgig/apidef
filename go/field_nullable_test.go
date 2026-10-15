package apidef

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

func TestFieldNullable(t *testing.T) {
	rows := loadTsv(t, "field-nullable")
	if len(rows) == 0 {
		t.Fatal("no nullable field cases")
	}
	for _, row := range rows {
		for op, method := range map[string]string{"load": "GET", "list": "GET", "create": "POST", "update": "PUT"} {
			t.Run(row["name"]+"/"+op, func(t *testing.T) {
				var property map[string]any
				var expected any
				if err := json.Unmarshal([]byte(row["schema"]), &property); err != nil {
					t.Fatal(err)
				}
				if err := json.Unmarshal([]byte(row["expected"]), &expected); err != nil {
					t.Fatal(err)
				}
				property["key$"] = "value"
				before, _ := json.Marshal(property)
				record := map[string]any{"type": "object", "required": []any{"value"}, "properties": map[string]any{
					"value": property, "label": map[string]any{"type": "string"},
				}}
				schema := record
				if op == "list" {
					schema = map[string]any{"type": "array", "items": record}
				}
				body := map[string]any{"content": map[string]any{"application/json": map[string]any{"schema": schema}}}
				opdef := map[string]any{"responses": map[string]any{"200": body}}
				if op == "create" || op == "update" {
					opdef = map[string]any{"requestBody": body}
				}
				entity := map[string]any{"name": "thing", "fields": map[string]any{}, "op": map[string]any{
					op: map[string]any{"name": op, "points": []any{map[string]any{"o": "/things", "m": method, "k": "json"}}},
				}}
				def := map[string]any{"paths": map[string]any{"/things": map[string]any{strings.ToLower(method): opdef}}}
				model := map[string]any{"main": map[string]any{KIT: map[string]any{"entity": map[string]any{"thing": entity}}}}
				if _, err := FieldTransform(&ApiDefContext{ApiModel: model, Def: def}); err != nil {
					t.Fatal(err)
				}
				field := entity["fields"].(map[string]any)["value"].(map[string]any)
				if !reflect.DeepEqual(field["t"], expected) || field["r"] != true {
					t.Errorf("field = %v, want type %v and required true", field, expected)
				}
				if after, _ := json.Marshal(property); string(after) != string(before) {
					t.Errorf("shared property changed: %s, was %s", after, before)
				}
			})
		}
	}
}

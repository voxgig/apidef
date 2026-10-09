package apidef

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

// Mirrors ts/test/field-nullable.test.ts: a schema is a record's property,
// read by every operation, unless its row puts it at `body`, a JSON request
// body sent from one field.
func TestFieldNullable(t *testing.T) {
	rows := loadTsv(t, "field-nullable")
	if len(rows) == 0 {
		t.Fatal("no nullable field cases")
	}
	for _, row := range rows {
		key := row["field"]
		if key == "" {
			key = "value"
		}
		body := row["at"] == "body"
		ops := map[string]string{"load": "GET", "list": "GET", "create": "POST", "update": "PUT"}
		if body {
			ops = map[string]string{"create": "POST", "update": "PUT"}
		}
		for op, method := range ops {
			t.Run(row["name"]+"/"+op, func(t *testing.T) {
				var property map[string]any
				var expected any
				if err := json.Unmarshal([]byte(row["schema"]), &property); err != nil {
					t.Fatal(err)
				}
				if err := json.Unmarshal([]byte(row["expected"]), &expected); err != nil {
					t.Fatal(err)
				}
				point := map[string]any{"o": "/things", "m": method, "k": "json"}
				schema := property
				if body {
					point["t"] = map[string]any{"req": "`reqdata." + key + "`"}
				} else {
					property["key$"] = key
					record := map[string]any{"type": "object", "required": []any{key}, "properties": map[string]any{
						key: property, "label": map[string]any{"type": "string"},
					}}
					schema = record
					if op == "list" {
						schema = map[string]any{"type": "array", "items": record}
					}
				}
				before, _ := json.Marshal(property)
				content := map[string]any{"content": map[string]any{"application/json": map[string]any{"schema": schema}}}
				opdef := map[string]any{"responses": map[string]any{"200": content}}
				if op == "create" || op == "update" {
					opdef = map[string]any{"requestBody": content}
				}
				entity := map[string]any{"name": "thing", "fields": map[string]any{}, "op": map[string]any{
					op: map[string]any{"name": op, "points": []any{point}},
				}}
				def := map[string]any{"paths": map[string]any{"/things": map[string]any{strings.ToLower(method): opdef}}}
				model := map[string]any{"main": map[string]any{KIT: map[string]any{"entity": map[string]any{"thing": entity}}}}
				if _, err := FieldTransform(&ApiDefContext{ApiModel: model, Def: def}); err != nil {
					t.Fatal(err)
				}
				field, _ := entity["fields"].(map[string]any)[key].(map[string]any)
				if !reflect.DeepEqual(field["t"], expected) || field["r"] != !body {
					t.Errorf("field = %v, want type %v and required %v", field, expected, !body)
				}
				if after, _ := json.Marshal(property); string(after) != string(before) {
					t.Errorf("shared property changed: %s, was %s", after, before)
				}
			})
		}
	}
}

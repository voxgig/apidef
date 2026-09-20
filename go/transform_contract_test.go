package apidef

import (
	"encoding/json"
	"reflect"
	"testing"
)

func TestContractIdentity(t *testing.T) {
	for _, tc := range []struct {
		name, method, source, root string
	}{
		{"openapi", "POST", "openapi3", ""},
		{"query-verb", "QUERY", "openapi3", ""},
		{"swagger", "POST", "swagger2", ""},
		{"graphql-query", "POST", "graphql", "query"},
		{"graphql-mutation", "POST", "graphql", "mutation"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			orig := "/item"
			guideKind := "path"
			def := map[string]any{}
			schema := map[string]any{"type": "object"}
			schema["properties"] = map[string]any{"child": schema}
			if tc.root != "" {
				orig = "item"
				guideKind = "field"
				def[tc.root] = map[string]any{orig: map[string]any{"args": []any{}}}
			} else {
				verb := "post"
				if tc.method == "QUERY" {
					verb = "query"
				}
				def["paths"] = map[string]any{orig: map[string]any{verb: map[string]any{
					"security": []any{}, "requestBody": map[string]any{"schema": schema},
				}}}
				if tc.source == "swagger2" {
					def["swagger"] = "2.0"
				}
			}
			point := map[string]any{"m": tc.method, "o": orig, "co": map[string]any{"json": "stale"}}
			live := map[string]any{"input": map[string]any{"n": 2}}
			ctx := &ApiDefContext{
				Def: def,
				ApiModel: map[string]any{"main": map[string]any{"kit": map[string]any{"entity": map[string]any{
					"item": map[string]any{"name": "item", "op": map[string]any{
						"create": map[string]any{"name": "create", "points": []any{point}},
					}},
				}}}},
				Guide: map[string]any{"entity": map[string]any{"item": map[string]any{
					guideKind: map[string]any{orig: map[string]any{"op": map[string]any{
						"create": map[string]any{"live": live},
					}}},
				}}},
			}
			if _, err := ContractTransform(ctx); err != nil {
				t.Fatal(err)
			}
			if _, err := CleanTransform(ctx); err != nil {
				t.Fatal(err)
			}
			want := map[string]any{"version": 2, "id": tc.method + " " + orig, "source": tc.source}
			if !reflect.DeepEqual(point["co"], want) {
				t.Fatalf("contract: got %v, want %v", point["co"], want)
			}
			if !reflect.DeepEqual(point["li"], live) {
				t.Fatalf("live hint lost: %v", point["li"])
			}
			if _, err := json.Marshal(ctx.ApiModel); err != nil {
				t.Fatalf("model contains recursive specification data: %v", err)
			}
			child := schema["properties"].(map[string]any)["child"].(map[string]any)
			if reflect.ValueOf(child).Pointer() != reflect.ValueOf(schema).Pointer() {
				t.Fatal("shared schema changed")
			}
		})
	}
}

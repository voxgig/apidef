package apidef

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestResolvedPublication(t *testing.T) {
	schema := map[string]any{"type": "object"}
	schema["properties"] = map[string]any{"child": schema}
	def := map[string]any{"paths": map[string]any{"/items": map[string]any{"post": map[string]any{"requestBody": schema}}}}
	guide := map[string]any{}
	ctx := map[string]any{"state": map[string]any{"apidef": map[string]any{"retained": true}}}
	resolved := PublishResolved(ctx, "openapi3", def, func() map[string]any { return guide })
	guide = map[string]any{"entity": map[string]any{"item": map[string]any{"path": map[string]any{"/items": map[string]any{"op": map[string]any{
		"create": map[string]any{"method": "POST", "contract": map[string]any{"security": []any{}}, "live": false},
	}}}}}}
	facts, err := resolved.Operation("POST", "/items")
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(facts["security"], []any{}) || facts["live"] != false {
		t.Fatalf("guide lost: %v", facts["security"])
	}
	if reflect.ValueOf(facts["requestBody"]).Pointer() != reflect.ValueOf(schema).Pointer() {
		t.Fatal("schema copied")
	}
	for _, carrier := range []any{ctx, &ApiDefResult{Ctx: &ApiDefContext{Resolved: resolved}}, map[string]any{"ctx": ctx}, map[string]any{"apidef": map[string]any{"resolved": resolved}}} {
		if ResolvedSpecFrom(carrier) != resolved {
			t.Fatal("capability not found")
		}
	}
	if ctx["state"].(map[string]any)["apidef"].(map[string]any)["retained"] != true {
		t.Fatal("state overwritten")
	}
	if PublishResolved(nil, "openapi3", def) == nil || ResolvedSpecFrom(nil) != nil {
		t.Fatal("missing context")
	}
	index := OperationIndex(def)
	if len(index) != 1 || index["POST /items"] == nil {
		t.Fatal("operation index")
	}
}

func TestResolvedGenerate(t *testing.T) {
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "def"), 0755); err != nil {
		t.Fatal(err)
	}
	raw := `{"openapi":"3.0.0","info":{"title":"t","version":"1"},"servers":[{"url":"https://example.com"}],"paths":{"/items/{id}":{"get":{"parameters":[{"name":"id","in":"path","required":true,"schema":{"type":"string"}}],"responses":{"200":{"description":"ok"}}}}}}`
	if err := os.WriteFile(filepath.Join(dir, "def", "test.json"), []byte(raw), 0644); err != nil {
		t.Fatal(err)
	}
	for _, stop := range []string{"guide", "transformers", "builders", "generate"} {
		t.Run(stop, func(t *testing.T) {
			buildctx := map[string]any{}
			result, err := NewApiDef(ApiDefOptions{Folder: stageGuideEntry(t, t.TempDir(), "")}).Generate(map[string]any{
				"model":    map[string]any{"name": "test", "def": "test.json"},
				"build":    map[string]any{"spec": map[string]any{"base": filepath.Join(dir, "model")}},
				"buildctx": buildctx, "ctrl": map[string]any{"step": map[string]any{stop: false}},
			})
			if err != nil {
				t.Fatal(err)
			}
			resolved := ResolvedSpecFrom(result)
			if resolved == nil || ResolvedSpecFrom(buildctx) != resolved {
				t.Fatal("pipeline did not publish capability")
			}
			facts, err := resolved.Operation("GET", "/items/{id}")
			if err != nil || facts == nil {
				t.Fatalf("parsed operation missing: %v", err)
			}
			if reflect.ValueOf(resolved.Def).Pointer() != reflect.ValueOf(result.Ctx.Def).Pointer() {
				t.Fatal("capability copied the parsed definition")
			}
		})
	}
}

func TestModelPointLiveRoundTrip(t *testing.T) {
	for _, src := range []string{`{"li":true}`, `{"li":false}`, `{"li":{"input":{"n":2}}}`} {
		var point ModelPoint
		if err := json.Unmarshal([]byte(src), &point); err != nil {
			t.Fatal(err)
		}
		data, err := json.Marshal(point)
		if err != nil {
			t.Fatal(err)
		}
		var got, want map[string]any
		json.Unmarshal(data, &got)
		json.Unmarshal([]byte(src), &want)
		if !reflect.DeepEqual(got["li"], want["li"]) {
			t.Fatalf("live lost: %s", data)
		}
	}
}

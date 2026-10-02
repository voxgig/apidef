/* Copyright (c) 2026 Voxgig Ltd, MIT License */

package apidef

import (
	"encoding/json"
	"strings"
	"testing"
)

// Mirrors ts/test/select.test.ts.

func generateRestSelect(t *testing.T) *ApiDefResult {
	t.Helper()
	folder := stageGuideEntry(t, t.TempDir(), "")
	res, err := NewApiDef(ApiDefOptions{Folder: folder, Strategy: "heuristic01"}).Generate(map[string]any{
		"model": map[string]any{"name": "rest-select", "def": "rest-select-def.json"},
		"build": map[string]any{"spec": map[string]any{"base": "../ts/test/rest-select"}},
		"ctrl": map[string]any{"step": map[string]any{
			"parse": true, "guide": true, "transformers": true,
			"builders": false, "generate": false,
		}},
	})
	if err != nil || res == nil || !res.OK {
		t.Fatalf("generate failed: err=%v res=%+v", err, res)
	}
	return res
}

func pointSelectors(res *ApiDefResult, entity string, op string) []any {
	main, _ := res.ApiModel["main"].(map[string]any)
	kit, _ := main[KIT].(map[string]any)
	entities, _ := kit["entity"].(map[string]any)
	ent, _ := entities[entity].(map[string]any)
	ops, _ := ent["op"].(map[string]any)
	mop, _ := ops[op].(map[string]any)
	points, _ := mop["points"].([]any)
	out := []any{}
	for _, pt := range points {
		point, _ := pt.(map[string]any)
		q, _ := point["q"].(map[string]any)
		exist, _ := q["exist"].([]any)
		if exist == nil {
			exist = []any{}
		}
		out = append(out, []any{point["o"], exist})
	}
	return out
}

func asJSON(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}

func TestSelectOptionalArgumentNeverSelects(t *testing.T) {
	res := generateRestSelect(t)
	if got, want := asJSON(pointSelectors(res, "permission", "remove")),
		`[["/public/database/{id}/permission/{msisdn}",["database_id","id"]],`+
			`["/public/database/{id}/permission/permanent/{msisdn}",["database_id","msisdn"]]]`; got != want {
		t.Errorf("permission.remove selectors\ngot  %s\nwant %s", got, want)
	}
	if got, want := asJSON(pointSelectors(res, "permission", "list")),
		`[["/public/database/{id}/permission",["database_id"]]]`; got != want {
		t.Errorf("permission.list selectors\ngot  %s\nwant %s", got, want)
	}
}

func TestSelectSharedSelectorWarns(t *testing.T) {
	res := generateRestSelect(t)
	shared := []any{}
	for _, warning := range res.Ctx.Warn.History() {
		if note, _ := warning["note"].(string); strings.Contains(note, "same selector") {
			shared = append(shared, []any{warning["entity"], warning["op"], warning["points"]})
		}
	}
	if got, want := asJSON(shared),
		`[["disable","update",["PUT /entity-templates/disable","PUT /iterations/disable"]]]`; got != want {
		t.Errorf("shared selector warnings\ngot  %s\nwant %s", got, want)
	}
}

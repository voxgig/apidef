/* Copyright (c) 2026 Voxgig Ltd, MIT License */

package apidef

import "testing"

// Mirrors ts/test/body.test.ts.

func generateRequestBody(t *testing.T) *ApiDefResult {
	t.Helper()
	folder := t.TempDir()
	entry := "@\"@voxgig/apidef/model/guide.aontu\"\n@\"./base-guide.aontu\"\n" +
		"guide: entity: render: path: \"/renders\": op: create: body: media: \"text/plain\"\n" +
		"guide: entity: avatar: path: \"/avatars/{avatar_id}\": op: load: response: media: \"image/png\"\n"
	if err := writeGuideEntry(folder, "", entry); err != nil {
		t.Fatal(err)
	}
	res, err := NewApiDef(ApiDefOptions{Folder: folder, Strategy: "heuristic01"}).Generate(map[string]any{
		"model": map[string]any{"name": "request-body", "def": "request-body-def.json"},
		"build": map[string]any{"spec": map[string]any{"base": "../ts/test/request-body"}},
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

func pointBodies(res *ApiDefResult, entity string, op string, key ...string) []any {
	field := "rb"
	if 0 < len(key) {
		field = key[0]
	}
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
		out = append(out, []any{point["o"], point[field]})
	}
	return out
}

func TestBodyJSONAndReadRecordNothing(t *testing.T) {
	res := generateRequestBody(t)
	if got, want := asJSON(pointBodies(res, "note", "create")), `[["/notes",null]]`; got != want {
		t.Errorf("note.create bodies\ngot  %s\nwant %s", got, want)
	}
	for _, entity := range []string{"avatar", "note", "render", "subscription", "upload"} {
		if bodies := pointBodies(res, entity, "load"); len(bodies) != 1 || bodies[0].([]any)[1] != nil {
			t.Errorf("%s.load bodies: %s", entity, asJSON(bodies))
		}
	}
}

func TestBodyRawMultipartForm(t *testing.T) {
	res := generateRequestBody(t)
	for _, c := range []struct{ entity, want string }{
		{"upload", `[["/uploads",{"binary":true,"kind":"raw","media":"application/octet-stream"}]]`},
		{"avatar", `[["/avatars",{"fields":[{"name":"caption"},` +
			`{"binary":true,"media":"image/png","name":"image"}],"kind":"multipart","media":"multipart/form-data"}]]`},
		{"subscription", `[["/subscriptions",{"fields":[{"name":"email"},{"list":true,"name":"topics"}],` +
			`"kind":"form","media":"application/x-www-form-urlencoded"}]]`},
	} {
		if got := asJSON(pointBodies(res, c.entity, "create")); got != c.want {
			t.Errorf("%s.create bodies\ngot  %s\nwant %s", c.entity, got, c.want)
		}
	}
}

func TestBodyGuideChoosesMedia(t *testing.T) {
	res := generateRequestBody(t)
	if got, want := asJSON(pointBodies(res, "render", "create")),
		`[["/renders",{"alternatives":[{"kind":"raw","media":"text/markdown"}],"kind":"raw","media":"text/plain"}]]`; got != want {
		t.Errorf("render.create bodies\ngot  %s\nwant %s", got, want)
	}
}

func TestBodySuccessResponses(t *testing.T) {
	res := generateRequestBody(t)
	jsonBody := `{"kind":"json","media":"application/json"}`
	for _, entity := range []string{"note", "render", "subscription", "upload"} {
		for _, op := range []string{"create", "load"} {
			bodies := pointBodies(res, entity, op, "rs")
			if got := asJSON(bodies[0].([]any)[1]); len(bodies) != 1 || got != jsonBody {
				t.Errorf("%s.%s rs: %s", entity, op, asJSON(bodies))
			}
		}
	}
	if got, want := asJSON(pointBodies(res, "avatar", "create", "rs")), `[["/avatars",`+jsonBody+`]]`; got != want {
		t.Errorf("avatar.create rs\ngot  %s\nwant %s", got, want)
	}
	if got, want := asJSON(pointBodies(res, "note", "remove", "rs")), `[["/notes/{note_id}",null]]`; got != want {
		t.Errorf("note.remove rs\ngot  %s\nwant %s", got, want)
	}
	if got, want := asJSON(pointBodies(res, "avatar", "load", "rs")),
		`[["/avatars/{avatar_id}",{"alternatives":[`+jsonBody+`],"binary":true,"kind":"raw","media":"image/png"}]]`; got != want {
		t.Errorf("avatar.load rs\ngot  %s\nwant %s", got, want)
	}
}

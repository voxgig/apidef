/* Copyright (c) 2026 Voxgig Ltd, MIT License */

package apidef

import (
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"testing"
)

// Mirrors ts/test/file-slot.test.ts.

const fileSlotDef = "file-slot-def.json"

func buildFileSlot(t *testing.T, entry string) (map[string]any, string) {
	t.Helper()
	kit, base := buildFileSlotKit(t, entry)
	entities, _ := kit["entity"].(map[string]any)
	return entities, base
}

func buildFileSlotKit(t *testing.T, entry string) (map[string]any, string) {
	t.Helper()
	dir := t.TempDir()
	folder := filepath.Join(dir, "model")
	if err := os.MkdirAll(filepath.Join(folder, "guide"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(dir, "def"), 0755); err != nil {
		t.Fatal(err)
	}
	def, err := os.ReadFile(filepath.Join("..", "ts", "test", "def", fileSlotDef))
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "def", fileSlotDef), def, 0644); err != nil {
		t.Fatal(err)
	}
	src := "@\"@voxgig/apidef/model/guide.aontu\"\n@\"./base-guide.aontu\"\n" + entry + "\n"
	if err := os.WriteFile(filepath.Join(folder, "guide", "guide.aontu"), []byte(src), 0644); err != nil {
		t.Fatal(err)
	}
	ad := NewApiDef(ApiDefOptions{Folder: folder, Strategy: "heuristic01"})
	res, err := ad.Generate(map[string]any{
		"model": map[string]any{"name": "file-slot", "def": fileSlotDef},
		"build": map[string]any{"spec": map[string]any{"base": folder}},
		"ctrl": map[string]any{"step": map[string]any{
			"parse": true, "guide": true, "transformers": true,
			"builders": false, "generate": false,
		}},
	})
	if err != nil || !res.OK {
		t.Fatalf("generate failed: %v", err)
	}
	base, err := os.ReadFile(filepath.Join(folder, "guide", "base-guide.aontu"))
	if err != nil {
		t.Fatal(err)
	}
	kit, _ := res.ApiModel["main"].(map[string]any)["kit"].(map[string]any)
	return kit, string(base)
}

func fileSlotPoint(entities map[string]any, entity string, method string, path string) map[string]any {
	ent, _ := entities[entity].(map[string]any)
	ops, _ := ent["op"].(map[string]any)
	for _, opname := range sortedKeys(ops) {
		op, _ := ops[opname].(map[string]any)
		points, _ := op["points"].([]any)
		for _, pv := range points {
			point, _ := pv.(map[string]any)
			if point["m"] == method && point["o"] == path {
				return point
			}
		}
	}
	return nil
}

func fileSlotHeaders(point map[string]any) map[string]any {
	out := map[string]any{}
	args, _ := point["g"].(map[string]any)
	headers, _ := args["header"].([]any)
	for _, av := range headers {
		arg, _ := av.(map[string]any)
		out[safeStr(arg["n"])] = arg["a"] != false
	}
	return out
}

func fileSlotExpect(t *testing.T, label string, got any, want any) {
	t.Helper()
	if g, w := normalJSON(t, got), normalJSON(t, want); !reflect.DeepEqual(g, w) {
		t.Errorf("%s\ngot  %s\nwant %s", label, asJSON(g), asJSON(w))
	}
}

func fileSlotSession(entities map[string]any, name string) any {
	ent, _ := entities[name].(map[string]any)
	return ent["session"]
}

func TestFileSlotBinaryPoints(t *testing.T) {
	entities, base := buildFileSlot(t, "guide: {}")
	const audio = "/tracks/{track_id}/audio"
	fileSlotExpect(t, "GET audio", fileSlotPoint(entities, "track", "GET", audio)["bn"],
		map[string]any{"field": "audio", "head": true, "max": 4194304})
	fileSlotExpect(t, "PUT audio", fileSlotPoint(entities, "track", "PUT", audio)["bn"],
		map[string]any{"field": "audio", "max": 4194304})
	fileSlotExpect(t, "cover", fileSlotPoint(entities, "track", "GET", "/tracks/{track_id}/cover")["bn"], nil)
	fileSlotExpect(t, "lyrics", fileSlotPoint(entities, "track_lyric", "GET", "/tracks/{track_id}/lyrics")["bn"], nil)
	fileSlotExpect(t, "append", fileSlotPoint(entities, "upload", "PATCH", "/uploads/{upload_id}")["bn"], nil)
	if fileSlotPoint(entities, "track", "HEAD", audio) != nil {
		t.Errorf("HEAD reached the model")
	}
	for _, line := range []string{
		`\n +action: "audio": binary: field: \*"audio"\|top\n`,
		`\n +action: "audio": binary: head: \*true\n`,
		`\n +action: "audio": binary: max: \*4194304\|top\n`,
		`\n +action: "cover": binary: active: \*false\n`,
	} {
		if !regexp.MustCompile(line).MatchString(base) {
			t.Errorf("base guide lacks %s", line)
		}
	}
}

func TestFileSlotBinaryGuide(t *testing.T) {
	const audio = "/tracks/{track_id}/audio"
	entry := func(facts string) string {
		return `guide: entity: track: path: "` + audio + `": action: "audio": binary: ` + facts
	}
	refused, _ := buildFileSlot(t, entry(`{ field: false, head: false, max: false }`))
	fileSlotExpect(t, "refused", fileSlotPoint(refused, "track", "GET", audio)["bn"], nil)
	set, _ := buildFileSlot(t, entry(`{ field: "meta", max: 10 }`))
	fileSlotExpect(t, "set", fileSlotPoint(set, "track", "GET", audio)["bn"],
		map[string]any{"field": "meta", "head": true, "max": 10})
	off, _ := buildFileSlot(t, entry(`active: false`))
	fileSlotExpect(t, "off", fileSlotPoint(off, "track", "PUT", audio)["bn"], nil)
}

func TestFileSlotSessions(t *testing.T) {
	entities, base := buildFileSlot(t, "guide: {}")
	fileSlotExpect(t, "upload session", fileSlotSession(entities, "upload"),
		map[string]any{"dialect": "tus", "append": "update", "offset": "load"})
	appendPoint := fileSlotPoint(entities, "upload", "PATCH", "/uploads/{upload_id}")
	fileSlotExpect(t, "append exist", appendPoint["q"].(map[string]any)["exist"], []any{"id"})
	fileSlotExpect(t, "append headers", fileSlotHeaders(appendPoint), map[string]any{
		"tus_resumable": false, "upload_checksum": false, "upload_offset": false, "x_trace": true})

	fileSlotExpect(t, "draft session", fileSlotSession(entities, "draft"),
		map[string]any{"dialect": "ietf", "append": "update", "offset": "load"})
	draft := fileSlotPoint(entities, "draft", "PATCH", "/drafts/{draft_id}")
	fileSlotExpect(t, "draft exist", draft["q"].(map[string]any)["exist"], []any{"id"})
	fileSlotExpect(t, "draft headers", fileSlotHeaders(draft),
		map[string]any{"upload_complete": false, "upload_offset": false})

	fileSlotExpect(t, "part session", fileSlotSession(entities, "part"), nil)
	fileSlotExpect(t, "part exist",
		fileSlotPoint(entities, "part", "PATCH", "/parts/{part_id}")["q"].(map[string]any)["exist"],
		[]any{"id", "tus_resumable"})
	fileSlotExpect(t, "track session", fileSlotSession(entities, "track"), nil)

	for _, line := range []string{
		`\n  entity: upload: \{\n(.*\n)*? +session: dialect: \*"tus"\n`,
		`\n  entity: part: \{\n(.*\n)*? +session: active: \*false\n`,
	} {
		if !regexp.MustCompile(line).MatchString(base) {
			t.Errorf("base guide lacks %s", line)
		}
	}
}

func TestFileSlotSessionGuide(t *testing.T) {
	off, _ := buildFileSlot(t, `guide: entity: upload: session: active: false`)
	fileSlotExpect(t, "off session", fileSlotSession(off, "upload"), nil)
	fileSlotExpect(t, "off exist",
		fileSlotPoint(off, "upload", "PATCH", "/uploads/{upload_id}")["q"].(map[string]any)["exist"],
		[]any{"id", "tus_resumable", "upload_offset"})

	on, _ := buildFileSlot(t, `guide: entity: part: session: active: true`)
	fileSlotExpect(t, "on session", fileSlotSession(on, "part"),
		map[string]any{"dialect": "tus", "append": "update", "offset": "load"})
	fileSlotExpect(t, "on exist",
		fileSlotPoint(on, "part", "PATCH", "/parts/{part_id}")["q"].(map[string]any)["exist"], []any{"id"})

	slot, _ := buildFileSlot(t, `guide: entity: upload: session: slot: { entity: "track", action: "audio" }`)
	fileSlotExpect(t, "slot session", fileSlotSession(slot, "upload"), map[string]any{
		"dialect": "tus", "append": "update", "offset": "load",
		"slot": map[string]any{"entity": "track", "action": "audio"}})
}

func TestFileSlotFileFlows(t *testing.T) {
	kit, _ := buildFileSlotKit(t, "guide: {}")
	flows, _ := kit["flow"].(map[string]any)
	audio := func(dir string) []any {
		return []any{map[string]any{"via": "slot", "action": "audio", "dir": dir,
			"content": "bytes", "size": 512, "seed": 1}}
	}
	fileSlotExpect(t, "track flow", flows["FileTrackFlow"], map[string]any{
		"name": "FileTrackFlow", "entity": "track", "kind": "file", "step": []any{
			map[string]any{"o": "create", "i": map[string]any{"ref": "track_ref01"}},
			map[string]any{"o": "update", "i": map[string]any{"ref": "track_ref01", "suffix": "_tf0"},
				"m": map[string]any{"id": "track01"}, "f": audio("put")},
			map[string]any{"o": "load", "i": map[string]any{"ref": "track_ref01", "suffix": "_tf1"},
				"m": map[string]any{"id": "track01"}, "f": audio("get")},
		}})
	lyric, _ := flows["FileTrackLyricFlow"].(map[string]any)
	files := []any{}
	for _, step := range lyric["step"].([]any) {
		files = append(files, step.(map[string]any)["f"])
	}
	fileSlotExpect(t, "lyric flow", files, []any{[]any{
		map[string]any{"via": "body", "action": "", "dir": "get", "content": "text"}}})
	names := []string{}
	for _, name := range sortedKeys(flows) {
		if regexp.MustCompile(`^File`).MatchString(name) {
			names = append(names, name)
		}
	}
	fileSlotExpect(t, "file flows", names, []string{"FilePartFlow", "FileTrackFlow", "FileTrackLyricFlow"})

	off, _ := buildFileSlotKit(t, `guide: entity: track: path: "/tracks/{track_id}/audio": active: false`)
	offFlows, _ := off["flow"].(map[string]any)
	fileSlotExpect(t, "off flow", offFlows["FileTrackFlow"], nil)
	if offFlows["BasicTrackFlow"] == nil {
		t.Error("off build lost BasicTrackFlow")
	}
}

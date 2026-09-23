/* Copyright (c) 2026 Voxgig Ltd, MIT License */

package apidef

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"
)

// Mirrors ts/test/generate.test.ts.

const generateNow = int64(1790000000000)
const generatePrefix = "solar-1.0.0-openapi-3.0.0-"
const generateDef = generatePrefix + "def.yaml"

var generateFiles = []string{
	"entity/" + generatePrefix + "moon.aontu",
	"entity/" + generatePrefix + "planet.aontu",
	"entity/" + generatePrefix + "entity-index.aontu",
	"api/" + generatePrefix + "api-info.aontu",
	"flow/" + generatePrefix + "BasicMoonFlow.aontu",
	"flow/" + generatePrefix + "BasicPlanetFlow.aontu",
	"flow/" + generatePrefix + "flow-index.aontu",
}

func stageGenerate(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	folder := stageGuideEntry(t, filepath.Join(dir, "model"), generatePrefix)
	src, err := os.ReadFile(filepath.Join("..", "ts", "test", "def", generateDef))
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(dir, "def"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "def", generateDef), src, 0644); err != nil {
		t.Fatal(err)
	}
	return folder
}

func runGenerate(t *testing.T, folder string) *ApiDefResult {
	t.Helper()
	res, err := NewApiDef(ApiDefOptions{Folder: folder, OutPrefix: generatePrefix}).Generate(map[string]any{
		"model": map[string]any{"name": "solar", "def": generateDef},
		"build": map[string]any{"spec": map[string]any{"base": folder}},
		"now":   func() int64 { return generateNow },
	})
	if err != nil || res == nil || !res.OK {
		t.Fatalf("generate failed: err=%v res=%+v", err, res)
	}
	return res
}

func relFiles(t *testing.T, folder string, files []string) []string {
	t.Helper()
	out := []string{}
	for _, file := range files {
		r, err := filepath.Rel(folder, filepath.FromSlash(file))
		if err != nil {
			t.Fatal(err)
		}
		out = append(out, filepath.ToSlash(r))
	}
	sort.Strings(out)
	return out
}

func readGenerated(t *testing.T, folder string, file string) string {
	t.Helper()
	src, err := os.ReadFile(filepath.Join(folder, filepath.FromSlash(file)))
	if err != nil {
		t.Fatal(err)
	}
	return string(src)
}

type metaEntry struct {
	Action  string   `json:"action"`
	Exists  bool     `json:"exists"`
	Actions []string `json:"actions"`
	When    int64    `json:"when"`
}

// readMeta returns the meta log and its file keys in document order.
func readMeta(t *testing.T, folder string) (int64, []string, map[string]metaEntry) {
	t.Helper()
	src := readGenerated(t, folder, ".jostraca/jostraca.meta.log")
	var log struct {
		Last  int64                `json:"last"`
		Files map[string]metaEntry `json:"files"`
	}
	if err := json.Unmarshal([]byte(src), &log); err != nil {
		t.Fatal(err)
	}
	keys := []string{}
	for key := range log.Files {
		keys = append(keys, key)
	}
	sort.Slice(keys, func(i, j int) bool {
		return strings.Index(src, `"`+keys[i]+`": {`) < strings.Index(src, `"`+keys[j]+`": {`)
	})
	return log.Last, keys, log.Files
}

func sortedCopy(list []string) []string {
	out := append([]string{}, list...)
	sort.Strings(out)
	return out
}

func TestGenerateFirstRunWritesModelAndBookkeeping(t *testing.T) {
	folder := stageGenerate(t)
	res := runGenerate(t, folder)

	if !res.Reload {
		t.Error("reload: want true")
	}
	if got := relFiles(t, folder, res.Jres.Files.Written); !reflect.DeepEqual(got, sortedCopy(generateFiles)) {
		t.Errorf("written: %v", got)
	}
	if len(res.Jres.Files.Unchanged) != 0 {
		t.Errorf("unchanged: %v", res.Jres.Files.Unchanged)
	}

	last, keys, entries := readMeta(t, folder)
	if last != generateNow {
		t.Errorf("meta last: %d", last)
	}
	if !reflect.DeepEqual(keys, generateFiles) {
		t.Errorf("meta files: %v", keys)
	}
	for _, file := range generateFiles {
		want := metaEntry{Action: "write", Exists: false, Actions: []string{"write"}, When: generateNow}
		if got := entries[file]; !reflect.DeepEqual(got, want) {
			t.Errorf("meta %s: %+v", file, got)
		}
		if readGenerated(t, folder, ".jostraca/generated/"+file) != readGenerated(t, folder, file) {
			t.Errorf("baseline differs from %s", file)
		}
	}

	if got := readGenerated(t, folder, ".jostraca/.gitignore"); got != "\njostraca.meta.log\ngenerated\n" {
		t.Errorf("gitignore: %q", got)
	}
	if !strings.Contains(readGenerated(t, folder, generateFiles[2]), `@"./`+generatePrefix+`moon.aontu"`) {
		t.Error("entity index does not include ./moon")
	}
}

func TestGenerateRerunOverOwnOutputChangesNothing(t *testing.T) {
	folder := stageGenerate(t)
	runGenerate(t, folder)
	before := []string{}
	for _, file := range generateFiles {
		before = append(before, readGenerated(t, folder, file))
	}

	res := runGenerate(t, folder)

	if res.Reload {
		t.Error("reload: want false")
	}
	if len(res.Jres.Files.Written) != 0 {
		t.Errorf("written: %v", res.Jres.Files.Written)
	}
	if got := relFiles(t, folder, res.Jres.Files.Unchanged); !reflect.DeepEqual(got, sortedCopy(generateFiles)) {
		t.Errorf("unchanged: %v", got)
	}
	for i, file := range generateFiles {
		if readGenerated(t, folder, file) != before[i] {
			t.Errorf("%s changed", file)
		}
	}

	_, keys, entries := readMeta(t, folder)
	if !reflect.DeepEqual(keys, generateFiles) {
		t.Errorf("meta files: %v", keys)
	}
	for _, file := range generateFiles {
		if !entries[file].Exists {
			t.Errorf("meta %s: exists false", file)
		}
	}
}

func TestGenerateRerunOverwritesHandEditAndCollectsOrphan(t *testing.T) {
	folder := stageGenerate(t)
	runGenerate(t, folder)

	moon := generateFiles[0]
	generated := readGenerated(t, folder, moon)
	if err := os.WriteFile(filepath.Join(folder, filepath.FromSlash(moon)),
		[]byte(generated+"\n# hand edit\n"), 0644); err != nil {
		t.Fatal(err)
	}
	orphan := filepath.Join(folder, "entity", generatePrefix+"comet.aontu")
	if err := os.WriteFile(orphan, []byte("# Entity: comet\n"), 0644); err != nil {
		t.Fatal(err)
	}

	res := runGenerate(t, folder)

	if !res.Reload {
		t.Error("reload: want true")
	}
	if got := relFiles(t, folder, res.Jres.Files.Written); !reflect.DeepEqual(got, []string{moon}) {
		t.Errorf("written: %v", got)
	}
	if readGenerated(t, folder, moon) != generated {
		t.Error("hand edit survived the rerun")
	}
	if _, err := os.Stat(orphan); !os.IsNotExist(err) {
		t.Error("orphaned entity file was not collected")
	}
}

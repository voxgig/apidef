/* Copyright (c) 2026 Voxgig Ltd, MIT License */

package apidef

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"

	jostraca "github.com/jostraca/jostraca/go"
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
	return stageGenerateGuide(t, "guide: {}")
}

func stageGenerateGuide(t *testing.T, guide string) string {
	t.Helper()
	dir := t.TempDir()
	folder := filepath.Join(dir, "model")
	entry := "@\"@voxgig/apidef/model/guide.aontu\"\n" +
		"@\"./" + generatePrefix + "base-guide.aontu\"\n\n" + guide + "\n"
	if err := writeGuideEntry(folder, generatePrefix, entry); err != nil {
		t.Fatal(err)
	}
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

func generateDefAt(folder string, def string) (*ApiDefResult, error) {
	return NewApiDef(ApiDefOptions{Folder: folder, OutPrefix: generatePrefix}).Generate(map[string]any{
		"model": map[string]any{"name": "solar", "def": def},
		"build": map[string]any{"spec": map[string]any{"base": folder}},
		"now":   func() int64 { return generateNow },
	})
}

func runGenerate(t *testing.T, folder string) *ApiDefResult {
	t.Helper()
	res, err := generateDefAt(folder, generateDef)
	if err != nil || res == nil || !res.OK {
		t.Fatalf("generate failed: err=%v res=%+v", err, res)
	}
	return res
}

// inProject moves to the project folder, where apidef-warnings.txt is written.
func inProject(t *testing.T, folder string) {
	t.Helper()
	t.Chdir(filepath.Dir(folder))
}

func readWarnings(t *testing.T, folder string) (string, bool) {
	t.Helper()
	src, err := os.ReadFile(filepath.Join(filepath.Dir(folder), "apidef-warnings.txt"))
	if os.IsNotExist(err) {
		return "", false
	}
	if err != nil {
		t.Fatal(err)
	}
	return string(src), true
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
	inProject(t, folder)
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
	flowIndex := strings.Join([]string{
		"# Flows\n",
		`@"./` + generatePrefix + `BasicMoonFlow.aontu"`,
		`@"./` + generatePrefix + `BasicPlanetFlow.aontu"`,
	}, "\n")
	if got := readGenerated(t, folder, generateFiles[6]); got != flowIndex {
		t.Errorf("flow index: %q", got)
	}

	entity, _ := getKit(res.Ctx)["entity"].(map[string]any)
	if moon, _ := entity["moon"].(map[string]any); moon["key$"] != "moon" {
		t.Errorf("moon key$: %v", moon["key$"])
	}
	if text, ok := readWarnings(t, folder); ok {
		t.Errorf("a clean run wrote apidef-warnings.txt: %s", text)
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

func TestGenerateUpgradeRemovesLegacyAonTwins(t *testing.T) {
	folder := stageGenerate(t)
	legacy := []string{
		"api/" + generatePrefix + "api-info.aon",
		"entity/" + generatePrefix + "entity-index.aon",
		"flow/" + generatePrefix + "BasicMoonFlow.aon",
		"flow/" + generatePrefix + "BasicPlanetFlow.aon",
		"flow/" + generatePrefix + "flow-index.aon",
		"guide/" + generatePrefix + "base-guide.aon",
	}
	kept := []string{
		"api/notes.aon",
		"flow/" + generatePrefix + "BasicCometFlow.aon",
		"guide/" + generatePrefix + "guide.aon",
	}
	for _, file := range append(append([]string{}, legacy...), kept...) {
		path := filepath.Join(folder, filepath.FromSlash(file))
		if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte("# old\n"), 0644); err != nil {
			t.Fatal(err)
		}
	}

	runGenerate(t, folder)

	for _, file := range legacy {
		if _, err := os.Stat(filepath.Join(folder, filepath.FromSlash(file))); !os.IsNotExist(err) {
			t.Errorf("legacy file %s was not removed", file)
		}
	}
	for _, file := range kept {
		if _, err := os.Stat(filepath.Join(folder, filepath.FromSlash(file))); err != nil {
			t.Errorf("file %s was removed: %v", file, err)
		}
	}
}

func TestGenerateWarningsFileIsWrittenOnSuccess(t *testing.T) {
	folder := stageGenerateGuide(t, `guide: entity: planet: path: "/api/planet": op: frob: method: "POST"`)
	inProject(t, folder)
	runGenerate(t, folder)

	text, ok := readWarnings(t, folder)
	if !ok || !strings.Contains(text, "on entity=planet path=/api/planet is dropped") {
		t.Errorf("warnings: %q", text)
	}
	if strings.Contains(text, "!! BUILD FAILED !!") {
		t.Errorf("warnings report a failure: %s", text)
	}
}

func TestGenerateWriteFailureFailsBuildAndWritesWarnings(t *testing.T) {
	folder := stageGenerate(t)
	if err := os.WriteFile(filepath.Join(folder, "entity"),
		[]byte("a file where the entity folder goes\n"), 0644); err != nil {
		t.Fatal(err)
	}
	inProject(t, folder)

	res, err := generateDefAt(folder, generateDef)

	if err == nil || res == nil || res.OK || res.Err == nil {
		t.Fatalf("want a failed build: err=%v res=%+v", err, res)
	}
	if want := []string{"parse", "guide", "transformers", "builders"}; !reflect.DeepEqual(res.Steps, want) {
		t.Errorf("steps: %v", res.Steps)
	}
	if text, _ := readWarnings(t, folder); !strings.Contains(text, "!! BUILD FAILED !!") {
		t.Errorf("warnings: %q", text)
	}
}

func TestGeneratePreGenerateFailureWritesWarnings(t *testing.T) {
	folder := stageGenerate(t)
	inProject(t, folder)

	res, err := generateDefAt(folder, "missing-def.yaml")

	if err == nil || res == nil || res.OK || res.Err == nil {
		t.Fatalf("want a failed build: err=%v res=%+v", err, res)
	}
	if len(res.Steps) != 0 {
		t.Errorf("steps: %v", res.Steps)
	}
	if text, _ := readWarnings(t, folder); !strings.Contains(text, "!! BUILD FAILED !!") {
		t.Errorf("warnings: %q", text)
	}
}

func TestGenerateParseFailureWritesWarnings(t *testing.T) {
	folder := stageGenerate(t)
	if err := os.WriteFile(filepath.Join(filepath.Dir(folder), "def", "bad.yaml"),
		[]byte("a: [\n  b: }\n"), 0644); err != nil {
		t.Fatal(err)
	}
	inProject(t, folder)

	res, err := generateDefAt(folder, "bad.yaml")

	if err == nil || res == nil || res.OK {
		t.Fatalf("want a failed build: err=%v res=%+v", err, res)
	}
	if 0 != len(res.Steps) {
		t.Errorf("steps: %v", res.Steps)
	}
	if text, _ := readWarnings(t, folder); !strings.Contains(text, "!! BUILD FAILED !!") {
		t.Errorf("warnings: %q", text)
	}
}

func TestGenerateGuideFailureWritesWarnings(t *testing.T) {
	folder := stageGenerateGuide(t, `@"./nope.aontu"`)
	inProject(t, folder)

	res, err := generateDefAt(folder, generateDef)

	if err == nil || res == nil || res.OK {
		t.Fatalf("want a failed build: err=%v res=%+v", err, res)
	}
	if want := []string{"parse"}; !reflect.DeepEqual(res.Steps, want) {
		t.Errorf("steps: %v", res.Steps)
	}
	if text, _ := readWarnings(t, folder); !strings.Contains(text, "!! BUILD FAILED !!") {
		t.Errorf("warnings: %q", text)
	}
}

type levelLog struct{ calls []string }

func (l *levelLog) add(level string, args []any) {
	l.calls = append(l.calls, level+" "+fmt.Sprint(args...))
}
func (l *levelLog) Info(args ...any)  { l.add("info", args) }
func (l *levelLog) Debug(args ...any) { l.add("debug", args) }
func (l *levelLog) Warn(args ...any)  { l.add("warn", args) }
func (l *levelLog) Error(args ...any) { l.add("error", args) }

// jostraca's replayed warnings reach apidef's logger, as TS passes its own,
// and are dropped rather than printed when there is none.
func TestJostracaLogForwardsToApidefLogger(t *testing.T) {
	rec := &levelLog{}
	var jl jostraca.Log = jostracaLog{rec}
	jl.Trace("t")
	jl.Debug("d")
	jl.Info("i")
	jl.Warn("w")
	jl.Error("e")
	jl.Fatal("f")
	want := []string{"debug t", "debug d", "info i", "warn w", "error e", "error f"}
	if !reflect.DeepEqual(rec.calls, want) {
		t.Fatalf("got %q, want %q", rec.calls, want)
	}
	jostracaLog{}.Debug("dropped")
}

/* Copyright (c) 2026 Voxgig, MIT License */

package apidef

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"strings"
	"testing"

	aontu "github.com/aontu-lang/aontu/go"
)

// Mirrors ts/test/guide-overlay.test.ts.

const overlayPrefix = "solar-1.0.0-openapi-3.0.0-"
const overlayDef = overlayPrefix + "def.yaml"

const overlayHead = "@\"@voxgig/apidef/model/guide.aontu\"\n" +
	"@\"./" + overlayPrefix + "base-guide.aontu\"\n"

func stageOverlay(t *testing.T, entry *string) string {
	t.Helper()
	dir := t.TempDir()
	folder := filepath.Join(dir, "model")
	if err := os.MkdirAll(filepath.Join(folder, "guide"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(dir, "def"), 0755); err != nil {
		t.Fatal(err)
	}
	def, err := os.ReadFile(filepath.Join("..", "ts", "test", "def", overlayDef))
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "def", overlayDef), def, 0644); err != nil {
		t.Fatal(err)
	}
	if entry != nil {
		guidePath := filepath.Join(folder, "guide", overlayPrefix+"guide.aontu")
		if err := os.WriteFile(guidePath, []byte(*entry), 0644); err != nil {
			t.Fatal(err)
		}
	}
	return folder
}

// writeGuideEntry writes the entry file a build needs; an empty entry is the
// no-customization overlay ts/build/model-ref.js writes.
func writeGuideEntry(folder string, prefix string, entry string) error {
	dir := filepath.Join(folder, "guide")
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	if entry == "" {
		entry = "# Guide entry file: put customizations below the includes. The base guide\n" +
			"# it includes is generated and overwritten on every build.\n" +
			"@\"@voxgig/apidef/model/guide.aontu\"\n" +
			"@\"./" + prefix + "base-guide.aontu\"\n\nguide: {}\n"
	}
	return os.WriteFile(filepath.Join(dir, prefix+"guide.aontu"), []byte(entry), 0644)
}

func stageGuideEntry(t *testing.T, folder string, prefix string) string {
	t.Helper()
	if err := writeGuideEntry(folder, prefix, ""); err != nil {
		t.Fatal(err)
	}
	return folder
}

// validateOverlay is apidef-validate's own overlay for a case, as its Go
// harness copies it, or empty when the checkout has none.
func validateOverlay(validateDir string, cn string) string {
	src, _ := os.ReadFile(filepath.Join(validateDir, "guide", cn+"-guide.aontu"))
	return string(src)
}

func stageValidateOverlay(t *testing.T, validateDir string, folder string, cn string) string {
	t.Helper()
	if err := writeGuideEntry(folder, cn+"-", validateOverlay(validateDir, cn)); err != nil {
		t.Fatal(err)
	}
	return folder
}

func runOverlay(folder string) (*ApiDefResult, error) {
	ad := NewApiDef(ApiDefOptions{
		Folder:    folder,
		OutPrefix: overlayPrefix,
		Strategy:  "heuristic01",
	})
	return ad.Generate(map[string]any{
		"model": map[string]any{"name": "solar", "def": overlayDef},
		"build": map[string]any{"spec": map[string]any{"base": folder}},
		"ctrl": map[string]any{"step": map[string]any{
			"parse": true, "guide": true, "transformers": true,
			"builders": false, "generate": false,
		}},
	})
}

func overlayEntities(t *testing.T, res *ApiDefResult) map[string]any {
	t.Helper()
	kit, _ := res.ApiModel["main"].(map[string]any)["kit"].(map[string]any)
	entities, _ := kit["entity"].(map[string]any)
	return entities
}

func overlayOps(t *testing.T, res *ApiDefResult, name string) string {
	t.Helper()
	ent, _ := overlayEntities(t, res)[name].(map[string]any)
	ops, _ := ent["op"].(map[string]any)
	return strings.Join(sortedKeys(ops), ",")
}

func overlayEntry(lines ...string) *string {
	src := overlayHead + strings.Join(lines, "\n") + "\n"
	return &src
}

func TestGuideOverlayCustomizationsHonoured(t *testing.T) {
	res, err := runOverlay(stageOverlay(t, overlayEntry(
		`guide: entity: moon: active: false`,
		`guide: entity: planet: path: "/api/planet/{planet_id}": op: remove: active: false`,
	)))
	if err != nil || !res.OK {
		t.Fatalf("generate failed: %v", err)
	}

	moon, _ := res.Guide["entity"].(map[string]any)["moon"].(map[string]any)
	if false != moon["active"] {
		t.Errorf("guide moon.active = %v, want false", moon["active"])
	}
	if got := strings.Join(sortedKeys(overlayEntities(t, res)), ","); got != "planet" {
		t.Errorf("entities = %s, want planet", got)
	}
	if got := overlayOps(t, res, "planet"); got != "create,list,load,update" {
		t.Errorf("planet ops = %s, want create,list,load,update", got)
	}
}

func TestGuideOverlayIdCorrectionReachesGuide(t *testing.T) {
	res, err := runOverlay(stageOverlay(t, overlayEntry(
		`guide: entity: planet: id: {`,
		`  parts: [ "planet_id" ]`,
		`  sep: ":"`,
		`  composite: *true`,
		`  from: planet_id: "id"`,
		`}`,
	)))
	if err != nil || !res.OK {
		t.Fatalf("generate failed: %v", err)
	}

	planet, _ := res.Guide["entity"].(map[string]any)["planet"].(map[string]any)
	got, _ := json.Marshal(planet["id"])
	var gotv, want any
	json.Unmarshal(got, &gotv)
	json.Unmarshal([]byte(
		`{"parts":["planet_id"],"sep":":","composite":true,"from":{"planet_id":"id"}}`), &want)
	if !reflect.DeepEqual(gotv, want) {
		t.Errorf("planet id = %s", got)
	}
}

func TestGuideOverlayBareMatchesHeuristic(t *testing.T) {
	res, err := runOverlay(stageOverlay(t, overlayEntry(`guide: {}`)))
	if err != nil || !res.OK {
		t.Fatalf("generate failed: %v", err)
	}
	if got := strings.Join(sortedKeys(overlayEntities(t, res)), ","); got != "moon,planet" {
		t.Errorf("entities = %s, want moon,planet", got)
	}
	if got := overlayOps(t, res, "planet"); got != "create,list,load,remove,update" {
		t.Errorf("planet ops = %s, want create,list,load,remove,update", got)
	}
}

func TestGuideOverlayBaseGuideOverwritten(t *testing.T) {
	folder := stageOverlay(t, overlayEntry(`guide: {}`))
	basePath := filepath.Join(folder, "guide", overlayPrefix+"base-guide.aontu")
	stale := "<<<<<<< ours\nguide: entity: moon: active: false\n=======\n>>>>>>> theirs\n"
	if err := os.WriteFile(basePath, []byte(stale), 0644); err != nil {
		t.Fatal(err)
	}

	res, err := runOverlay(folder)
	if err != nil || !res.OK {
		t.Fatalf("generate failed: %v", err)
	}

	base, err := os.ReadFile(basePath)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(string(base), strings.Join(baseGuideHeader(overlayPrefix), "\n")+"\n") {
		t.Errorf("base guide lacks its header:\n%s", base)
	}
	if strings.Contains(string(base), "<<<<<<<") {
		t.Errorf("stale base guide survived:\n%s", base)
	}
	if got := strings.Join(sortedKeys(overlayEntities(t, res)), ","); got != "moon,planet" {
		t.Errorf("entities = %s, want moon,planet", got)
	}
}

func stageOverlayFile(t *testing.T, name string, lines ...string) string {
	t.Helper()
	folder := stageOverlay(t, nil)
	src := strings.Join(lines, "\n") + "\n"
	if err := os.WriteFile(filepath.Join(folder, "guide", name), []byte(src), 0644); err != nil {
		t.Fatal(err)
	}
	return folder
}

func readOverlayFile(t *testing.T, folder string, name string) string {
	t.Helper()
	src, err := os.ReadFile(filepath.Join(folder, "guide", name))
	if err != nil {
		t.Fatal(err)
	}
	return string(src)
}

func TestGuideOverlayNoGuideFails(t *testing.T) {
	for _, entry := range []string{"", "# nothing\n", "foo: 1\n"} {
		folder := stageOverlay(t, &entry)
		res, err := runOverlay(folder)
		if err == nil || res.OK {
			t.Fatalf("%q: expected the build to fail", entry)
		}
		want := missingGuideMessage(
			filepath.Join(folder, "guide", overlayPrefix+"guide.aontu"), overlayPrefix)
		if !strings.Contains(err.Error(), want) {
			t.Errorf("%q: error = %q, want it to contain %q", entry, err.Error(), want)
		}
	}
}

func TestGuideOverlayLegacyEntryMigrated(t *testing.T) {
	for _, dir := range []string{"", "./"} {
		folder := stageOverlayFile(t, overlayPrefix+"guide.aon",
			`@"@voxgig/apidef/model/guide.aon"`,
			`@"`+dir+overlayPrefix+`base-guide.aon"`,
			`guide: entity: moon: active: false`,
		)
		res, err := runOverlay(folder)
		if err != nil || !res.OK {
			t.Fatalf("%q: generate failed: %v", dir, err)
		}
		if pathExists(filepath.Join(folder, "guide", overlayPrefix+"guide.aon")) {
			t.Errorf("%q: legacy entry file survived", dir)
		}
		entry := readOverlayFile(t, folder, overlayPrefix+"guide.aontu")
		if !strings.Contains(entry, `@"@voxgig/apidef/model/guide.aontu"`) ||
			!strings.Contains(entry, `@"./`+overlayPrefix+`base-guide.aontu"`) {
			t.Errorf("%q: entry not migrated:\n%s", dir, entry)
		}
		if got := strings.Join(sortedKeys(overlayEntities(t, res)), ","); got != "planet" {
			t.Errorf("%q: entities = %s, want planet", dir, got)
		}
	}
}

func TestGuideOverlayLegacyIncludeMigrated(t *testing.T) {
	folder := stageOverlayFile(t, overlayPrefix+"guide.aontu",
		`@"@voxgig/apidef/model/guide.aontu"`,
		`@"./`+overlayPrefix+`base-guide.aon"`,
		`guide: entity: moon: active: false`,
	)
	res, err := runOverlay(folder)
	if err != nil || !res.OK {
		t.Fatalf("generate failed: %v", err)
	}
	entry := readOverlayFile(t, folder, overlayPrefix+"guide.aontu")
	if !strings.Contains(entry, `@"./`+overlayPrefix+`base-guide.aontu"`) {
		t.Errorf("entry not migrated:\n%s", entry)
	}
	if got := strings.Join(sortedKeys(overlayEntities(t, res)), ","); got != "planet" {
		t.Errorf("entities = %s, want planet", got)
	}
}

func TestGuideOverlayBareIncludeMigrated(t *testing.T) {
	folder := stageOverlayFile(t, overlayPrefix+"guide.aontu",
		`@"@voxgig/apidef/model/guide.aontu"`,
		`@"`+overlayPrefix+`base-guide.aontu"`,
		`guide: entity: moon: active: false`,
	)
	res, err := runOverlay(folder)
	if err != nil || !res.OK {
		t.Fatalf("generate failed: %v", err)
	}
	entry := readOverlayFile(t, folder, overlayPrefix+"guide.aontu")
	if !strings.Contains(entry, `@"./`+overlayPrefix+`base-guide.aontu"`) {
		t.Errorf("entry not migrated:\n%s", entry)
	}
	if got := strings.Join(sortedKeys(overlayEntities(t, res)), ","); got != "planet" {
		t.Errorf("entities = %s, want planet", got)
	}
}

func TestGuideOverlaySchemaIncludeSpellings(t *testing.T) {
	for _, include := range []string{
		`@'@voxgig/apidef/model/guide.aontu'`,
		`@ "@voxgig/apidef/model/guide.aontu"`,
		"@`@voxgig/apidef/model/guide.aontu`",
		"@\n\"@voxgig/apidef/model/guide.aontu\"",
	} {
		res, err := runOverlay(stageOverlayFile(t, overlayPrefix+"guide.aontu",
			include,
			`@"./`+overlayPrefix+`base-guide.aontu"`,
			`guide: entity: moon: active: false`,
		))
		if err != nil || !res.OK {
			t.Fatalf("%q: generate failed: %v", include, err)
		}
		if got := strings.Join(sortedKeys(overlayEntities(t, res)), ","); got != "planet" {
			t.Errorf("%q: entities = %s, want planet", include, got)
		}
	}
}

// The TS port resolves this through node_modules; aontu Go has no package
// resolver, so the embedded schema reaches only the entry file.
func TestGuideOverlayNestedSchemaInclude(t *testing.T) {
	folder := stageOverlayFile(t, overlayPrefix+"guide.aontu",
		`@"./shared.aontu"`,
		`guide: entity: moon: active: false`,
	)
	if err := os.WriteFile(filepath.Join(folder, "guide", "shared.aontu"),
		[]byte(overlayHead), 0644); err != nil {
		t.Fatal(err)
	}
	res, err := runOverlay(folder)
	if err == nil || res.OK {
		t.Fatal("expected the nested schema include to fail in Go")
	}
	if !strings.Contains(err.Error(), "only to the guide entry file") {
		t.Errorf("error does not explain the limit: %v", err)
	}
}

func TestGuideOverlayRelativeTmpdir(t *testing.T) {
	folder := stageOverlay(t, overlayEntry(`guide: {}`))
	base := t.TempDir()
	t.Chdir(base)
	if err := os.Mkdir("reltmp", 0755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("TMPDIR", "reltmp")
	res, err := runOverlay(folder)
	if err != nil || !res.OK {
		t.Fatalf("generate failed with a relative TMPDIR: %v", err)
	}
}

func TestGuideOverlayMissingEntryFails(t *testing.T) {
	res, err := runOverlay(stageOverlay(t, nil))
	if err == nil || res.OK {
		t.Fatal("expected a missing guide entry file to fail the build")
	}
	if !strings.Contains(err.Error(), "guide.aontu") {
		t.Errorf("error does not name the entry file: %v", err)
	}
}

func TestGuideOverlayConflictMarkerFails(t *testing.T) {
	folder := stageOverlay(t, overlayEntry(
		`<<<<<<< ours`,
		`guide: entity: moon: active: false`,
		`=======`,
		`>>>>>>> theirs`,
	))
	res, err := runOverlay(folder)
	if err == nil || res.OK {
		t.Fatal("expected a conflict marker to fail the build")
	}
	entry := filepath.Join(folder, "guide", overlayPrefix+"guide.aontu")
	want := "@voxgig/apidef: guide: unresolved merge conflict at " + entry + ":3\n" +
		"  <<<<<<< ours\n" +
		"Resolve the marked block in " + entry + "."
	if !strings.Contains(err.Error(), want) {
		t.Errorf("error = %q, want it to contain %q", err.Error(), want)
	}
}

func TestGuideOverlayTypeErrorFails(t *testing.T) {
	res, err := runOverlay(stageOverlay(t, overlayEntry(`guide: entity: moon: active: "no"`)))
	if err == nil || res.OK {
		t.Fatal("expected a type error in the overlay to fail the build")
	}
	if !strings.HasPrefix(err.Error(), "SUMMARY (1 errors): ") {
		t.Errorf("not summarised: %v", err)
	}
	if !regexp.MustCompile(`no_scalar_unify`).MatchString(err.Error()) {
		t.Errorf("unexpected error: %v", err)
	}
	var aerr *aontu.AontuError
	if !errors.As(err, &aerr) || "no_scalar_unify" != aerr.Code {
		t.Errorf("aontu error = %#v", aerr)
	}
	if strings.Contains(err.Error(), "apidef-model-") {
		t.Errorf("error cites the temporary schema copy: %v", err)
	}
	if !strings.Contains(err.Error(), "@voxgig/apidef/model/guide.aontu") {
		t.Errorf("error does not name the schema as written: %v", err)
	}
}

func TestGuideOverlayAontuFailuresSummarised(t *testing.T) {
	for _, c := range []struct{ name, line, why, text string }{
		{"incomplete-value", `extra: string`, "mapval_no_gen", "mapval_no_gen"},
		{"syntax-error", `}}}`, "syntax", "unexpected character"},
		{"missing-include", `@"./nope.aontu"`, "multisource_not_found", "source not found: ./nope.aontu"},
	} {
		t.Run(c.name, func(t *testing.T) {
			res, err := runOverlay(stageOverlay(t, overlayEntry(c.line)))
			if err == nil || res.OK {
				t.Fatal("expected the build to fail")
			}
			if !strings.HasPrefix(err.Error(), "SUMMARY (1 errors): ") ||
				!strings.Contains(err.Error(), c.text) {
				t.Errorf("error = %q", err.Error())
			}
			var aerr *aontu.AontuError
			if !errors.As(err, &aerr) || c.why != aerr.Code {
				t.Errorf("aontu error = %#v, want code %s", aerr, c.why)
			}
		})
	}
}

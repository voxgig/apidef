/* Copyright (c) 2026 Voxgig, MIT License */

package apidef

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"strings"
	"testing"
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
		entry = "@\"@voxgig/apidef/model/guide.aontu\"\n\n" +
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
	res, err := runOverlay(stageOverlay(t, overlayEntry(
		`<<<<<<< ours`,
		`guide: entity: moon: active: false`,
		`=======`,
		`>>>>>>> theirs`,
	)))
	if err == nil || res.OK {
		t.Fatal("expected a conflict marker to fail the build")
	}
	if !strings.Contains(err.Error(), "unresolved merge conflict") {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestGuideOverlayTypeErrorFails(t *testing.T) {
	res, err := runOverlay(stageOverlay(t, overlayEntry(`guide: entity: moon: active: "no"`)))
	if err == nil || res.OK {
		t.Fatal("expected a type error in the overlay to fail the build")
	}
	if !regexp.MustCompile(`no_scalar_unify`).MatchString(err.Error()) {
		t.Errorf("unexpected error: %v", err)
	}
}

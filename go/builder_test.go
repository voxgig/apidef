/* Copyright (c) 2026 Voxgig Ltd, MIT License */

package apidef

import (
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"

	jostraca "github.com/jostraca/jostraca/go"
)

// Mirrors the entity-gc suite in ts/test/apidef.test.ts and
// ts/test/flow-file-case.test.ts.

func gcModel(t *testing.T, files map[string]string) string {
	t.Helper()
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "entity"), 0755); err != nil {
		t.Fatal(err)
	}
	for name, content := range files {
		if err := os.WriteFile(filepath.Join(dir, "entity", name), []byte(content), 0644); err != nil {
			t.Fatal(err)
		}
	}
	return dir
}

func gcGenerated(name string) string {
	return "# Entity: " + name + "\n\nmain: kit: entity: " + name + ": {}\n"
}

func gcListing(t *testing.T, dir string) []string {
	t.Helper()
	entries, err := os.ReadDir(filepath.Join(dir, "entity"))
	if err != nil {
		t.Fatal(err)
	}
	names := []string{}
	for _, entry := range entries {
		names = append(names, entry.Name())
	}
	sort.Strings(names)
	return names
}

func TestGcEntityFilesRemovesUnderivedEntities(t *testing.T) {
	dir := gcModel(t, map[string]string{
		"country.aontu":      gcGenerated("country"),
		"list_country.aontu": gcGenerated("list_country"),
		"entity-index.aontu": "# Entity Models\n",
	})
	if got := GcEntityFiles(nil, dir, "", []string{"country"}); !reflect.DeepEqual(got, []string{"list_country.aontu"}) {
		t.Errorf("removed: %v", got)
	}
	if got := gcListing(t, dir); !reflect.DeepEqual(got, []string{"country.aontu", "entity-index.aontu"}) {
		t.Errorf("listing: %v", got)
	}
}

func TestGcEntityFilesLeavesFilesItDidNotWrite(t *testing.T) {
	dir := gcModel(t, map[string]string{
		"country.aontu": gcGenerated("country"),
		"custom.aontu":  "# my hand-written model fragment\nfoo: 1\n",
		"notes.txt":     "not aontu at all",
	})
	if got := GcEntityFiles(nil, dir, "", []string{"country"}); len(got) != 0 {
		t.Errorf("removed: %v", got)
	}
	if got := gcListing(t, dir); !reflect.DeepEqual(got, []string{"country.aontu", "custom.aontu", "notes.txt"}) {
		t.Errorf("listing: %v", got)
	}
}

func TestGcEntityFilesRespectsOutprefix(t *testing.T) {
	dir := gcModel(t, map[string]string{
		"solar-planet.aontu":       gcGenerated("planet"),
		"solar-moon.aontu":         gcGenerated("moon"),
		"solar-entity-index.aontu": "# Entity Models\n",
		"lunar-crater.aontu":       gcGenerated("crater"),
	})
	if got := GcEntityFiles(nil, dir, "solar-", []string{"planet"}); !reflect.DeepEqual(got, []string{"solar-moon.aontu"}) {
		t.Errorf("removed: %v", got)
	}
	want := []string{"lunar-crater.aontu", "solar-entity-index.aontu", "solar-planet.aontu"}
	if got := gcListing(t, dir); !reflect.DeepEqual(got, want) {
		t.Errorf("listing: %v", got)
	}
}

func TestGcEntityFilesCollectsLegacyAon(t *testing.T) {
	dir := gcModel(t, map[string]string{
		"solar-planet.aontu":       gcGenerated("planet"),
		"solar-planet.aon":         gcGenerated("planet"),
		"solar-old.aon":            gcGenerated("old"),
		"solar-notes.aon":          "# my notes\n",
		"solar-entity-index.aontu": "# Entity Models\n",
	})
	removed := GcEntityFiles(nil, dir, "solar-", []string{"planet"})
	if got := sortedCopy(removed); !reflect.DeepEqual(got, []string{"solar-old.aon", "solar-planet.aon"}) {
		t.Errorf("removed: %v", got)
	}
	want := []string{"solar-entity-index.aontu", "solar-notes.aon", "solar-planet.aontu"}
	if got := gcListing(t, dir); !reflect.DeepEqual(got, want) {
		t.Errorf("listing: %v", got)
	}
}

func TestGcEntityFilesKeepsCurrentSetAndToleratesNoFolder(t *testing.T) {
	dir := gcModel(t, map[string]string{
		"a.aontu":            gcGenerated("a"),
		"b.aontu":            gcGenerated("b"),
		"entity-index.aontu": "# Entity Models\n",
	})
	if got := GcEntityFiles(nil, dir, "", []string{"a", "b"}); len(got) != 0 {
		t.Errorf("removed: %v", got)
	}
	if got := gcListing(t, dir); !reflect.DeepEqual(got, []string{"a.aontu", "b.aontu", "entity-index.aontu"}) {
		t.Errorf("listing: %v", got)
	}
	if got := GcEntityFiles(nil, t.TempDir(), "", []string{"a"}); len(got) != 0 {
		t.Errorf("removed without an entity folder: %v", got)
	}
}

func TestFlowFileBasesLeavesDistinctNamesAlone(t *testing.T) {
	got := flowFileBases([]string{"BasicAccountFlow", "BasicCheckFlow"})
	want := map[string]string{"BasicAccountFlow": "BasicAccountFlow", "BasicCheckFlow": "BasicCheckFlow"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("bases: %v", got)
	}
}

func TestFlowFileBasesSuffixesEveryCaseCollision(t *testing.T) {
	got := flowFileBases([]string{"BasicStaticIpFlow", "BasicStaticIPFlow"})
	if got["BasicStaticIPFlow"] != "BasicStaticIPFlow__1" || got["BasicStaticIpFlow"] != "BasicStaticIpFlow__2" {
		t.Errorf("bases: %v", got)
	}
	if !reflect.DeepEqual(got, flowFileBases([]string{"BasicStaticIPFlow", "BasicStaticIpFlow"})) {
		t.Error("bases depend on arrival order")
	}
}

func TestFlowFileBasesHandlesGroupsOfThree(t *testing.T) {
	got := flowFileBases([]string{"BasicABFlow", "BasicAbFlow", "BasicaBFlow"})
	lower := map[string]bool{}
	for _, base := range got {
		lower[strings.ToLower(base)] = true
		if !strings.Contains(base, "__") {
			t.Errorf("%s kept its bare name", base)
		}
	}
	if len(lower) != 3 {
		t.Errorf("bases collide: %v", got)
	}
}

func TestFlowBuilderWritesCaseCollisionsToTheirOwnFiles(t *testing.T) {
	folder := t.TempDir()
	ctx := &ApiDefContext{
		Opts: ApiDefOptions{Folder: folder, OutPrefix: "x-"},
		ApiModel: map[string]any{"main": map[string]any{KIT: map[string]any{"flow": map[string]any{
			"BasicStaticIpFlow": map[string]any{"name": "BasicStaticIpFlow"},
			"BasicStaticIPFlow": map[string]any{"name": "BasicStaticIPFlow"},
		}}}},
		Warn: MakeWarner("warning", nil),
	}
	builder, err := MakeFlowBuilder(ctx)
	if err != nil {
		t.Fatal(err)
	}

	write, merge := true, false
	_, err = jostraca.New(jostraca.WithNow(func() int64 { return 1 })).Generate(jostraca.Options{
		Folder:   folder,
		Model:    map[string]any{},
		Existing: jostraca.Existing{Txt: jostraca.ExistingTxt{Write: &write, Merge: &merge}},
	}, func(j *jostraca.J) {
		j.Project(jostraca.ProjectProps{Folder: "."}, func(j *jostraca.J) { builder(j) })
	})
	if err != nil {
		t.Fatal(err)
	}

	flowdir := filepath.Join(folder, "flow")
	entries, err := os.ReadDir(flowdir)
	if err != nil {
		t.Fatal(err)
	}
	names := []string{}
	for _, entry := range entries {
		names = append(names, entry.Name())
	}
	want := []string{"x-BasicStaticIPFlow__1.aontu", "x-BasicStaticIpFlow__2.aontu", "x-flow-index.aontu"}
	if got := sortedCopy(names); !reflect.DeepEqual(got, want) {
		t.Errorf("flow files: %v", got)
	}

	index, _ := os.ReadFile(filepath.Join(flowdir, "x-flow-index.aontu"))
	wantIndex := "# Flows\n\n" + `@"./x-BasicStaticIPFlow__1.aontu"` + "\n" + `@"./x-BasicStaticIpFlow__2.aontu"`
	if string(index) != wantIndex {
		t.Errorf("flow index: %q", index)
	}
	second, _ := os.ReadFile(filepath.Join(flowdir, "x-BasicStaticIpFlow__2.aontu"))
	if !strings.Contains(string(second), "main: kit: flow: BasicStaticIpFlow:") {
		t.Errorf("second flow file: %s", second)
	}

	notes := []string{}
	for _, w := range ctx.Warn.History() {
		notes = append(notes, w["note"].(string))
	}
	wantNotes := []string{
		"flow name BasicStaticIPFlow collides with another when case is ignored:" +
			" file written as BasicStaticIPFlow__1.aontu",
		"flow name BasicStaticIpFlow collides with another when case is ignored:" +
			" file written as BasicStaticIpFlow__2.aontu",
	}
	if !reflect.DeepEqual(notes, wantNotes) {
		t.Errorf("warnings: %v", notes)
	}
}

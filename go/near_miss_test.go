package apidef

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

// Mirrors ts/test/near-miss.test.ts.
func nearMissBuild(t *testing.T, why *WhyOptions) (*ApiDefResult, string) {
	t.Helper()
	base, err := filepath.Abs("../ts/test/rulings")
	if err != nil {
		t.Fatal(err)
	}
	folder := stageGuideEntry(t, t.TempDir(), "")
	dir := t.TempDir()
	t.Chdir(dir)
	res, err := NewApiDef(ApiDefOptions{Folder: folder, Strategy: "heuristic01", Why: why}).Generate(map[string]any{
		"model": map[string]any{"name": "near-miss", "def": "collection-owner-def.json"},
		"build": map[string]any{"spec": map[string]any{"base": base}},
		"ctrl": map[string]any{"step": map[string]any{
			"parse": true, "guide": true, "transformers": false,
			"builders": false, "generate": false,
		}},
	})
	if err != nil || res == nil || !res.OK {
		t.Fatalf("generate failed: err=%v", err)
	}
	return res, filepath.Join(dir, "apidef-near-misses.txt")
}

func TestNearMissReportWrittenWithWhy(t *testing.T) {
	res, file := nearMissBuild(t, &WhyOptions{Show: true})
	src, err := os.ReadFile(file)
	if err != nil {
		t.Fatal(err)
	}
	if string(src) != NearMissText(res.Ctx.NearMiss) {
		t.Errorf("report differs from the near-miss list:\n%s", src)
	}
	if !strings.Contains(string(src), "\n-2\tGET /teams\tmember\tteam (path, response)\n") {
		t.Errorf("report lacks the /teams line:\n%s", src)
	}
}

func TestNearMissReportKeptInMemoryWithoutWhy(t *testing.T) {
	res, file := nearMissBuild(t, nil)
	if _, err := os.Stat(file); !os.IsNotExist(err) {
		t.Errorf("report written without why: %v", err)
	}
	want := NearMissEntry{Route: "GET /teams", Entity: "member", NearMissResult: NearMissResult{
		Margin: -2, Support: []string{},
		Alternatives: []NearMissAlternative{{Name: "team", Sources: []string{"path", "response"}}},
	}}
	if len(res.Ctx.NearMiss) == 0 || !reflect.DeepEqual(res.Ctx.NearMiss[0], want) {
		t.Errorf("first near miss = %+v, want %+v", res.Ctx.NearMiss, want)
	}
}

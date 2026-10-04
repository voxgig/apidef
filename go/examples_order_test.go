/* Copyright (c) 2026 Voxgig Ltd, MIT License */

package apidef

import (
	"testing"

	tabnas "github.com/tabnas/parser/go"
	yaml "github.com/tabnas/yaml/go"
)

// parseOrdered reads a row as Parse reads a definition, so a map of named
// examples keeps the order it is declared in.
func parseOrdered(t *testing.T, src string) map[string]any {
	t.Helper()
	tree, err := yaml.Parse(src)
	if err != nil {
		t.Fatalf("bad row %q: %v", src, err)
	}
	annotateExamplesOrder(tree, "")
	out, ok := tabnas.Plainify(tree).(map[string]any)
	if !ok {
		t.Fatalf("row %q is not an object", src)
	}
	return out
}

func TestTsvArgExample(t *testing.T) {
	rows := loadTsv(t, "arg-example")
	if len(rows) == 0 {
		t.Fatal("no arg-example rows loaded")
	}
	for _, row := range rows {
		t.Run(row["argdef"]+" "+row["schema"], func(t *testing.T) {
			var schema map[string]any
			var want any
			unmarshalCol(t, row, "schema", &schema)
			unmarshalCol(t, row, "expected", &want)
			got := map[string]any{}
			if ex, has := resolveArgExample(parseOrdered(t, row["argdef"]), schema); has {
				got["ex"] = ex
			}
			if !jsonEqual(got, want) {
				t.Errorf("resolveArgExample = %v, want %s", got, row["expected"])
			}
		})
	}
}

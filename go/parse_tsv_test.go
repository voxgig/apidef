/* Copyright (c) 2026 Voxgig Ltd, MIT License */

package apidef

import (
	"encoding/hex"
	"encoding/json"
	"testing"
)

func unmarshalCol(t *testing.T, row tsvRow, col string, into any) {
	t.Helper()
	if err := json.Unmarshal([]byte(row[col]), into); err != nil {
		t.Fatalf("%s: %v", col, err)
	}
}

func TestTsvParseResolve(t *testing.T) {
	rows := loadTsv(t, "parse-resolve")
	if len(rows) == 0 {
		t.Fatal("no parse-resolve rows loaded")
	}
	for _, row := range rows {
		t.Run(row["name"], func(t *testing.T) {
			var src string
			var sel []string
			var want any
			unmarshalCol(t, row, "spec", &src)
			unmarshalCol(t, row, "select", &sel)
			unmarshalCol(t, row, "expected", &want)
			def, err := Parse("OpenAPI", src, map[string]string{"file": row["name"]})
			if err != nil {
				t.Fatal(err)
			}
			var node any = def
			for _, part := range sel {
				if part == "#keys" {
					m, _ := node.(map[string]any)
					node = sortedKeys(m)
					continue
				}
				node, _ = refKid(node, part)
			}
			if !jsonEqual(node, want) {
				got, _ := json.Marshal(node)
				t.Errorf("got  %s\nwant %s", got, row["expected"])
			}
		})
	}
}

func TestTsvNormalizePathKeys(t *testing.T) {
	for _, row := range loadTsv(t, "normalize-path-keys") {
		t.Run(row["name"], func(t *testing.T) {
			var keys, want []string
			unmarshalCol(t, row, "keys", &keys)
			unmarshalCol(t, row, "expected", &want)
			if got := normalizePathKeys(keys); !jsonEqual(got, want) {
				t.Errorf("got %q, want %q", got, want)
			}
		})
	}
}

func TestTsvColonPathKeys(t *testing.T) {
	for _, row := range loadTsv(t, "colon-path-keys") {
		t.Run(row["name"], func(t *testing.T) {
			var paths map[string]any
			var want map[string]string
			unmarshalCol(t, row, "paths", &paths)
			unmarshalCol(t, row, "expected", &want)
			keys, next := colonPathKeys(paths)
			got := map[string]string{}
			for i, key := range keys {
				got[key] = next[i]
			}
			if !jsonEqual(got, want) {
				t.Errorf("got %q, want %q", got, want)
			}
		})
	}
}

func TestTsvSortOrder(t *testing.T) {
	for _, row := range loadTsv(t, "sort-order") {
		t.Run(row["name"], func(t *testing.T) {
			var keys, want []string
			unmarshalCol(t, row, "keys", &keys)
			unmarshalCol(t, row, "expected", &want)
			m := map[string]any{}
			for _, k := range keys {
				m[k] = 1
			}
			if got := sortedKeys(m); !jsonEqual(got, want) {
				t.Errorf("got %q, want %q", got, want)
			}
		})
	}
}

func TestTsvUtf8Decode(t *testing.T) {
	for _, row := range loadTsv(t, "utf8-decode") {
		t.Run(row["name"], func(t *testing.T) {
			raw, err := hex.DecodeString(row["hex"])
			if err != nil {
				t.Fatal(err)
			}
			var want string
			unmarshalCol(t, row, "expected", &want)
			if got := wellFormedUTF8(string(raw)); got != want {
				t.Errorf("got %q, want %q", got, want)
			}
		})
	}
}

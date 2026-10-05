/* Copyright (c) 2026 Voxgig Ltd, MIT License */

package apidef

import (
	"encoding/json"
	"testing"
)

func TestTsvInfoScalars(t *testing.T) {
	rows := loadTsv(t, "info-scalars")
	if len(rows) == 0 {
		t.Fatal("no info-scalars rows loaded")
	}
	for _, row := range rows {
		t.Run(row["input"], func(t *testing.T) {
			var input, want any
			unmarshalCol(t, row, "input", &input)
			unmarshalCol(t, row, "expected", &want)
			got := stringifyInfoScalars(input)
			if !jsonEqual(got, want) {
				gotJSON, _ := json.Marshal(got)
				t.Errorf("stringifyInfoScalars(%s) = %s, want %s", row["input"], gotJSON, row["expected"])
			}
		})
	}
}

func TestTopInfoAlwaysSet(t *testing.T) {
	def := map[string]any{"openapi": "3.0.0", "info": map[string]any{"title": "T", "version": float64(2)}}
	info := topWith(t, def, ApiDefOptions{})
	if "2" != info["version"] {
		t.Errorf("info.version = %#v, want \"2\"", info["version"])
	}
	if 2.0 != def["info"].(map[string]any)["version"] {
		t.Errorf("the definition's own info changed: %#v", def["info"])
	}
}

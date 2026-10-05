/* Copyright (c) 2026 Voxgig Ltd, MIT License */

package apidef

import "testing"

func TestTsvEntitySource(t *testing.T) {
	rows := loadTsv(t, "entity-source")
	if len(rows) == 0 {
		t.Fatal("no entity-source rows loaded")
	}
	for _, row := range rows {
		t.Run(row["entity"][:min(60, len(row["entity"]))], func(t *testing.T) {
			var entity map[string]any
			var want string
			unmarshalCol(t, row, "entity", &entity)
			unmarshalCol(t, row, "expected", &want)
			// The Go model carries an active flag the TS model does not.
			entity["active"] = true
			name, _ := entity["name"].(string)
			if got := entitySource(name, entity); got != want {
				t.Errorf("entitySource\ngot:\n%s\nwant:\n%s", got, want)
			}
		})
	}
}

/* Copyright (c) 2026 Voxgig Ltd, MIT License */

package apidef

import "testing"

func TestFindOverlappingSlices(t *testing.T) {
	items := []any{map[string]any{"id": 1}, map[string]any{"id": 2}}
	for _, slices := range [][]any{{items[:1], items}, {items, items[:1]}} {
		found := Find(slices, "id")
		if len(found) != 2 || found[0]["val"] != 1 || found[1]["val"] != 2 {
			t.Fatalf("got %v, want each object's id once", found)
		}
	}
}

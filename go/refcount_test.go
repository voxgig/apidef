/* Copyright (c) 2026 Voxgig Ltd, MIT License */

package apidef

import (
	"fmt"
	"reflect"
	"testing"
)

// Mirrors the TS `countRefs terminates on a graph` cases.
func TestCountRefsTerminates(t *testing.T) {
	t.Run("a plain self-cycle holds no references", func(t *testing.T) {
		plain := map[string]any{"name": "p"}
		plain["self"] = plain
		got := CountRefs(map[string]any{"paths": map[string]any{"/p": plain}})
		if len(got) != 0 {
			t.Errorf("got %v, want {}", got)
		}
	})

	t.Run("a plain cycle is expanded once, so its reference counts once", func(t *testing.T) {
		plain := map[string]any{"ref": map[string]any{"x-ref": "#/components/schemas/A"}}
		plain["self"] = plain
		def := map[string]any{
			"paths":      map[string]any{"/p": plain},
			"components": map[string]any{"schemas": map[string]any{"A": map[string]any{}}},
		}
		want := map[string]int64{"#/components/schemas/A": 1}
		if got := CountRefs(def); !reflect.DeepEqual(got, want) {
			t.Errorf("got %v, want %v", got, want)
		}
	})

	t.Run("a reference that holds itself counts once", func(t *testing.T) {
		a := map[string]any{"x-ref": "#/components/schemas/A"}
		a["self"] = a
		def := map[string]any{"components": map[string]any{"schemas": map[string]any{"A": a}}}
		want := map[string]int64{"#/components/schemas/A": 1}
		if got := CountRefs(def); !reflect.DeepEqual(got, want) {
			t.Errorf("got %v, want %v", got, want)
		}
	})

	t.Run("a count saturates at the cap", func(t *testing.T) {
		const levels = 40
		schemas := map[string]any{fmt.Sprintf("L%d", levels): map[string]any{"type": "object"}}
		for i := levels - 1; 0 <= i; i-- {
			ref := fmt.Sprintf("#/components/schemas/L%d", i+1)
			schemas[fmt.Sprintf("L%d", i)] = map[string]any{"properties": map[string]any{
				"a": map[string]any{"$ref": ref},
				"b": map[string]any{"$ref": ref},
			}}
		}
		got := CountRefs(map[string]any{"components": map[string]any{"schemas": schemas}})
		if c := got[fmt.Sprintf("#/components/schemas/L%d", levels)]; c != refCountCap {
			t.Errorf("got %d, want %d", c, refCountCap)
		}
	})
}

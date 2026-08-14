package apidef

import "testing"

// Parity port of ts/test/union.test.ts. An UNTAGGED union — oneOf/anyOf, two
// or more real branches, no discriminator — cannot be resolved to a variant by
// any generator, so the field can only be modelled as an open type.

func TestUntaggedUnionBranches(t *testing.T) {
	cases := []struct {
		name   string
		schema map[string]any
		want   int
	}{
		{
			name:   "oneOf two branches",
			schema: map[string]any{"oneOf": []any{map[string]any{"type": "string"}, map[string]any{"type": "number"}}},
			want:   2,
		},
		{
			name: "anyOf three branches",
			schema: map[string]any{"anyOf": []any{
				map[string]any{"type": "string"},
				map[string]any{"type": "number"},
				map[string]any{"type": "boolean"},
			}},
			want: 3,
		},
		{
			// The discriminator names the property that decides the branch,
			// which is exactly what an untagged union lacks.
			name: "discriminated union is resolvable",
			schema: map[string]any{
				"oneOf":         []any{map[string]any{"type": "object"}, map[string]any{"type": "object"}},
				"discriminator": map[string]any{"propertyName": "kind"},
			},
			want: 0,
		},
		{
			// anyOf: [X, null] is "X, possibly absent" — no variant to pick.
			name:   "nullable idiom is not a union",
			schema: map[string]any{"anyOf": []any{map[string]any{"type": "string"}, map[string]any{"type": "null"}}},
			want:   0,
		},
		{
			name:   "allOf is composition, not choice",
			schema: map[string]any{"allOf": []any{map[string]any{"type": "object"}, map[string]any{"type": "object"}}},
			want:   0,
		},
		{
			name:   "single branch",
			schema: map[string]any{"oneOf": []any{map[string]any{"type": "string"}}},
			want:   0,
		},
		{
			name:   "plain scalar",
			schema: map[string]any{"type": "string"},
			want:   0,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := UntaggedUnionBranches(tc.schema); got != tc.want {
				t.Fatalf("UntaggedUnionBranches = %d, want %d", got, tc.want)
			}
		})
	}
}

func TestScanUntaggedUnionNil(t *testing.T) {
	if got := ScanUntaggedUnion(map[string]any{
		"type":       "object",
		"properties": map[string]any{"a": map[string]any{"type": "string"}},
	}); got != nil {
		t.Fatalf("expected nil for a resolvable schema, got %+v", got)
	}
	if got := ScanUntaggedUnion(nil); got != nil {
		t.Fatalf("expected nil for nil schema, got %+v", got)
	}
}

func TestScanUntaggedUnionAtField(t *testing.T) {
	got := ScanUntaggedUnion(map[string]any{
		"oneOf": []any{map[string]any{"type": "string"}, map[string]any{"type": "number"}},
	})
	if got == nil {
		t.Fatal("expected a union")
	}
	if got.Count != 1 || got.Branches != 2 || got.Depth != 0 {
		t.Fatalf("got %+v, want {Count:1 Branches:2 Depth:0}", got)
	}
}

func TestScanUntaggedUnionNested(t *testing.T) {
	// The shape of the Typebot `groups` field: an array whose items carry the
	// union, several levels below the field itself.
	schema := map[string]any{
		"type": "array",
		"items": map[string]any{
			"type": "object",
			"properties": map[string]any{
				"blocks": map[string]any{
					"type": "array",
					"items": map[string]any{"anyOf": []any{
						map[string]any{"type": "object"},
						map[string]any{"type": "object"},
						map[string]any{"type": "object"},
					}},
				},
			},
		},
	}
	got := ScanUntaggedUnion(schema)
	if got == nil {
		t.Fatal("expected a union")
	}
	if got.Count != 1 || got.Branches != 3 {
		t.Fatalf("got %+v, want Count:1 Branches:3", got)
	}
	if got.Depth == 0 {
		t.Fatal("expected a non-zero depth for a nested union")
	}
}

func TestScanUntaggedUnionWidest(t *testing.T) {
	got := ScanUntaggedUnion(map[string]any{
		"a": map[string]any{"oneOf": []any{
			map[string]any{"type": "string"}, map[string]any{"type": "number"}}},
		"b": map[string]any{"anyOf": []any{
			map[string]any{"type": "a"}, map[string]any{"type": "b"},
			map[string]any{"type": "c"}, map[string]any{"type": "d"}}},
	})
	if got == nil {
		t.Fatal("expected a union")
	}
	if got.Count != 2 || got.Branches != 4 {
		t.Fatalf("got %+v, want Count:2 Branches:4", got)
	}
}

func TestScanUntaggedUnionCyclic(t *testing.T) {
	// These specs reference themselves freely; an unguarded walk would spin.
	node := map[string]any{"type": "object"}
	props := map[string]any{
		"self": node,
		"choice": map[string]any{"oneOf": []any{
			map[string]any{"type": "string"}, map[string]any{"type": "number"}}},
	}
	node["properties"] = props

	got := ScanUntaggedUnion(node)
	if got == nil {
		t.Fatal("expected a union")
	}
	if got.Count != 1 || got.Branches != 2 {
		t.Fatalf("got %+v, want Count:1 Branches:2", got)
	}
}

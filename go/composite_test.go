/* Copyright (c) 2024-2026 Voxgig, MIT License */

package apidef

import (
	"os"
	"path/filepath"
	"testing"
)

// Composite identity in the Go port. Mirrors the behaviour described in
// src/transform/field.ts identityParams / compositeId.
//
// THE SEGMENT SHAPE IS THE POINT OF THE FIRST TEST. OperationTransform stores
// a point's `segments` as []map[string]any; an earlier version of this code
// asserted []any, which yields nil rather than an error, so the reverse walk
// found no parts for any route and the port inferred no composite identity at
// all. It compiled, every existing test passed, and the feature was simply
// absent. Both shapes are exercised here because the guide-derived path
// descriptors use []any.

func segTyped(segs ...map[string]any) []map[string]any {
	return segs
}

func segLoose(segs ...map[string]any) []any {
	out := make([]any, 0, len(segs))
	for _, s := range segs {
		out = append(out, s)
	}
	return out
}

func lit(v string) map[string]any { return map[string]any{"lit": v} }
func vr(v string) map[string]any  { return map[string]any{"var": v} }

// An entity whose load op has one point with the given segments.
func entWithSegments(segments any) map[string]any {
	return map[string]any{
		"name": "repo",
		"op": map[string]any{
			"load": map[string]any{
				"points": []any{
					map[string]any{
						"orig":     "/repos/{owner}/{repo}",
						"method":   "GET",
						"segments": segments,
					},
				},
			},
		},
	}
}

func TestIdentityParamsSegmentShapes(t *testing.T) {
	// /repos/{owner}/{repo} — two ADJACENT variables, so a compound key.
	want := []string{"owner", "repo"}

	cases := map[string]any{
		"typed []map[string]any (OperationTransform)": segTyped(
			lit("repos"), vr("owner"), vr("repo")),
		"loose []any (guide path descriptors)": segLoose(
			lit("repos"), vr("owner"), vr("repo")),
	}

	for name, segments := range cases {
		got := identityParams(entWithSegments(segments))
		if len(got) != len(want) {
			t.Errorf("%s: got %d parts %v, want %d %v", name, len(got), got, len(want), want)
			continue
		}
		for i := range want {
			if got[i] != want[i] {
				t.Errorf("%s: part %d = %q, want %q", name, i, got[i], want[i])
			}
		}
	}
}

// ADJACENCY IS THE TEST, not "every path variable". A literal between two
// variables names a sub-collection, so the earlier variable scopes the later
// one and only the last is the record's own key.
func TestIdentityParamsNestedIsNotComposite(t *testing.T) {
	// /api/planet/{planet_id}/moon/{moon_id}
	ent := entWithSegments(segTyped(
		lit("api"), lit("planet"), vr("planet_id"), lit("moon"), vr("moon_id")))

	got := identityParams(ent)
	if 1 != len(got) || "moon_id" != got[0] {
		t.Errorf("nested resource: got %v, want [moon_id]", got)
	}
}

// A route ending in a literal is a verb ON the record, not its address, so the
// run stops at that literal and yields nothing to compose.
func TestIdentityParamsTrailingLiteral(t *testing.T) {
	// /api/v4/geo/node_proxy/{id}/graphql
	ent := entWithSegments(segTyped(
		lit("api"), lit("geo"), vr("id"), lit("graphql")))

	if got := identityParams(ent); 0 != len(got) {
		t.Errorf("trailing literal: got %v, want none", got)
	}
}

func TestCompositeIdGuideOverride(t *testing.T) {
	ent := entWithSegments(segTyped(lit("repos"), vr("owner"), vr("repo")))

	// `composite: false` turns the inference off.
	gent := map[string]any{"id": map[string]any{"composite": false}}
	if parts, _ := compositeId(ent, gent); 0 != len(parts) {
		t.Errorf("composite:false: got %v, want none", parts)
	}

	// An explicit `parts` wins over the inference.
	gent = map[string]any{"id": map[string]any{
		"parts": []any{"a", "b", "c"},
	}}
	parts, _ := compositeId(ent, gent)
	if 3 != len(parts) || "a" != parts[0] || "c" != parts[2] {
		t.Errorf("explicit parts: got %v, want [a b c]", parts)
	}

	// A stated `sep` applies even when the parts are inferred — restating
	// every part merely to change the separator is what the optional key
	// exists to avoid.
	gent = map[string]any{"id": map[string]any{"sep": ":"}}
	if _, sep := compositeId(ent, gent); ":" != sep {
		t.Errorf("inferred parts with stated sep: got %q, want %q", sep, ":")
	}
}

// The Go port must reach the guide's id correction, or the documented fix is
// unavailable here while the inference still runs — which is not parity.
// BuildGuide refuses a customized guide in general (no Go aontu), so exactly
// the `entity.<n>.id` blocks are lifted out by a narrow scan.
func TestReadGuideIdOverrides(t *testing.T) {
	dir := t.TempDir()
	src := "" +
		"# Guide\n" +
		"guide: {\n" +
		"  entity: artifact: id: composite: false\n" +
		"  entity: repo: id: parts: [ 'owner', 'repo' ]\n" +
		"  entity: thing: id: sep: ':'\n" +
		"  entity: other: path: \"/x/{id}\": op: load: method: *GET\n" +
		"}\n"
	if err := os.WriteFile(filepath.Join(dir, "guide.aon"), []byte(src), 0644); err != nil {
		t.Fatal(err)
	}

	got := readGuideIdOverrides(dir, "")

	if false != got["artifact"]["composite"] {
		t.Errorf("composite: got %v, want false", got["artifact"]["composite"])
	}
	parts, _ := got["repo"]["parts"].([]any)
	if 2 != len(parts) || "owner" != parts[0] || "repo" != parts[1] {
		t.Errorf("parts: got %v, want [owner repo]", parts)
	}
	if ":" != got["thing"]["sep"] {
		t.Errorf("sep: got %v, want :", got["thing"]["sep"])
	}
	// Nothing else is lifted — everything not recognised stays refused by
	// checkGuideOverlay rather than being half-applied here.
	if _, has := got["other"]; has {
		t.Errorf("unrelated entity was picked up: %v", got["other"])
	}
}

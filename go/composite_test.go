/* Copyright (c) 2024-2026 Voxgig, MIT License */

package apidef

import (
	"os"
	"path/filepath"
	"strings"
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

// THE API'S OWN id MOVES ASIDE. The canonical TS behaviour is in
// ts/test/composite-identity.test.ts, "the API id moves aside rather than
// being rewritten". The Go port used to overwrite the field in place, which
// destroyed a declared API field and diverged from TS for every composite
// entity whose spec exposes a non-string `id` — github's repo, for one.
func TestApiIdMovesAsideRatherThanBeingRewritten(t *testing.T) {
	ent := entWithSegments(segTyped(lit("repos"), vr("owner"), vr("repo")))

	// EntityTransform runs first and initialises the descriptor
	// unconditionally (transform_entity.go), so FieldTransform always finds
	// one; the test stands in for that step.
	ent["id"] = map[string]any{"name": "id", "field": "id"}

	// The fields come from the RESPONSE SCHEMA, not from the entity: this
	// port builds them rather than reading a pre-seeded list. github's repo
	// declares its `id` as an int64 — the global database id, which is not
	// the pair that addresses the record.
	idschema := map[string]any{
		"type": "object",
		"properties": map[string]any{
			"id":   map[string]any{"type": "integer", "format": "int64"},
			"name": map[string]any{"type": "string"},
		},
	}

	ctx := &ApiDefContext{
		Model: map[string]any{"name": "github"},
		ApiModel: map[string]any{"main": map[string]any{
			KIT: map[string]any{"entity": map[string]any{"repo": ent}},
		}},
		Def: map[string]any{"paths": map[string]any{
			"/repos/{owner}/{repo}": map[string]any{
				"get": map[string]any{"responses": map[string]any{
					"200": map[string]any{"content": map[string]any{
						"application/json": map[string]any{
							"schema": idschema,
						},
					}},
				}},
			},
		}},
	}

	if _, err := FieldTransform(ctx); err != nil {
		t.Fatal(err)
	}

	fields, _ := ent["fields"].([]any)
	byName := map[string]map[string]any{}
	for _, fv := range fields {
		if f, _ := fv.(map[string]any); f != nil {
			n, _ := f["name"].(string)
			byName[n] = f
		}
	}

	// `id` holds the JOINED value, so it is a string with no numeric
	// leftovers.
	idf := byName["id"]
	if idf == nil {
		t.Fatalf("no id field: %v", byName)
	}
	if "`$STRING`" != idf["type"] {
		t.Errorf("id type = %v, want `$STRING`", idf["type"])
	}
	if _, has := idf["format"]; has {
		t.Errorf("id kept format %v", idf["format"])
	}
	if op, _ := idf["op"].(map[string]any); op != nil {
		if list, _ := op["list"].(map[string]any); list != nil {
			if _, has := list["type"]; has {
				t.Errorf("id kept a per-op type %v", list["type"])
			}
		}
	}

	// And the spec's own property SURVIVES, whole.
	kept := byName["github_id"]
	if kept == nil {
		t.Fatalf("the API id was not preserved: %v", byName)
	}
	if "`$INTEGER`" != kept["type"] {
		t.Errorf("github_id type = %v, want `$INTEGER`", kept["type"])
	}
	if "int64" != kept["format"] {
		t.Errorf("github_id format = %v, want int64", kept["format"])
	}

	// The alias records where it went, so a caller can still find it.
	alias, _ := ent["alias"].(map[string]any)
	aliasField, _ := alias["field"].(map[string]any)
	if aliasField == nil || "id" != aliasField["github_id"] {
		t.Errorf("alias.field = %v, want github_id -> id", aliasField)
	}
}

// The id correction must REACH the port. checkGuideOverlay refuses a
// customized guide because Go has no aontu, and that refusal used to cover
// the very lines readGuideIdOverrides exists to read: stating the correction
// failed the build, omitting it kept the false compound key, so the
// documented fix was unreachable either way.
func TestGuideIdLinesAreNotRefusedAsCustomizations(t *testing.T) {
	idonly := "" +
		"guide: {\n" +
		"  entity: artifact: id: composite: false\n" +
		"  entity: repo: id: parts: [ 'owner', 'repo' ]\n" +
		"}\n"
	if custom := guideOverlayCustomizations(idonly); 0 != len(custom) {
		t.Errorf("id-only overlay was refused: %v", custom)
	}

	// Everything else is still refused — it still needs aontu.
	mixed := idonly[:len(idonly)-2] +
		"  entity: other: path: \"/x/{id}\": op: load: method: *GET\n}\n"
	custom := guideOverlayCustomizations(mixed)
	refused := false
	for _, line := range custom {
		if strings.Contains(line, "entity: other") {
			refused = true
		}
		if guideIdLineRE.MatchString(line) {
			t.Errorf("an id line reached the refusal list: %q", line)
		}
	}
	if !refused {
		t.Errorf("non-id customization was not refused: %v", custom)
	}
}

// A SHALLOW COPY SHARES NESTED MAPS. The move is followed by deletions on the
// original — clearing the stale per-op `type` off `id` — so a shallow copy
// left the preserved field holding nothing for the one key it exists to keep.
func TestDeepCopyMapSurvivesDeletionOnTheOriginal(t *testing.T) {
	orig := map[string]any{
		"name": "id", "type": "`$INTEGER`", "format": "int64",
		"op": map[string]any{
			"list": map[string]any{"req": true, "type": "`$INTEGER`"},
		},
	}

	copied := deepCopyMap(orig)

	delete(orig, "format")
	if op, _ := orig["op"].(map[string]any); op != nil {
		if list, _ := op["list"].(map[string]any); list != nil {
			delete(list, "type")
		}
	}

	if "int64" != copied["format"] {
		t.Errorf("copy lost format: %v", copied["format"])
	}
	cop, _ := copied["op"].(map[string]any)
	clist, _ := cop["list"].(map[string]any)
	if clist == nil || "`$INTEGER`" != clist["type"] {
		t.Errorf("copy shared the op map: %v", cop)
	}
}

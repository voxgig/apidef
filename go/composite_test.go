/* Copyright (c) 2024-2026 Voxgig, MIT License */

package apidef

import (
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
	if parts, _, _ := compositeId(ent, gent, nil); 0 != len(parts) {
		t.Errorf("composite:false: got %v, want none", parts)
	}

	// An explicit `parts` wins over the inference.
	gent = map[string]any{"id": map[string]any{
		"parts": []any{"a", "b", "c"},
	}}
	parts, _, _ := compositeId(ent, gent, nil)
	if 3 != len(parts) || "a" != parts[0] || "c" != parts[2] {
		t.Errorf("explicit parts: got %v, want [a b c]", parts)
	}

	// A stated `sep` applies even when the parts are inferred — restating
	// every part merely to change the separator is what the optional key
	// exists to avoid.
	gent = map[string]any{"id": map[string]any{"sep": ":"}}
	if _, sep, _ := compositeId(ent, gent, nil); ":" != sep {
		t.Errorf("inferred parts with stated sep: got %q, want %q", sep, ":")
	}

	// A stated `from` survives the inferred path too.
	gent = map[string]any{"id": map[string]any{
		"from": map[string]any{"owner": "owner.login"},
	}}
	_, _, from := compositeId(ent, gent, nil)
	if "owner.login" != from["owner"] {
		t.Errorf("inferred parts with stated from: got %v, want owner=owner.login", from)
	}
}

// `from` resolution reads the RESPONSE schema, in both spec dialects, and
// descends an envelope. Mirrors identityFrom in src/transform/field.ts.
//
// Each of these was a real parity gap: the Go resolver read only OpenAPI 3's
// `content`, so every Swagger 2 specification resolved no schema at all.
func TestIdentityFromSpecDialectsAndEnvelope(t *testing.T) {
	repoSchema := map[string]any{
		"properties": map[string]any{
			"name":  map[string]any{"type": "string"},
			"owner": map[string]any{"properties": map[string]any{"login": map[string]any{"type": "string"}}},
		},
	}

	cases := map[string]map[string]any{
		"openapi 3 content": {
			"content": map[string]any{
				"application/json": map[string]any{"schema": repoSchema},
			},
		},
		"swagger 2 direct schema": {
			"schema": repoSchema,
		},
		"envelope one level in": {
			"schema": map[string]any{
				"properties": map[string]any{"item": repoSchema},
			},
		},
	}

	for name, response := range cases {
		def := map[string]any{"paths": map[string]any{
			"/repos/{owner}/{repo}": map[string]any{
				"get": map[string]any{"responses": map[string]any{"200": response}},
			},
		}}

		ent := entWithSegments(segTyped(lit("repos"), vr("owner"), vr("repo")))
		from := identityFrom(ent, []string{"owner", "repo"}, def)

		if "owner.login" != from["owner"] {
			t.Errorf("%s: owner -> %q, want owner.login", name, from["owner"])
		}
		// `repo` names the entity, so it resolves to the response's `name`.
		if "name" != from["repo"] {
			t.Errorf("%s: repo -> %q, want name", name, from["repo"])
		}
	}
}

// A renamed parameter is looked up under its WIRE name too: identityParams
// returns the renamed name while a response keeps its own casing.
func TestIdentityFromFollowsRenames(t *testing.T) {
	def := map[string]any{"paths": map[string]any{
		"/t/{tenantKey}/{repo}": map[string]any{
			"get": map[string]any{"responses": map[string]any{"200": map[string]any{
				"schema": map[string]any{"properties": map[string]any{
					"tenantKey": map[string]any{"type": "string"},
					"name":      map[string]any{"type": "string"},
				}},
			}}},
		},
	}}

	ent := map[string]any{
		"name": "repo",
		"op": map[string]any{"load": map[string]any{"points": []any{
			map[string]any{
				"orig":     "/t/{tenantKey}/{repo}",
				"method":   "GET",
				"segments": segTyped(lit("t"), vr("tenant_key"), vr("repo")),
				"rename":   map[string]any{"param": map[string]any{"tenantKey": "tenant_key"}},
			},
		}}},
	}

	from := identityFrom(ent, []string{"tenant_key", "repo"}, def)
	if "tenantKey" != from["tenant_key"] {
		t.Errorf("renamed part: got %q, want tenantKey", from["tenant_key"])
	}
}

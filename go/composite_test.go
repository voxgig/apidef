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

// THE RECORD'S OWN ROUTE DECIDES — the least-qualified route that names it.
// Mirrors the TS cases in ts/test/composite-identity.test.ts. A one-route
// fixture cannot catch this: the defect appears only once an entity has
// several read routes, which every entity in a real specification does.
func TestIdentityParamsPrefersTheRecordsOwnRoute(t *testing.T) {
	ent := map[string]any{
		"name": "repo",
		"op": map[string]any{
			"load": map[string]any{
				"points": []any{
					// A sub-resource first, as github's spec orders them.
					map[string]any{"segments": segTyped(
						lit("repos"), vr("owner"), vr("repo"),
						lit("attestations"), vr("subject_digest"))},
					// A verb on the record: shorter, but not an address.
					map[string]any{"segments": segTyped(
						lit("repos"), vr("owner"), vr("repo"), lit("forks"))},
					// The record's own route.
					map[string]any{"segments": segTyped(
						lit("repos"), vr("owner"), vr("repo"))},
					map[string]any{"segments": segTyped(
						lit("repos"), vr("owner"), vr("repo"),
						lit("collaborators"), vr("username"))},
				},
			},
		},
	}

	got := identityParams(ent)
	if 2 != len(got) || "owner" != got[0] || "repo" != got[1] {
		t.Errorf("got %v, want [owner repo]", got)
	}
}

// ENDING IN A VARIABLE IS NOT ENOUGH. cloudsmith reads an owner's
// vulnerabilities from /vulnerabilities/{owner}/ — a LIST, and the shortest
// route here that ends in a variable. Among routes at the SAME parent scope
// the fullest key wins, so the four-part address does.
func TestIdentityParamsFullestKeyAtEqualScope(t *testing.T) {
	ent := map[string]any{
		"name": "vulnerability",
		"op": map[string]any{
			"load": map[string]any{"points": []any{
				map[string]any{"segments": segTyped(
					lit("vulnerabilities"), vr("owner"))},
				map[string]any{"segments": segTyped(
					lit("vulnerabilities"), vr("owner"), vr("repo"))},
				map[string]any{"segments": segTyped(
					lit("vulnerabilities"), vr("owner"), vr("repo"),
					vr("package"), vr("identifier"))},
			}},
		},
	}

	got := identityParams(ent)
	want := []string{"owner", "repo", "package", "identifier"}
	if len(got) != len(want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("part %d = %q, want %q", i, got[i], want[i])
		}
	}
}

// EVERY ID-BEARING OP IS COMPARED, not just the first with a candidate.
// gitlab's project carries /api/v4/projects/{id} under `remove` alone, while
// its `load` has only sub-resources — so stopping at `load` made a PROJECT
// identified by `secret/filename`.
func TestIdentityParamsComparesAcrossOps(t *testing.T) {
	ent := map[string]any{
		"name": "project",
		"op": map[string]any{
			"load": map[string]any{"points": []any{
				map[string]any{"segments": segTyped(
					lit("api"), lit("v4"), lit("projects"), vr("id"),
					lit("uploads"), vr("secret"), vr("filename"))},
			}},
			"remove": map[string]any{"points": []any{
				map[string]any{"segments": segTyped(
					lit("api"), lit("v4"), lit("projects"), vr("id"))},
			}},
		},
	}

	got := identityParams(ent)
	if 1 != len(got) || "id" != got[0] {
		t.Errorf("got %v, want [id] — the record's own route", got)
	}
}

// A RUN ENDING IN THE RECORD'S OWN KEY NEEDS NOTHING MORE. This transform
// renames that parameter to `id`, so such a run is the port's own statement
// of what identifies the record — github's `/gists/{gist_id}` is a gist while
// `/gists/{gist_id}/{sha}` is a REVISION of one, and the revision won on key
// length alone.
func TestIdentityParamsOwnKeyBeatsALongerRun(t *testing.T) {
	cases := map[string][]map[string]any{
		// The renamed form, which is what the model normally carries.
		"renamed": {
			{"segments": segTyped(lit("gists"), vr("id"))},
			{"segments": segTyped(lit("gists"), vr("gist_id"), vr("sha"))},
		},
		// And the unrenamed <entity>_id form.
		"unrenamed": {
			{"segments": segTyped(lit("gists"), vr("gist_id"))},
			{"segments": segTyped(lit("gists"), vr("gist_id"), vr("sha"))},
		},
	}

	for name, points := range cases {
		pts := make([]any, 0, len(points))
		for _, p := range points {
			pts = append(pts, p)
		}
		ent := map[string]any{
			"name": "gist",
			"op":   map[string]any{"load": map[string]any{"points": pts}},
		}

		if got := identityParams(ent); 1 != len(got) || !strings.HasSuffix(got[0], "id") {
			t.Errorf("%s: got %v, want the single own key", name, got)
		}
	}
}

// AND THE TEST IS NARROW. `actor_id` ends in `_id` but is not this entity's
// own key, so `actor_type/actor_id` stays a compound key; a looser test
// broke exactly this.
func TestIdentityParamsMerelyIdSuffixedPartDoesNotWin(t *testing.T) {
	ent := map[string]any{
		"name": "api_insights_summary_stat",
		"op": map[string]any{
			"load": map[string]any{"points": []any{
				map[string]any{"segments": segTyped(
					lit("api-insights"), vr("actor_type"), vr("actor_id"))},
				map[string]any{"segments": segTyped(
					lit("api-insights"), vr("actor_type"))},
			}},
		},
	}

	got := identityParams(ent)
	if 2 != len(got) || "actor_type" != got[0] || "actor_id" != got[1] {
		t.Errorf("got %v, want [actor_type actor_id]", got)
	}
}

// THE ID DESCRIPTOR IS NOT UNCONDITIONAL. EntityTransform used to initialise
// one for every entity, so this port emitted `id: { field: id, name: id }`
// for an entity the canonical TS gives none — petstore's `store`, which has
// no id field, no composite parts and no `id` parameter on any of its own
// routes. Every downstream generator then saw a key the API has no route for.
//
// Mirrors the four conditions at the end of src/transform/field.ts.
func TestIdDescriptorOnlyWhenTheEntityHasOne(t *testing.T) {
	// An entity addressed by a literal-terminal route, with no id field and
	// no `id` param: no descriptor.
	bare := map[string]any{
		"name":   "store",
		"fields": []any{},
		"op": map[string]any{
			"load": map[string]any{"points": []any{
				map[string]any{
					"orig":     "/store/inventory",
					"method":   "GET",
					"segments": segTyped(lit("store"), lit("inventory")),
				},
			}},
		},
	}

	ctx := &ApiDefContext{
		Model: map[string]any{"name": "petstore"},
		ApiModel: map[string]any{"main": map[string]any{
			KIT: map[string]any{"entity": map[string]any{"store": bare}},
		}},
		Def: map[string]any{"paths": map[string]any{
			"/store/inventory": map[string]any{
				"get": map[string]any{"responses": map[string]any{
					"200": map[string]any{"content": map[string]any{}},
				}},
			},
		}},
	}

	if _, err := FieldTransform(ctx); err != nil {
		t.Fatal(err)
	}
	if id, has := bare["id"]; has {
		t.Errorf("an entity with no id got a descriptor: %v", id)
	}

	// AND AN ENTITY ADDRESSED BY AN `id` PARAMETER GETS BOTH the descriptor
	// and the field, even though its response declares no id: the generated
	// type would otherwise disagree with the generated test.
	addressed := map[string]any{
		"name":   "secret",
		"fields": []any{},
		"op": map[string]any{
			"load": map[string]any{"points": []any{
				map[string]any{
					"orig":     "/secrets/{id}",
					"method":   "GET",
					"segments": segTyped(lit("secrets"), vr("id")),
					"args": map[string]any{
						"params": []any{map[string]any{"name": "id"}},
					},
				},
			}},
		},
	}

	ctx.ApiModel = map[string]any{"main": map[string]any{
		KIT: map[string]any{"entity": map[string]any{"secret": addressed}},
	}}
	ctx.Def = map[string]any{"paths": map[string]any{
		"/secrets/{id}": map[string]any{
			"get": map[string]any{"responses": map[string]any{
				"200": map[string]any{"content": map[string]any{}},
			}},
		},
	}}

	if _, err := FieldTransform(ctx); err != nil {
		t.Fatal(err)
	}

	id, _ := addressed["id"].(map[string]any)
	if id == nil || "id" != id["field"] {
		t.Errorf("an entity addressed by id got no descriptor: %v", addressed["id"])
	}
	fields, _ := addressed["fields"].([]any)
	if !hasField(fields, "id") {
		t.Errorf("the descriptor was emitted without the field: %v", fields)
	}
}

// A PARAM RENAME IS KEYED BY THE SPEC NAME. petstore renames `petId` to
// `id`; this port asked the rename map for the SNAKIFIED `pet_id`, found
// nothing, and named the parameter `pet_id` — disagreeing with TS, and with
// its own path segments, which the rename had already rewritten to `{id}`.
func TestArgRenameUsesTheSpecName(t *testing.T) {
	mtarget := map[string]any{
		"orig": "/pet/{petId}",
		"rename": map[string]any{
			"param": map[string]any{"petId": "id"},
		},
	}

	resolveArgs(nil, "pet", "load", mtarget, []map[string]any{
		{"name": "petId", "in": "path", "required": true},
	})

	args, _ := mtarget["args"].(map[string]any)
	params, _ := args["params"].([]any)
	if 1 != len(params) {
		t.Fatalf("got %d params, want 1: %v", len(params), params)
	}
	p, _ := params[0].(map[string]any)
	if "id" != p["name"] {
		t.Errorf("param name = %v, want id", p["name"])
	}
	if "pet_id" != p["orig"] {
		t.Errorf("param orig = %v, want pet_id", p["orig"])
	}
}

// AN EXAMPLE VALUE IS CARRIED THROUGH, in all four spellings OpenAPI allows.
// taxonomy's `page` and `per_page` carried one in the TS model and nothing
// here, so a test generator reading the Go model had no valid value for a
// required parameter with no other source.
func TestResolveArgExampleSpellings(t *testing.T) {
	cases := []struct {
		name   string
		argdef map[string]any
		want   any
	}{
		{"parameter.example", map[string]any{"example": 1}, 1},
		{"parameter.examples", map[string]any{"examples": map[string]any{
			"first": map[string]any{"value": "a"},
		}}, "a"},
		{"schema.example", map[string]any{
			"schema": map[string]any{"example": 20},
		}, 20},
		{"schema.default", map[string]any{
			"schema": map[string]any{"default": 7},
		}, 7},
	}

	for _, c := range cases {
		got, has := resolveArgExample(c.argdef)
		if !has || got != c.want {
			t.Errorf("%s: got %v (has=%v), want %v", c.name, got, has, c.want)
		}
	}

	if _, has := resolveArgExample(map[string]any{"name": "x"}); has {
		t.Errorf("a parameter with no example reported one")
	}
}

// WHERE EACH PART LIVES IN A RESPONSE. The parts are PATH PARAMETER names and
// a response names its fields whatever it likes: github addresses a repo by
// `{owner}/{repo}` and returns the owner as an OBJECT (`owner.login`) with
// the repository under `name`. Without this a consumer can address a record
// it was given the id of, but cannot put an id on one the API returned.
//
// The three parity specs have no composite entity that resolves a `from`, so
// the model-ref goldens cannot reach this: it is pinned here instead. The
// canonical statement is identityFrom in ts/src/transform/field.ts.
func TestIdentityFromResolvesAPartToItsResponseField(t *testing.T) {
	ent := map[string]any{
		"name": "repo",
		"op": map[string]any{
			"load": map[string]any{"points": []any{
				map[string]any{
					"orig":     "/repos/{owner}/{repo}",
					"method":   "GET",
					"segments": segTyped(lit("repos"), vr("owner"), vr("repo")),
				},
			}},
		},
	}

	def := map[string]any{"paths": map[string]any{
		"/repos/{owner}/{repo}": map[string]any{
			"get": map[string]any{"responses": map[string]any{
				"200": map[string]any{"content": map[string]any{
					"application/json": map[string]any{"schema": map[string]any{
						"type": "object",
						"properties": map[string]any{
							// The repository's own name — rule 2, the part
							// naming this entity.
							"name": map[string]any{"type": "string"},
							// An OBJECT, whose conventional identifying
							// subfield is `login` — rule 4.
							"owner": map[string]any{
								"type": "object",
								"properties": map[string]any{
									"login": map[string]any{"type": "string"},
									"id":    map[string]any{"type": "integer"},
								},
							},
						},
					}},
				}},
			}},
		},
	}}

	got := identityFrom(ent, []string{"owner", "repo"}, def)

	if "owner.login" != got["owner"] {
		t.Errorf("owner -> %v, want owner.login", got["owner"])
	}
	if "name" != got["repo"] {
		t.Errorf("repo -> %v, want name", got["repo"])
	}
}

// A PART NO RULE RESOLVES IS LEFT OUT, rather than guessed at. An incomplete
// map says the id cannot be rebuilt for that entity, which is better than a
// confidently wrong id on a real record.
func TestIdentityFromLeavesAnUnresolvablePartOut(t *testing.T) {
	ent := map[string]any{
		"name": "thing",
		"op": map[string]any{
			"load": map[string]any{"points": []any{
				map[string]any{
					"orig":     "/things/{tenant}/{slug}",
					"method":   "GET",
					"segments": segTyped(lit("things"), vr("tenant"), vr("slug")),
				},
			}},
		},
	}

	def := map[string]any{"paths": map[string]any{
		"/things/{tenant}/{slug}": map[string]any{
			"get": map[string]any{"responses": map[string]any{
				"200": map[string]any{"content": map[string]any{
					"application/json": map[string]any{"schema": map[string]any{
						"type": "object",
						"properties": map[string]any{
							"slug": map[string]any{"type": "string"},
						},
					}},
				}},
			}},
		},
	}}

	got := identityFrom(ent, []string{"tenant", "slug"}, def)

	if "slug" != got["slug"] {
		t.Errorf("slug -> %v, want slug", got["slug"])
	}
	if _, has := got["tenant"]; has {
		t.Errorf("tenant was resolved to %v; the response never carries it", got["tenant"])
	}
}

// SWAGGER 2 PUTS THE SCHEMA DIRECTLY ON THE RESPONSE, not under `content`.
// Reading only the OpenAPI 3 shape resolved nothing for every Swagger 2 spec
// in the validation corpus.
func TestIdentityFromReadsTheSwagger2Shape(t *testing.T) {
	ent := map[string]any{
		"name": "repository",
		"op": map[string]any{
			"load": map[string]any{"points": []any{
				map[string]any{
					"orig":     "/repos/{owner}/{identifier}/",
					"method":   "GET",
					"segments": segTyped(lit("repos"), vr("owner"), vr("identifier")),
				},
			}},
		},
	}

	def := map[string]any{"paths": map[string]any{
		"/repos/{owner}/{identifier}/": map[string]any{
			"get": map[string]any{"responses": map[string]any{
				"200": map[string]any{"schema": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"identifier": map[string]any{"type": "string"},
						"owner":      map[string]any{"type": "string"},
					},
				}},
			}},
		},
	}}

	got := identityFrom(ent, []string{"owner", "identifier"}, def)

	if "owner" != got["owner"] || "identifier" != got["identifier"] {
		t.Errorf("got %v, want both parts resolved to their own names", got)
	}
}

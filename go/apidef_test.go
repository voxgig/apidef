/* Copyright (c) 2024-2025 Voxgig, MIT License */

package apidef

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestDepluralize(t *testing.T) {
	tests := map[string]string{
		"Dogs":     "Dog",
		"Cats":     "Cat",
		"Cities":   "City",
		"Boxes":    "Box",
		"Buses":    "Bus",
		"Children": "Child",
		"Series":   "Series",
		"Wolves":   "Wolf",
		"Knives":   "Knife",
		"Potatoes": "Potato",
	}
	for input, expected := range tests {
		result := Depluralize(input)
		if result != expected {
			t.Errorf("Depluralize(%q) = %q, want %q", input, result, expected)
		}
	}
}

func TestCustomPlurals(t *testing.T) {
	defer ClearCustomPlurals()

	// Exact override beats the built-in irregular (axes -> axis by default).
	SetCustomPlurals(map[string]any{"axes": "axe"})
	if got := Depluralize("axes"); got != "axe" {
		t.Errorf("custom exact: Depluralize(axes) = %q, want axe", got)
	}
	if got := Depluralize("AXES"); got != "AXE" {
		t.Errorf("custom exact case: Depluralize(AXES) = %q, want AXE", got)
	}
	if got := Canonize("axes"); got != "axe" {
		t.Errorf("custom Canonize(axes) = %q, want axe", got)
	}

	// Longest-suffix override, same shape as the irregular scan.
	SetCustomPlurals(map[string]any{"widgets": "widget"})
	if got := Depluralize("user_widgets"); got != "user_widget" {
		t.Errorf("custom suffix: Depluralize(user_widgets) = %q, want user_widget", got)
	}

	// Non-string / empty values are skipped, not used to blank a word.
	SetCustomPlurals(map[string]any{"houses": nil, "mice": "", "boxen": "box"})
	if got := Depluralize("houses"); got != "house" {
		t.Errorf("nil custom value should fall through: Depluralize(houses) = %q, want house", got)
	}
	if got := Depluralize("boxen"); got != "box" {
		t.Errorf("Depluralize(boxen) = %q, want box", got)
	}

	// Clear restores default behaviour.
	ClearCustomPlurals()
	if got := Depluralize("axes"); got != "axis" {
		t.Errorf("after clear: Depluralize(axes) = %q, want axis", got)
	}
}

func TestOperationTransformPropagation(t *testing.T) {
	pathsDesc := []map[string]any{
		{"orig": "/pets", "segments": []map[string]any{{"lit": "pets"}},
			"rename": map[string]any{}, "def": map[string]any{},
			"op": map[string]any{"list": map[string]any{"method": "GET", "transform": map[string]any{"res": "`body.pet`"}}}},
		{"orig": "/things", "segments": []map[string]any{{"lit": "things"}},
			"rename": map[string]any{}, "def": map[string]any{},
			"op": map[string]any{"create": map[string]any{"method": "POST"}}},
	}
	opm := collectOps(map[string]any{}, pathsDesc, map[string]string{})

	cases := map[string][2]string{
		"list":   {"`body.pet`", "`reqdata`"}, // guide-computed res carried through
		"create": {"`body`", "`reqdata`"},     // no transform -> generic defaults
	}
	for name, want := range cases {
		op, _ := opm[name].(map[string]any)
		if op == nil {
			t.Fatalf("missing op %q", name)
		}
		pt := op["points"].([]any)[0].(map[string]any)
		tr := pt["transform"].(map[string]any)
		if tr["res"] != want[0] || tr["req"] != want[1] {
			t.Errorf("%s transform = {res:%v req:%v}, want {res:%q req:%q}",
				name, tr["res"], tr["req"], want[0], want[1])
		}
	}
}

// RFC 10008 QUERY verb: a safe, idempotent read carrying its filter in the
// request body. Mirrors the TS `query-verb-book` case in ts/test/apidef.test.ts.
// QUERY maps onto load/list; its collection response supplies the entity
// fields, and its filter body (BookQuery) must not leak into them.
func TestQueryVerb(t *testing.T) {
	def := `{
		"openapi":"3.0.0",
		"info":{"title":"Book Query API","version":"1.0.0"},
		"paths":{
			"/api/book":{
				"query":{
					"summary":"Search books",
					"requestBody":{"required":true,"content":{"application/json":{"schema":{"$ref":"#/components/schemas/BookQuery"}}}},
					"responses":{"200":{"description":"OK","content":{"application/json":{"schema":{"type":"array","items":{"$ref":"#/components/schemas/Book"}}}}}}
				}
			},
			"/api/book/{book_id}":{
				"get":{
					"summary":"Get book",
					"parameters":[{"name":"book_id","in":"path","required":true,"schema":{"type":"string"}}],
					"responses":{"200":{"description":"OK","content":{"application/json":{"schema":{"$ref":"#/components/schemas/Book"}}}}}
				}
			}
		},
		"components":{"schemas":{
			"Book":{"type":"object","required":["id","title"],"properties":{"id":{"type":"string"},"title":{"type":"string"},"author":{"type":"string"}}},
			"BookQuery":{"type":"object","properties":{"q":{"type":"string"},"page":{"type":"integer"}}}
		}}
	}`

	parsed, err := Parse("OpenAPI", def, map[string]string{"file": "query-book"})
	if err != nil {
		t.Fatalf("parse failed: %v", err)
	}

	ctx := &ApiDefContext{
		Opts: ApiDefOptions{
			Folder:    t.TempDir(),
			OutPrefix: "query-book-",
			Strategy:  "heuristic01",
		},
		Def:  parsed,
		Note: map[string]any{},
		Warn: MakeWarner("test", nil),
		Work: map[string]any{},
	}

	guideResult, err := BuildGuide(ctx)
	if err != nil {
		t.Fatalf("guide build failed: %v", err)
	}

	guide, _ := guideResult["guide"].(map[string]any)
	if guide == nil {
		t.Fatal("no guide in result")
	}

	// The QUERY method is counted like any other method.
	metrics, _ := guide["metrics"].(map[string]any)
	count, _ := metrics["count"].(map[string]any)
	if toInt(count["method"]) != 2 {
		t.Errorf("method count = %v, want 2", count["method"])
	}

	entity, _ := guide["entity"].(map[string]any)
	book, _ := entity["book"].(map[string]any)
	if book == nil {
		t.Fatalf("book entity not discovered; entities: %v", sortedKeys(entity))
	}

	// The collection QUERY is classified as a `list` op carrying the QUERY method.
	paths, _ := book["path"].(map[string]any)
	collection, _ := paths["/api/book"].(map[string]any)
	ops, _ := collection["op"].(map[string]any)
	list, _ := ops["list"].(map[string]any)
	if list == nil {
		t.Fatalf("no list op on /api/book; ops: %v", sortedKeys(ops))
	}
	if list["method"] != "QUERY" {
		t.Errorf("list op method = %v, want QUERY", list["method"])
	}
}

func TestCanonize(t *testing.T) {
	tests := map[string]string{
		"Users":      "user",
		"user-items": "user_item",
		"MyAPI":      "my_api",
	}
	for input, expected := range tests {
		result := Canonize(input)
		if result != expected {
			t.Errorf("Canonize(%q) = %q, want %q", input, result, expected)
		}
	}
}

func TestSanitizeSlug(t *testing.T) {
	tests := map[string]string{
		"my-api":  "my-api",
		"My API":  "MyAPI",
		"my_api":  "my-api",
		"":        "unknown",
		"123-api": "n123-api",
	}
	for input, expected := range tests {
		result := SanitizeSlug(input)
		if result != expected {
			t.Errorf("SanitizeSlug(%q) = %q, want %q", input, result, expected)
		}
	}
}

func TestSlugToPascalCase(t *testing.T) {
	tests := map[string]string{
		"my-api":  "MyApi",
		"foo-bar": "FooBar",
	}
	for input, expected := range tests {
		result := SlugToPascalCase(input)
		if result != expected {
			t.Errorf("SlugToPascalCase(%q) = %q, want %q", input, result, expected)
		}
	}
}

func TestInferFieldType(t *testing.T) {
	tests := []struct {
		name     string
		specType string
		expected string
	}{
		{"is_active", "`$ANY`", "`$BOOLEAN`"},
		{"user_id", "`$ANY`", "`$STRING`"},
		{"total_count", "`$ANY`", "`$INTEGER`"},
		{"price", "`$ANY`", "`$NUMBER`"},
		{"name", "`$ANY`", "`$STRING`"},
		{"is_blocked", "`$STRING`", "`$BOOLEAN`"},
		{"foo", "`$STRING`", "`$STRING`"},
	}
	for _, tt := range tests {
		result := InferFieldType(tt.name, tt.specType)
		if result != tt.expected {
			t.Errorf("InferFieldType(%q, %q) = %q, want %q", tt.name, tt.specType, result, tt.expected)
		}
	}
}

func TestNormalizeFieldName(t *testing.T) {
	tests := map[string]string{
		"foo[]":  "foo",
		"a[b].c": "a_b_c",
		"x__y":   "x_y",
		"_foo_":  "foo",
	}
	for input, expected := range tests {
		result := NormalizeFieldName(input)
		if result != expected {
			t.Errorf("NormalizeFieldName(%q) = %q, want %q", input, result, expected)
		}
	}
}

func TestInferTypeFromValue(t *testing.T) {
	if InferTypeFromValue("hello") != "string" {
		t.Error("string detection failed")
	}
	if InferTypeFromValue(true) != "boolean" {
		t.Error("boolean detection failed")
	}
	if InferTypeFromValue(float64(42)) != "integer" {
		t.Error("integer detection failed")
	}
	if InferTypeFromValue(3.14) != "number" {
		t.Error("number detection failed")
	}
	if InferTypeFromValue([]any{1, 2}) != "array" {
		t.Error("array detection failed")
	}
	if InferTypeFromValue(map[string]any{"a": 1}) != "object" {
		t.Error("object detection failed")
	}
	if InferTypeFromValue(nil) != "string" {
		t.Error("nil detection failed")
	}
}

func TestPathMatch(t *testing.T) {
	result := PathMatch("/api/foo0", "/t/t/")
	if result == nil {
		t.Fatal("expected match")
	}
	if result.Index != 0 {
		t.Errorf("expected index 0, got %d", result.Index)
	}

	result = PathMatch("/api/foo0n", "/t/")
	if result != nil {
		t.Error("expected no match")
	}
}

// resolvePathList is THE path construction site (ADR-003): the split, the
// rename application and the segment typing happen there and nowhere else.
// Mirrors ts/test/transform/entity.test.ts.
func TestResolvePathListSegments(t *testing.T) {
	paths := resolvePathList(map[string]any{
		"path": map[string]any{
			"/foo":       map[string]any{},
			"/bar/{bar}": map[string]any{},
			"/zed/{f0}/dez/{f1}": map[string]any{
				"rename": map[string]any{
					"param": map[string]any{"f0": "t0", "f1": "t1"},
				},
			},
		},
	}, map[string]any{"paths": map[string]any{}})

	// Paths are visited in SORTED key order, so the result is bar, foo, zed —
	// not declaration order.
	want := [][]map[string]any{
		{{"lit": "bar"}, {"var": "bar"}},
		{{"lit": "foo"}},
		// Renames apply to the NAME, not by rewriting a braced string.
		{{"lit": "zed"}, {"var": "t0"}, {"lit": "dez"}, {"var": "t1"}},
	}
	assertSegments(t, paths, want)

	// No braced strings survive: a consumer never parses a segment.
	for _, p := range paths {
		for _, seg := range p["segments"].([]map[string]any) {
			if lit, ok := seg["lit"].(string); ok && strings.HasPrefix(lit, "{") {
				t.Errorf("a literal segment must not be a braced string: %v", seg)
			}
		}
	}
}

// CHAINED RENAMES. The braced-string form had to rewrite only the FIRST match
// (an index lookup + break), because a second pass would re-read the name it
// had just written: with {badge_id: id, id: project_id},
// /groups/{id}/badges/{badge_id} could end up with {project_id} in both slots,
// silently dropping an argument from the URL.
//
// Segments cannot chain: each segment's ORIGINAL name is looked up once, so
// {id} -> project_id and {badge_id} -> id, independently.
func TestResolvePathListRenamesDoNotChain(t *testing.T) {
	paths := resolvePathList(map[string]any{
		"path": map[string]any{
			"/groups/{id}/badges/{badge_id}": map[string]any{
				"rename": map[string]any{
					"param": map[string]any{"badge_id": "id", "id": "project_id"},
				},
			},
		},
	}, map[string]any{"paths": map[string]any{}})

	assertSegments(t, paths, [][]map[string]any{{
		{"lit": "groups"}, {"var": "project_id"},
		{"lit": "badges"}, {"var": "id"},
	}})
}

// A repeated placeholder is ONE parameter and must rename consistently. The
// first-match-only rewrite renamed only the first, leaving the second
// referring to a parameter name that no longer existed.
func TestResolvePathListRepeatedPlaceholder(t *testing.T) {
	paths := resolvePathList(map[string]any{
		"path": map[string]any{
			"/a/{id}/b/{id}": map[string]any{
				"rename": map[string]any{"param": map[string]any{"id": "thing_id"}},
			},
		},
	}, map[string]any{"paths": map[string]any{}})

	assertSegments(t, paths, [][]map[string]any{{
		{"lit": "a"}, {"var": "thing_id"},
		{"lit": "b"}, {"var": "thing_id"},
	}})
}

func assertSegments(t *testing.T, paths []map[string]any, want [][]map[string]any) {
	t.Helper()
	got := make([][]map[string]any, 0, len(paths))
	for _, p := range paths {
		segs, _ := p["segments"].([]map[string]any)
		got = append(got, segs)
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("segments = %v, want %v", got, want)
	}
}

// End-to-end guard for ADR-003: the emitted model carries typed `segments`
// and no braced-string `parts` for a consumer to parse back out. Also catches
// a formatter that cannot serialise the segment vector — before the reflect
// fallback in formatJSONICValue, []map[string]any fell through to fmt %v and
// wrote Go's `map[lit:api]` into a file that is meant to be aontu source.
func TestPointSegmentsEmitted(t *testing.T) {
	tmp, err := os.MkdirTemp("", "apidef-segments-")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmp)

	ad := NewApiDef(ApiDefOptions{
		Folder:    tmp,
		OutPrefix: "solar-1.0.0-openapi-3.0.0-",
		Strategy:  "heuristic01",
	})
	res, err := ad.Generate(map[string]any{
		"model": map[string]any{"name": "solar", "def": "solar-1.0.0-openapi-3.0.0-def.yaml"},
		"build": map[string]any{"spec": map[string]any{"base": "../ts/test/def"}},
		"ctrl": map[string]any{"step": map[string]any{
			"parse": true, "guide": true, "transformers": true,
			"builders": true, "generate": true,
		}},
	})
	if err != nil || res == nil || !res.OK {
		t.Fatalf("generate failed: err=%v res=%+v", err, res)
	}

	nsegments, nparts := 0, 0
	err = filepath.Walk(tmp, func(p string, fi os.FileInfo, e error) error {
		if e != nil || fi.IsDir() || !strings.HasSuffix(p, ".aon") {
			return e
		}
		b, rerr := os.ReadFile(p)
		if rerr != nil {
			return rerr
		}
		src := string(b)
		nsegments += strings.Count(src, "segments:")
		nparts += strings.Count(src, "parts:")
		if strings.Contains(src, "map[") {
			t.Errorf("%s: Go map syntax leaked into aontu source", filepath.Base(p))
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}

	if nsegments == 0 {
		t.Error("no segments emitted")
	}
	if nparts != 0 {
		t.Errorf("parts still emitted (%d occurrences); see ADR-003", nparts)
	}
}

func TestBuildRelations(t *testing.T) {
	pathsDesc := []map[string]any{
		{"segments": []map[string]any{{"lit": "a"}}},
		{"segments": []map[string]any{{"lit": "b"}, {"var": "id"}}},
		{"segments": []map[string]any{{"lit": "d"}, {"lit": "c"}, {"var": "id"}}},
		{"segments": []map[string]any{
			{"lit": "f"}, {"var": "f_id"}, {"lit": "e"}, {"var": "id"}}},
		{"segments": []map[string]any{
			{"lit": "i"}, {"lit": "h"}, {"var": "h_id"}, {"lit": "g"}, {"var": "id"}}},
	}

	result := BuildRelations(nil, pathsDesc)
	ancestors, _ := result["ancestors"].([][]string)
	if len(ancestors) == 0 {
		t.Error("expected ancestors")
	}
	if ancestors[0][0] != "f" {
		t.Errorf("expected first ancestor to be 'f', got %q", ancestors[0][0])
	}
}

func TestGetModelPath(t *testing.T) {
	model := map[string]any{
		"a": map[string]any{
			"b": map[string]any{
				"c": 42,
			},
		},
	}

	v, err := GetModelPath(model, "a.b.c", true)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if v != 42 {
		t.Errorf("expected 42, got %v", v)
	}

	_, err = GetModelPath(model, "a.x.c", true)
	if err == nil {
		t.Error("expected error for missing path")
	}

	v, err = GetModelPath(model, "a.x.c", false)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if v != nil {
		t.Errorf("expected nil, got %v", v)
	}
}

func TestParse(t *testing.T) {
	result, err := Parse("OpenAPI",
		`{"openapi":"3.0.0","info":{"title":"T0","version":"1.0.0"},"paths":{}}`,
		map[string]string{"file": "test"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result == nil {
		t.Fatal("expected result")
	}
	if result["openapi"] != "3.0.0" {
		t.Errorf("expected openapi 3.0.0, got %v", result["openapi"])
	}

	// Test unknown kind
	_, err = Parse("NotAKind", "", map[string]string{"file": "test"})
	if err == nil {
		t.Error("expected error for unknown kind")
	}

	// Test empty source
	_, err = Parse("OpenAPI", "", map[string]string{"file": "test"})
	if err == nil {
		t.Error("expected error for empty source")
	}
}

func TestCleanTransform(t *testing.T) {
	ctx := &ApiDefContext{
		ApiModel: map[string]any{
			"a":  map[string]any{"x": 1},
			"b$": map[string]any{"x": 2},
			"c":  map[string]any{},
			"d":  []any{},
		},
	}

	_, err := CleanTransform(ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if _, ok := ctx.ApiModel["b$"]; ok {
		t.Error("expected b$ to be removed")
	}
	if _, ok := ctx.ApiModel["c"]; ok {
		t.Error("expected empty c to be removed")
	}
	if _, ok := ctx.ApiModel["d"]; ok {
		t.Error("expected empty d to be removed")
	}
	if _, ok := ctx.ApiModel["a"]; !ok {
		t.Error("expected a to be kept")
	}
}

// A property's `description` becomes the field's `short`.
//
// Mirrors the `field-required-solar` assertions in ts/test/apidef.test.ts.
// Every generated per-entity table has a Description column and every cell was
// blank, because nothing read the description the spec supplies. The negative
// cases matter as much as the positive one: a field the spec does not describe
// must NOT acquire an invented description, and a whitespace-only or non-string
// value is not a description either — an empty cell is honest, a meaningless
// one is not.
func TestFieldShortFromDescription(t *testing.T) {
	def := map[string]any{
		"paths": map[string]any{
			"/planets": map[string]any{
				"get": map[string]any{
					"responses": map[string]any{
						"200": map[string]any{
							"content": map[string]any{
								"application/json": map[string]any{
									"schema": map[string]any{
										"type": "array",
										"items": map[string]any{
											"type": "object",
											"properties": map[string]any{
												"id":   map[string]any{"type": "string"},
												"name": map[string]any{"type": "string", "description": "  Common name.  "},
												"kind": map[string]any{"type": "string", "description": "   "},
												"mass": map[string]any{"type": "number", "description": 42},
											},
										},
									},
								},
							},
						},
					},
				},
			},
		},
	}

	mtarget := map[string]any{
		"orig":   "/planets",
		"method": "GET",
		"kind":   "json",
	}

	byName := map[string]map[string]any{}
	for _, f := range resolveOpFields(mtarget, def, "list") {
		byName[f["name"].(string)] = f
	}

	if got := byName["name"]["short"]; got != "Common name." {
		t.Errorf("name.short = %v, want %q (trimmed)", got, "Common name.")
	}
	for _, fname := range []string{"id", "kind", "mass"} {
		f, ok := byName[fname]
		if !ok {
			t.Fatalf("missing field %q", fname)
		}
		if _, has := f["short"]; has {
			t.Errorf("%s.short = %v, want absent (no usable description in the spec)",
				fname, f["short"])
		}
	}
}

// The request-body path must carry `description` too.
//
// TestFieldShortFromDescription above covers the response path, which routes
// through extractFields. A non-QUERY op WITH a request body takes a different
// route: findFieldDefs wraps the schemas in a slice, and a slice sends every
// item through extractPropertiesOnly instead. That helper builds a fresh map
// carrying only the keys it names, so a description in a POST/PUT/PATCH body
// reached TS (which passes the raw property through) and never reached Go —
// the two ports disagreeing on the same spec.
func TestFieldShortFromRequestBodyDescription(t *testing.T) {
	def := map[string]any{
		"paths": map[string]any{
			"/planets": map[string]any{
				"post": map[string]any{
					"requestBody": map[string]any{
						"content": map[string]any{
							"application/json": map[string]any{
								"schema": map[string]any{
									"type": "object",
									"properties": map[string]any{
										"id":   map[string]any{"type": "string"},
										"name": map[string]any{"type": "string", "description": "  Common name.  "},
										"kind": map[string]any{"type": "string", "description": "   "},
									},
								},
							},
						},
					},
				},
			},
		},
	}

	mtarget := map[string]any{
		"orig":   "/planets",
		"method": "POST",
		"kind":   "json",
	}

	byName := map[string]map[string]any{}
	for _, f := range resolveOpFields(mtarget, def, "create") {
		byName[f["name"].(string)] = f
	}

	if got := byName["name"]["short"]; got != "Common name." {
		t.Errorf("name.short = %v, want %q (trimmed)", got, "Common name.")
	}
	for _, fname := range []string{"id", "kind"} {
		f, ok := byName[fname]
		if !ok {
			t.Fatalf("missing field %q", fname)
		}
		if _, has := f["short"]; has {
			t.Errorf("%s.short = %v, want absent (no usable description in the spec)",
				fname, f["short"])
		}
	}
}

// The Go port's inline merge mirrors src/transform/field.ts mergeField, and
// must mirror its description handling too: first non-empty wins.
func TestFieldShortSurvivesMerge(t *testing.T) {
	def := map[string]any{
		"paths": map[string]any{
			"/planets/{id}": map[string]any{
				"get": map[string]any{
					"responses": map[string]any{
						"200": map[string]any{
							"content": map[string]any{
								"application/json": map[string]any{
									"schema": map[string]any{
										"type": "object",
										"properties": map[string]any{
											"id":   map[string]any{"type": "string"},
											"name": map[string]any{"type": "string"},
										},
									},
								},
							},
						},
					},
				},
			},
			"/planets": map[string]any{
				"post": map[string]any{
					"requestBody": map[string]any{
						"content": map[string]any{
							"application/json": map[string]any{
								"schema": map[string]any{
									"type": "object",
									"properties": map[string]any{
										"id":   map[string]any{"type": "string", "description": "Stable identifier."},
										"name": map[string]any{"type": "string", "description": "Common name."},
									},
								},
							},
						},
					},
				},
			},
		},
	}

	apimodel := map[string]any{
		"main": map[string]any{
			"kit": map[string]any{
				"entity": map[string]any{
					"planet": map[string]any{
						"name":   "planet",
						"fields": []any{},
						"op": map[string]any{
							"load": map[string]any{
								"name": "load",
								"points": []any{map[string]any{
									"orig": "/planets/{id}", "method": "GET", "kind": "json",
								}},
							},
							"create": map[string]any{
								"name": "create",
								"points": []any{map[string]any{
									"orig": "/planets", "method": "POST", "kind": "json",
								}},
							},
						},
					},
				},
			},
		},
	}

	if _, err := FieldTransform(&ApiDefContext{ApiModel: apimodel, Def: def}); err != nil {
		t.Fatalf("FieldTransform: %v", err)
	}

	ent := apimodel["main"].(map[string]any)["kit"].(map[string]any)["entity"].(map[string]any)["planet"].(map[string]any)
	byName := map[string]map[string]any{}
	for _, f := range ent["fields"].([]any) {
		fm := f.(map[string]any)
		byName[fm["name"].(string)] = fm
	}

	if got := byName["name"]["short"]; got != "Common name." {
		t.Errorf("name.short = %v, want %q — a later op's description must survive the merge", got, "Common name.")
	}
}

// `short` is one capped line in the Go port too.
//
// Mirrors the `short-is-reduced-to-one-capped-line` case in
// ts/test/field-short.test.ts. A description is prose written for a docs page;
// `short` is rendered as one cell of a markdown table row, where a raw newline
// ends the row and orphans the rest of the table.
func TestFieldShortIsOneCappedLine(t *testing.T) {
	bullets := "The status of the user\n" +
		"- `joined`, the user has joined the space\n" +
		"- `invited`, the user has been sent an invitation"

	def := map[string]any{
		"paths": map[string]any{
			"/planets/{id}": map[string]any{
				"get": map[string]any{
					"responses": map[string]any{
						"200": map[string]any{
							"content": map[string]any{
								"application/json": map[string]any{
									"schema": map[string]any{
										"type": "object",
										"properties": map[string]any{
											"status": map[string]any{"type": "string", "description": bullets},
											"note": map[string]any{"type": "string",
												"description": "First sentence here. Second one should not appear."},
											"long": map[string]any{"type": "string",
												"description": strings.Repeat("x", 400)},
										},
									},
								},
							},
						},
					},
				},
			},
		},
	}

	mtarget := map[string]any{"orig": "/planets/{id}", "method": "GET", "kind": "json"}

	byName := map[string]map[string]any{}
	for _, f := range resolveOpFields(mtarget, def, "load") {
		byName[f["name"].(string)] = f
	}

	for _, name := range []string{"status", "note", "long"} {
		short, _ := byName[name]["short"].(string)
		if strings.Contains(short, "\n") {
			t.Errorf("%s.short contains a newline; it lands in a markdown table cell", name)
		}
	}

	wantStatus := "The status of the user - `joined`, the user has joined the space " +
		"- `invited`, the user has been sent an invitation"
	if got := byName["status"]["short"]; got != wantStatus {
		t.Errorf("status.short = %q, want %q", got, wantStatus)
	}

	if got := byName["note"]["short"]; got != "First sentence here." {
		t.Errorf("note.short = %q, want %q", got, "First sentence here.")
	}

	long, _ := byName["long"]["short"].(string)
	if n := len([]rune(long)); n != 240 {
		t.Errorf("long.short length = %d runes, want 240", n)
	}
	if !strings.HasSuffix(long, "…") {
		t.Errorf("long.short = %q, want an ellipsis suffix", long)
	}
}

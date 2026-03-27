/* Copyright (c) 2024-2025 Voxgig, MIT License */

package apidef

import (
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
		"my-api":      "my-api",
		"My API":      "MyAPI",
		"my_api":      "my-api",
		"":            "unknown",
		"123-api":     "n123-api",
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
		"foo[]":    "foo",
		"a[b].c":  "a_b_c",
		"x__y":    "x_y",
		"_foo_":   "foo",
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

func TestBuildRelations(t *testing.T) {
	pathsDesc := []map[string]any{
		{"parts": []string{"a"}},
		{"parts": []string{"b", "{id}"}},
		{"parts": []string{"d", "c", "{id}"}},
		{"parts": []string{"f", "{f_id}", "e", "{id}"}},
		{"parts": []string{"i", "h", "{h_id}", "g", "{id}"}},
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
			"a": map[string]any{"x": 1},
			"b$": map[string]any{"x": 2},
			"c": map[string]any{},
			"d": []any{},
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

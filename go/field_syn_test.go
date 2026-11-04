/* Copyright (c) 2026 Voxgig Ltd, MIT License */

package apidef

import (
	"strings"
	"testing"
)

// Mirrors ts/test/field-syn.test.ts.

func synSegments(path string) []any {
	out := []any{}
	for _, p := range strings.Split(path, "/") {
		if "" == p {
			continue
		}
		if strings.HasPrefix(p, "{") {
			out = append(out, map[string]any{"var": p[1 : len(p)-1]})
		} else {
			out = append(out, map[string]any{"lit": p})
		}
	}
	return out
}

func synPoint(m, o string, params []string, req string) map[string]any {
	args := []any{}
	for _, n := range params {
		args = append(args, map[string]any{"n": n, "k": "param", "r": true, "t": "`$STRING`"})
	}
	pt := map[string]any{"m": m, "o": o, "s": synSegments(o), "g": map[string]any{"params": args}}
	if "" != req {
		pt["t"] = map[string]any{"req": req, "res": "`body`"}
	}
	return pt
}

func synOp(name string, points ...map[string]any) map[string]any {
	pts := []any{}
	for _, p := range points {
		pts = append(pts, p)
	}
	return map[string]any{"name": name, "points": pts}
}

func synRecord(props map[string]any) map[string]any {
	return map[string]any{"content": map[string]any{"application/json": map[string]any{
		"schema": map[string]any{"type": "object", "properties": props},
	}}}
}

func synTagsBody() map[string]any {
	return map[string]any{"content": map[string]any{"application/json": map[string]any{
		"schema": map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
	}}}
}

func synFields(t *testing.T, name string, op map[string]any, paths map[string]any, guide map[string]any) map[string]any {
	t.Helper()
	ment := map[string]any{"name": name, "fields": map[string]any{}, "op": op}
	ctx := &ApiDefContext{
		ApiModel: map[string]any{"main": map[string]any{
			KIT: map[string]any{"entity": map[string]any{name: ment}},
		}},
		Def:   map[string]any{"paths": paths},
		Guide: guide,
	}
	if _, err := FieldTransform(ctx); err != nil {
		t.Fatal(err)
	}
	return ment
}

func synOf(t *testing.T, ment map[string]any, field string) any {
	t.Helper()
	fields, _ := ment["fields"].(map[string]any)
	f, ok := fields[field].(map[string]any)
	if !ok {
		t.Fatalf("no field %s: %v", field, fields)
	}
	return f["syn"]
}

func TestSyntheticFieldsAreMarked(t *testing.T) {
	str := map[string]any{"type": "string"}
	strs := map[string]any{"type": "array", "items": str}
	noContent := map[string]any{"content": map[string]any{}}

	t.Run("composite identity", func(t *testing.T) {
		ment := synFields(t, "repo",
			map[string]any{"load": synOp("load", synPoint("GET", "/repos/{owner}/{repo}", []string{"owner", "repo"}, ""))},
			map[string]any{"/repos/{owner}/{repo}": map[string]any{"get": map[string]any{
				"responses": map[string]any{"200": synRecord(map[string]any{"name": str})}}}}, nil)
		if got := synOf(t, ment, "id"); got != true {
			t.Errorf("id syn = %v, want true", got)
		}
		if got := synOf(t, ment, "name"); got != nil {
			t.Errorf("name syn = %v, want none", got)
		}
	})

	t.Run("composite off", func(t *testing.T) {
		ment := synFields(t, "artifact",
			map[string]any{"load": synOp("load", synPoint("GET", "/artifacts/{artifact_id}/{archive_format}",
				[]string{"artifact_id", "archive_format"}, ""))},
			map[string]any{"/artifacts/{artifact_id}/{archive_format}": map[string]any{"get": map[string]any{
				"responses": map[string]any{"200": noContent}}}},
			map[string]any{"entity": map[string]any{"artifact": map[string]any{
				"id": map[string]any{"composite": false}}}})
		if got := synOf(t, ment, "id"); got != true {
			t.Errorf("id syn = %v, want true", got)
		}
	})

	t.Run("addressed by id", func(t *testing.T) {
		ment := synFields(t, "secret",
			map[string]any{"load": synOp("load", synPoint("GET", "/secrets/{id}", []string{"id"}, ""))},
			map[string]any{"/secrets/{id}": map[string]any{"get": map[string]any{
				"responses": map[string]any{"200": synRecord(map[string]any{"value": str})}}}}, nil)
		if got := synOf(t, ment, "id"); got != true {
			t.Errorf("id syn = %v, want true", got)
		}
	})

	t.Run("declared id", func(t *testing.T) {
		ment := synFields(t, "secret",
			map[string]any{"load": synOp("load", synPoint("GET", "/secrets/{id}", []string{"id"}, ""))},
			map[string]any{"/secrets/{id}": map[string]any{"get": map[string]any{
				"responses": map[string]any{"200": synRecord(map[string]any{"id": str, "value": str})}}}}, nil)
		if got := synOf(t, ment, "id"); got != nil {
			t.Errorf("id syn = %v, want none", got)
		}
	})

	t.Run("carrier", func(t *testing.T) {
		ment := synFields(t, "label",
			map[string]any{"create": synOp("create", synPoint("POST", "/labels", nil, "`reqdata.tags`"))},
			map[string]any{"/labels": map[string]any{"post": map[string]any{
				"requestBody": synTagsBody(), "responses": map[string]any{"201": noContent}}}}, nil)
		if got := synOf(t, ment, "tags"); got != true {
			t.Errorf("tags syn = %v, want true", got)
		}
	})

	t.Run("carrier a property declares", func(t *testing.T) {
		ment := synFields(t, "label",
			map[string]any{
				"create": synOp("create", synPoint("POST", "/labels", nil, "`reqdata.tags`")),
				"list":   synOp("list", synPoint("GET", "/labels", nil, "")),
			},
			map[string]any{"/labels": map[string]any{
				"post": map[string]any{"requestBody": synTagsBody(), "responses": map[string]any{"201": noContent}},
				"get": map[string]any{"responses": map[string]any{"200": map[string]any{"content": map[string]any{
					"application/json": map[string]any{"schema": map[string]any{"type": "array", "items": map[string]any{
						"type": "object", "properties": map[string]any{"name": str, "tags": strs}}}}}}}},
			}}, nil)
		if got := synOf(t, ment, "tags"); got != nil {
			t.Errorf("tags syn = %v, want none", got)
		}
		if got := synOf(t, ment, "name"); got != nil {
			t.Errorf("name syn = %v, want none", got)
		}
	})
}

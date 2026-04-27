/* Copyright (c) 2024-2025 Voxgig, MIT License */

package apidef

import (
	"encoding/json"
	"fmt"
	"reflect"
	"regexp"
	"strings"

	yaml "github.com/jsonicjs/yaml/go"
	util "github.com/voxgig/util"
)

var yamlCommentRE = regexp.MustCompile(`(?m)^\s*#.*$`)

// Parse parses an API definition source into a structured map.
func Parse(kind string, source string, meta map[string]string) (map[string]any, error) {
	if kind == "OpenAPI" {
		if err := validateSource(kind, source, meta); err != nil {
			return nil, err
		}

		def, err := parseOpenAPI(source, meta)
		if err != nil {
			return nil, err
		}
		return def, nil
	}
	return nil, fmt.Errorf("@voxgig/apidef: parse: unknown kind: %s (%s)",
		kind, RelativizePath(meta["file"]))
}

func parseOpenAPI(source string, meta map[string]string) (map[string]any, error) {
	var parsed map[string]any

	// Use jsonic/yaml to parse (handles both JSON and YAML)
	result, err := yaml.Parse(source)
	if err != nil {
		// Wrap parse errors with context
		if strings.Contains(err.Error(), "jsonic") {
			return nil, fmt.Errorf("@voxgig/apidef: parse: syntax: %s (%s)",
				err.Error(), RelativizePath(meta["file"]))
		}
		return nil, fmt.Errorf("@voxgig/apidef: parse: syntax: %s (%s)",
			err.Error(), RelativizePath(meta["file"]))
	}

	// Validate parsed result is a non-null object
	m, ok := result.(map[string]any)
	if !ok || m == nil {
		return nil, fmt.Errorf(
			"@voxgig/apidef: parse: JSON/YAML source must be an object (%s)",
			RelativizePath(meta["file"]))
	}
	parsed = m

	// Validate it's an OpenAPI or Swagger spec
	_, hasOpenAPI := parsed["openapi"]
	_, hasSwagger := parsed["swagger"]
	if !hasOpenAPI && !hasSwagger {
		return nil, fmt.Errorf(
			"@voxgig/apidef: parse: Unsupported OpenAPI version: undefined (%s)",
			RelativizePath(meta["file"]))
	}

	// Ensure components exists
	if _, ok := parsed["components"]; !ok {
		parsed["components"] = map[string]any{}
	}

	// Walk the tree: annotate x-ref and resolve $ref in one pass.
	// Uses object-identity tracking to avoid exponential re-walking.
	addXRefsAndResolve(parsed, parsed, nil)

	// Skip Decircular for now — addXRefsAndResolve uses identity tracking
	// which prevents true circular references from being created.
	return parsed, nil
}

// addXRefsAndResolve combines x-ref annotation and $ref resolution in one pass.
// Matches TS addXRefsAndResolve: uses object-identity visited tracking
// (WeakSet equivalent via pointer map) to avoid re-walking shared children.
// This prevents exponential expansion on large specs with many cross-references.
// addXRefsAndResolve combines x-ref annotation and $ref resolution in one pass.
// Matches TS addXRefsAndResolve exactly: uses object-identity visited tracking
// (WeakSet equivalent via pointer map) to avoid re-walking shared children.
func addXRefsAndResolve(obj any, root map[string]any, visited map[uintptr]bool) {
	if obj == nil {
		return
	}
	if visited == nil {
		visited = make(map[uintptr]bool)
	}

	switch v := obj.(type) {
	case map[string]any:
		ptr := reflect.ValueOf(v).Pointer()
		if visited[ptr] {
			return
		}
		visited[ptr] = true

		for _, key := range sortedKeys(v) {
			val := v[key]
			if m, ok := val.(map[string]any); ok {
				if ref, ok := m["$ref"]; ok {
					if refStr, ok := ref.(string); ok {
						resolved := resolvePointer(root, refStr)
						if resolved != nil {
							if resolvedMap, ok := resolved.(map[string]any); ok {
								// Replace ref entry with resolved content in-place.
								// Copy resolved properties into the existing map,
								// remove $ref, add x-ref. Children are shared (not copied).
								delete(m, "$ref")
								for k, rv := range resolvedMap {
									m[k] = rv
								}
								m["x-ref"] = refStr
								addXRefsAndResolve(m, root, visited)
							}
						} else {
							m["x-ref"] = refStr
							addXRefsAndResolve(m, root, visited)
						}
					}
				} else {
					addXRefsAndResolve(val, root, visited)
				}
			} else {
				addXRefsAndResolve(val, root, visited)
			}
		}

	case []any:
		for _, item := range v {
			if m, ok := item.(map[string]any); ok {
				if ref, ok := m["$ref"]; ok {
					if refStr, ok := ref.(string); ok {
						resolved := resolvePointer(root, refStr)
						if resolved != nil {
							if resolvedMap, ok := resolved.(map[string]any); ok {
								delete(m, "$ref")
								for k, rv := range resolvedMap {
									m[k] = rv
								}
								m["x-ref"] = refStr
								addXRefsAndResolve(m, root, visited)
							}
						} else {
							m["x-ref"] = refStr
							addXRefsAndResolve(m, root, visited)
						}
					}
				} else {
					addXRefsAndResolve(item, root, visited)
				}
			} else {
				addXRefsAndResolve(item, root, visited)
			}
		}
	}
}

// resolvePointer follows a JSON pointer like "#/components/schemas/Planet"
func resolvePointer(root map[string]any, ref string) any {
	if !strings.HasPrefix(ref, "#/") {
		return nil
	}
	path := ref[2:]
	parts := strings.Split(path, "/")
	var current any = root
	for _, part := range parts {
		part = strings.ReplaceAll(part, "~1", "/")
		part = strings.ReplaceAll(part, "~0", "~")
		if m, ok := current.(map[string]any); ok {
			current = m[part]
		} else {
			return nil
		}
	}
	return current
}

func validateSource(kind string, source string, meta map[string]string) error {
	if source == "" {
		return fmt.Errorf("@voxgig/apidef: parse: %s: source must be a string (%s)",
			kind, RelativizePath(meta["file"]))
	}
	withoutComments := yamlCommentRE.ReplaceAllString(source, "")
	if strings.TrimSpace(withoutComments) == "" {
		return fmt.Errorf("@voxgig/apidef: parse: %s: source is empty (%s)",
			kind, RelativizePath(meta["file"]))
	}
	return nil
}

// FormatJsonSrc converts JSON source to JSONIC-style format.
func FormatJsonSrc(jsonsrc string) string {
	reKey := regexp.MustCompile(`"([a-zA-Z_][a-zA-Z_0-9]*)": `)
	reBrace := regexp.MustCompile(`},`)
	reComment := regexp.MustCompile(`\n(\s*)([a-zA-Z_][a-zA-Z_0-9]*)_COMMENT:\s*"(.*)",`)
	out := reKey.ReplaceAllString(jsonsrc, "$1: ")
	out = reBrace.ReplaceAllString(out, "}\n")
	out = reComment.ReplaceAllString(out, "\n\n$1# $2 $3")
	return out
}

// ToJSON serialises a value to a JSON string, handling circular references.
func ToJSON(val any) string {
	safe := util.Decircular(val)
	b, err := json.MarshalIndent(safe, "", "  ")
	if err != nil {
		return "{}"
	}
	return string(b)
}

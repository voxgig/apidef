/* Copyright (c) 2024-2025 Voxgig, MIT License */

package apidef

import (
	"encoding/json"
	"fmt"
	"reflect"
	"regexp"
	"sort"
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

	// Capture insertion-order of `examples` blocks before $ref resolution
	// so duplicate-key blowups during $ref expansion don't disturb the
	// parallel walk. TS uses Object.values(examples) which is insertion
	// order; Go maps are unordered, so we annotate each examples map with
	// `x-examples-order: [keys…]` for findExampleObject to consume.
	annotateExamplesOrder(source, parsed)

	// Walk the tree: annotate x-ref and resolve $ref in one pass.
	// Uses object-identity tracking to avoid exponential re-walking.
	addXRefsAndResolve(parsed, parsed, nil)

	// Skip Decircular for now — addXRefsAndResolve uses identity tracking
	// which prevents true circular references from being created.
	return parsed, nil
}

// annotateExamplesOrder walks the JSON source via json.Decoder in parallel
// with the parsed map, recording the insertion order of every object that
// is the value of an `examples` key. The order is stored as
// `x-examples-order: [key, key, …]` on each such map, so that downstream
// example-iteration matches TS's Object.values insertion order rather
// than Go's alphabetical map iteration. YAML specs are skipped (they do
// not flow through json.Decoder).
func annotateExamplesOrder(source string, parsed map[string]any) {
	trimmed := strings.TrimSpace(source)
	if len(trimmed) >= 3 && trimmed[0] == 0xEF && trimmed[1] == 0xBB && trimmed[2] == 0xBF {
		trimmed = strings.TrimSpace(trimmed[3:])
	}
	if !strings.HasPrefix(trimmed, "{") {
		return
	}
	dec := json.NewDecoder(strings.NewReader(source))
	dec.UseNumber()
	tok, err := dec.Token()
	if err != nil {
		return
	}
	if d, ok := tok.(json.Delim); !ok || d != '{' {
		return
	}
	_ = walkExamplesOrder(dec, parsed, "")
}

func walkExamplesOrder(dec *json.Decoder, current any, parentKey string) error {
	m, ok := current.(map[string]any)
	if !ok {
		// We're inside a JSON object but the parsed-side has a non-map
		// (e.g. the source got transformed). Drain tokens to keep the
		// decoder aligned with the source.
		return drainObject(dec)
	}
	keys := []string{}
	for dec.More() {
		kt, err := dec.Token()
		if err != nil {
			return err
		}
		key, _ := kt.(string)
		keys = append(keys, key)
		child := m[key]
		if err := walkExamplesValue(dec, child, key); err != nil {
			return err
		}
	}
	if _, err := dec.Token(); err != nil {
		return err
	}
	if parentKey == "examples" {
		m["x-examples-order"] = keys
	}
	return nil
}

func walkExamplesValue(dec *json.Decoder, current any, parentKey string) error {
	tok, err := dec.Token()
	if err != nil {
		return err
	}
	delim, isDelim := tok.(json.Delim)
	if !isDelim {
		return nil
	}
	switch delim {
	case '{':
		return walkExamplesOrder(dec, current, parentKey)
	case '[':
		arr, _ := current.([]any)
		i := 0
		for dec.More() {
			var child any
			if i < len(arr) {
				child = arr[i]
			}
			if err := walkExamplesValue(dec, child, ""); err != nil {
				return err
			}
			i++
		}
		_, err := dec.Token()
		return err
	}
	return nil
}

func drainObject(dec *json.Decoder) error {
	for dec.More() {
		if _, err := dec.Token(); err != nil { // key
			return err
		}
		if err := walkExamplesValue(dec, nil, ""); err != nil {
			return err
		}
	}
	_, err := dec.Token()
	return err
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

// ToJSONOrdered serialises like ToJSON but at every map level emits
// non-`$`-suffixed keys alphabetically first, then `$`-suffixed keys
// alphabetically. Mirrors the output ordering produced by JSON.stringify
// over a TS map cleaned by transform/clean (alphabetical, with `key$`
// appended afterwards by jostraca's `each`).
func ToJSONOrdered(val any) string {
	var buf strings.Builder
	safe := util.Decircular(val)
	writeOrdered(&buf, safe, 0)
	return buf.String()
}

func writeOrdered(buf *strings.Builder, val any, indent int) {
	switch v := val.(type) {
	case map[string]any:
		writeOrderedMap(buf, v, indent)
	case []any:
		writeOrderedArr(buf, v, indent)
	default:
		b, err := json.Marshal(val)
		if err != nil {
			buf.WriteString("null")
			return
		}
		buf.Write(b)
	}
}

func writeOrderedMap(buf *strings.Builder, m map[string]any, indent int) {
	if len(m) == 0 {
		buf.WriteString("{}")
		return
	}
	var plain, dollar []string
	for k := range m {
		if strings.HasSuffix(k, "$") {
			dollar = append(dollar, k)
		} else {
			plain = append(plain, k)
		}
	}
	sort.Strings(plain)
	sort.Strings(dollar)
	keys := append(plain, dollar...)

	buf.WriteString("{\n")
	pad := strings.Repeat("  ", indent+1)
	for i, k := range keys {
		kb, _ := json.Marshal(k)
		buf.WriteString(pad)
		buf.Write(kb)
		buf.WriteString(": ")
		writeOrdered(buf, m[k], indent+1)
		if i < len(keys)-1 {
			buf.WriteString(",")
		}
		buf.WriteString("\n")
	}
	buf.WriteString(strings.Repeat("  ", indent))
	buf.WriteString("}")
}

func writeOrderedArr(buf *strings.Builder, a []any, indent int) {
	if len(a) == 0 {
		buf.WriteString("[]")
		return
	}
	buf.WriteString("[\n")
	pad := strings.Repeat("  ", indent+1)
	for i, v := range a {
		buf.WriteString(pad)
		writeOrdered(buf, v, indent+1)
		if i < len(a)-1 {
			buf.WriteString(",")
		}
		buf.WriteString("\n")
	}
	buf.WriteString(strings.Repeat("  ", indent))
	buf.WriteString("]")
}

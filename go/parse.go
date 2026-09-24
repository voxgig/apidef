/* Copyright (c) 2024-2025 Voxgig, MIT License */

package apidef

import (
	"encoding/json"
	"fmt"
	"reflect"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf16"
	"unicode/utf8"

	tabnas "github.com/tabnas/parser/go"
	yaml "github.com/tabnas/yaml/go"
	util "github.com/voxgig/util/go"
)

var yamlCommentRE = regexp.MustCompile(`(?m)^\s*#.*$`)

// Parse parses an API definition source into a structured map.
func Parse(kind string, source string, meta map[string]string) (map[string]any, error) {
	if kind == "OpenAPI" {
		source = wellFormedUTF8(source)
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

	// Use tabnas/yaml to parse (handles both JSON and YAML)
	result, err := yaml.Parse(joinEscapedPairs(source))
	// tabnas/yaml returns insertion-ordered *tabnas.OrderedMap nodes;
	// apidef works on plain maps, so flatten them back.
	result = tabnas.Plainify(result)
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
			"@voxgig/apidef: parse: Unsupported spec: missing 'openapi' or 'swagger' version field (%s)",
			RelativizePath(meta["file"]))
	}

	// Ensure components exists
	if _, ok := parsed["components"]; !ok {
		parsed["components"] = map[string]any{}
	}

	annotateExamplesOrder(source, parsed)

	if paths, ok := parsed["paths"].(map[string]any); ok {
		keys := sortedKeys(paths)
		parsed["paths"] = renameKeys(paths, keys, normalizePathKeys(keys))
	}

	// Walk the tree: annotate x-ref and resolve $ref in one pass.
	// Uses object-identity tracking to avoid exponential re-walking.
	addXRefsAndResolve(parsed, parsed, nil)

	if paths, ok := parsed["paths"].(map[string]any); ok {
		keys, next := colonPathKeys(paths)
		parsed["paths"] = renameKeys(paths, keys, next)
	}

	// Skip Decircular for now — addXRefsAndResolve uses identity tracking
	// which prevents true circular references from being created.
	return parsed, nil
}

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

func addXRefsAndResolve(obj any, root map[string]any, visited map[uintptr]bool) {
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
			resolveRefSite(v[key], root, visited)
		}

	case []any:
		for _, item := range v {
			resolveRefSite(item, root, visited)
		}
	}
}

// The site is resolved in place, so its own keywords win and every holder of
// it sees the answer; its children are shared with the target, not copied.
func resolveRefSite(val any, root map[string]any, visited map[uintptr]bool) {
	m, _ := val.(map[string]any)
	ref, isRef := m["$ref"].(string)
	if !isRef {
		addXRefsAndResolve(val, root, visited)
		return
	}
	if resolved := resolvePointer(root, ref); resolved != nil {
		delete(m, "$ref")
		for _, k := range sortedKeys(resolved) {
			if _, has := m[k]; !has {
				m[k] = resolved[k]
			}
		}
	}
	m["x-ref"] = ref
	addXRefsAndResolve(m, root, visited)
}

// resolvePointer returns the object a pointer names, following every alias met
// on the way, so the answer does not depend on which aliases the walk has
// already resolved. A pointer that names no object, or needs itself, is nil.
func resolvePointer(root map[string]any, ref string) map[string]any {
	return resolvePointerIn(root, ref, map[string]bool{})
}

func resolvePointerIn(root map[string]any, ref string, active map[string]bool) map[string]any {
	if !strings.HasPrefix(ref, "#/") || active[ref] {
		return nil
	}
	active[ref] = true
	defer delete(active, ref)

	var node any = root
	for _, raw := range strings.Split(ref[2:], "/") {
		part := strings.ReplaceAll(strings.ReplaceAll(raw, "~1", "/"), "~0", "~")
		kid, ok := refKid(followAlias(root, node, active), part)
		if !ok {
			return nil
		}
		node = kid
	}
	m, _ := followAlias(root, node, active).(map[string]any)
	return m
}

// An alias's own keywords win over its target's. Without them the target
// itself is the answer, so references keep sharing one object.
func followAlias(root map[string]any, node any, active map[string]bool) any {
	m, _ := node.(map[string]any)
	ref, isRef := m["$ref"].(string)
	if !isRef {
		return node
	}
	target := resolvePointerIn(root, ref, active)
	if target == nil {
		return nil
	}
	if len(m) == 1 {
		return target
	}
	merged := make(map[string]any, len(target)+len(m))
	for k, v := range target {
		merged[k] = v
	}
	for k, v := range m {
		if k != "$ref" {
			merged[k] = v
		}
	}
	return merged
}

// @tabnas/yaml keeps the quotes of an explicit key (`? "/a"`, `? '/a'`) in the
// key. A rename that would collide with another key is not made.
func normalizePathKeys(keys []string) []string {
	next := make([]string, len(keys))
	for i, key := range keys {
		next[i] = unquotePathKey(key)
	}
	return keepDistinct(keys, next)
}

func unquotePathKey(key string) string {
	if len(key) < 2 || key[0] != key[len(key)-1] {
		return key
	}
	switch key[0] {
	case '\'':
		return strings.ReplaceAll(key[1:len(key)-1], "''", "'")
	case '"':
		var decoded string
		if err := json.Unmarshal([]byte(key), &decoded); err == nil {
			return decoded
		}
		return key[1 : len(key)-1]
	}
	return key
}

func keepDistinct(keys []string, next []string) []string {
	count := map[string]int{}
	for i, key := range keys {
		count[key]++
		if next[i] != key {
			count[next[i]]++
		}
	}
	out := make([]string, len(keys))
	for i, key := range keys {
		if next[i] != key && 1 < count[next[i]] {
			out[i] = key
		} else {
			out[i] = next[i]
		}
	}
	return out
}

func renameKeys(m map[string]any, keys []string, next []string) map[string]any {
	out := make(map[string]any, len(m))
	for i, key := range keys {
		out[next[i]] = m[key]
	}
	return out
}

var pathItemMethods = []string{"get", "put", "post", "delete", "options", "head", "patch", "trace"}

// colonPathKeys rewrites `/a/:b/c` to `/a/{b}/c`, for a `:b` the path item or
// one of its operations declares `in: path`. See docs/design/derived-names.md
func colonPathKeys(paths map[string]any) ([]string, []string) {
	keys := sortedKeys(paths)
	next := make([]string, len(keys))
	for i, path := range keys {
		next[i] = path
		if !strings.Contains(path, "/:") {
			continue
		}
		declared := map[string]bool{}
		collect := func(params any) {
			list, _ := params.([]any)
			for _, p := range list {
				pm, _ := p.(map[string]any)
				if name, ok := pm["name"].(string); ok && pm["in"] == "path" {
					declared[name] = true
				}
			}
		}
		if item, ok := paths[path].(map[string]any); ok {
			collect(item["parameters"])
			for _, method := range pathItemMethods {
				if op, ok := item[method].(map[string]any); ok {
					collect(op["parameters"])
				}
			}
		}
		segs := strings.Split(path, "/")
		for j, seg := range segs {
			if strings.HasPrefix(seg, ":") && declared[seg[1:]] {
				segs[j] = "{" + seg[1:] + "}"
			}
		}
		next[i] = strings.Join(segs, "/")
	}
	return keys, keepDistinct(keys, next)
}

// wellFormedUTF8 decodes as Node decodes a spec file: each maximal ill-formed
// subsequence becomes one U+FFFD.
func wellFormedUTF8(s string) string {
	if utf8.ValidString(s) {
		return s
	}
	var b strings.Builder
	for i := 0; i < len(s); {
		r, size := utf8.DecodeRuneInString(s[i:])
		if r != utf8.RuneError || 1 < size {
			b.WriteString(s[i : i+size])
			i += size
			continue
		}
		b.WriteRune(utf8.RuneError)
		i += illFormedLen(s[i:])
	}
	return b.String()
}

var escapedHighSurrogateRE = regexp.MustCompile(`\\u[dD][89abAB]`)

// tabnas/yaml decodes each `\u` escape alone, so an escaped surrogate pair
// reads as two U+FFFD. In strict JSON every escape is inside a string, so the
// pair can be written as the character it spells before the parse.
func joinEscapedPairs(source string) string {
	if !escapedHighSurrogateRE.MatchString(source) || !json.Valid([]byte(source)) {
		return source
	}
	var b strings.Builder
	inString := false
	for i := 0; i < len(source); i++ {
		c := source[i]
		switch {
		case c == '"':
			inString = !inString
		case inString && c == '\\':
			if hi, lo, ok := escapedPair(source[i:]); ok {
				b.WriteRune(utf16.DecodeRune(hi, lo))
				i += 11
				continue
			}
			b.WriteByte(c)
			i++
			c = source[i]
		}
		b.WriteByte(c)
	}
	return b.String()
}

func escapedPair(s string) (rune, rune, bool) {
	if len(s) < 12 || s[1] != 'u' || s[6] != '\\' || s[7] != 'u' {
		return 0, 0, false
	}
	hi, err1 := strconv.ParseUint(s[2:6], 16, 32)
	lo, err2 := strconv.ParseUint(s[8:12], 16, 32)
	ok := err1 == nil && err2 == nil && utf16.IsSurrogate(rune(hi)) && hi < 0xDC00 &&
		0xDC00 <= lo && lo <= 0xDFFF
	return rune(hi), rune(lo), ok
}

func illFormedLen(s string) int {
	need, lo, hi := 0, byte(0x80), byte(0xBF)
	switch lead := s[0]; {
	case 0xC2 <= lead && lead <= 0xDF:
		need = 1
	case 0xE0 <= lead && lead <= 0xEF:
		need = 2
		if lead == 0xE0 {
			lo = 0xA0
		} else if lead == 0xED {
			hi = 0x9F
		}
	case 0xF0 <= lead && lead <= 0xF4:
		need = 3
		if lead == 0xF0 {
			lo = 0x90
		} else if lead == 0xF4 {
			hi = 0x8F
		}
	}
	n := 1
	for n <= need && n < len(s) && lo <= s[n] && s[n] <= hi {
		n++
		lo, hi = 0x80, 0xBF
	}
	return n
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
	sortUTF16(plain)
	sortUTF16(dollar)
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

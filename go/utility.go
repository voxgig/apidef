/* Copyright (c) 2024-2025 Voxgig, MIT License */

package apidef

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"unicode"

	vs "github.com/voxgig/struct"
	util "github.com/voxgig/util"
	"golang.org/x/text/unicode/norm"
)

var (
	booleanNameRE = regexp.MustCompile(`^(is_|has_|can_|should_|allow_|enabled$|disabled$|active$|visible$|deleted$|verified$|public$|private$|locked$|archived$|blocked$)`)
	integerNameRE = regexp.MustCompile(`(_count$|_number$|^total_|^count_|^num_|^limit$|^page$|^offset$|^per_page$|^page_size$|^size$|^skip$)`)
	numberNameRE  = regexp.MustCompile(`^(latitude$|longitude$|lat$|lng$|lon$|price$|amount$|rate$|score$|weight$|height$|width$|depth$|radius$|distance$|duration$|percentage$|percent$)`)
	stringNameRE  = regexp.MustCompile(`^(url$|href$|link$|uri$|email$|name$|title$|description$|slug$|path$|label$|username$|password$|token$|key$)`)
	idNameRE      = regexp.MustCompile(`(_id$|^id$)`)
	fileExtRE     = regexp.MustCompile(`(?i)\.(php|json|txt|png|jpg|jpeg|gif|svg|xml|html|csv|yml|yaml|md)$`)
	nonAlphaNumRE = regexp.MustCompile(`[^a-zA-Z_0-9]`)
)

// Depluralize converts a plural word to its singular form.
func Depluralize(word string) string {
	if word == "" {
		return word
	}

	irregulars := map[string]string{
		"analytics": "analytics", "analyses": "analysis", "appendices": "appendix",
		"axes": "axis", "children": "child", "courses": "course", "crises": "crisis",
		"criteria": "criterion", "diagnoses": "diagnosis", "feet": "foot",
		"furnace": "furnaces", "geese": "goose", "horses": "horse", "house": "houses",
		"indices": "index", "lens": "lens", "license": "licenses", "matrices": "matrix",
		"men": "man", "mice": "mouse", "movies": "movie", "notice": "notices",
		"oases": "oasis", "phrase": "phrase", "releases": "release", "people": "person",
		"phenomena": "phenomenon", "practice": "practices", "promise": "promises",
		"series": "series", "species": "species", "teeth": "tooth", "theses": "thesis",
		"vertices": "vertex", "women": "woman", "yes": "yes",
	}

	lower := strings.ToLower(word)
	if v, ok := irregulars[lower]; ok {
		if word[0] >= 'A' && word[0] <= 'Z' {
			return strings.ToUpper(v[:1]) + v[1:]
		}
		return v
	}
	for ending, replacement := range irregulars {
		if strings.HasSuffix(lower, ending) {
			prefix := word[:len(word)-len(ending)]
			return prefix + replacement
		}
	}

	// Rules for regular plurals (applied in order)
	if strings.HasSuffix(lower, "ies") && len(word) > 3 {
		result := word[:len(word)-3] + "y"
		if len(result) > 2 {
			return result
		}
	}
	if strings.HasSuffix(lower, "ves") {
		stem := strings.ToLower(word[:len(word)-3])
		if stem == "kni" || stem == "wi" || stem == "li" {
			return word[:len(word)-3] + "fe"
		}
		return word[:len(word)-3] + "f"
	}
	if strings.HasSuffix(lower, "oes") {
		return word[:len(word)-2]
	}
	if strings.HasSuffix(lower, "nses") {
		return word[:len(word)-1]
	}
	if strings.HasSuffix(lower, "ses") || strings.HasSuffix(lower, "xes") ||
		strings.HasSuffix(lower, "zes") || strings.HasSuffix(lower, "shes") ||
		strings.HasSuffix(lower, "ches") {
		return word[:len(word)-2]
	}
	if strings.HasSuffix(lower, "s") && !strings.HasSuffix(lower, "ss") &&
		!strings.HasSuffix(lower, "us") && len(word) > 3 {
		return word[:len(word)-1]
	}

	return word
}

// Transliterate removes diacritics from a string.
func Transliterate(s string) string {
	result := norm.NFD.String(s)
	var b strings.Builder
	for _, r := range result {
		if !unicode.Is(unicode.Mn, r) {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// Snakify converts a string to snake_case.
func Snakify(s string) string {
	var result strings.Builder
	for i, r := range s {
		if unicode.IsUpper(r) {
			if i > 0 {
				prev := rune(s[i-1])
				if !unicode.IsUpper(prev) && prev != '_' && prev != '-' && prev != ' ' {
					result.WriteRune('_')
				}
			}
			result.WriteRune(unicode.ToLower(r))
		} else if r == '-' || r == ' ' {
			result.WriteRune('_')
		} else {
			result.WriteRune(r)
		}
	}
	return result.String()
}

// Camelify converts a string to PascalCase, splitting on _ - and spaces.
func Camelify(s string) string {
	parts := strings.FieldsFunc(s, func(r rune) bool {
		return r == '_' || r == '-' || r == ' '
	})
	var result strings.Builder
	for _, part := range parts {
		if part == "" {
			continue
		}
		result.WriteString(strings.ToUpper(part[:1]) + part[1:])
	}
	return result.String()
}

// Kebabify converts a string to kebab-case, stripping leading/trailing separators.
func Kebabify(s string) string {
	out := Snakify(s)
	out = strings.ReplaceAll(out, "_", "-")
	// Collapse multiple hyphens and strip leading/trailing
	multiHyphen := regexp.MustCompile(`-+`)
	out = multiHyphen.ReplaceAllString(out, "-")
	out = strings.Trim(out, "-")
	return out
}

// Canonize normalizes a name to canonical snake_case singular form.
func Canonize(s string) string {
	if s == "" {
		return ""
	}
	out := Transliterate(s)
	out = fileExtRE.ReplaceAllString(out, "")
	out = Snakify(out)
	out = Depluralize(out)
	out = nonAlphaNumRE.ReplaceAllString(out, "")
	return out
}

// SanitizeSlug sanitizes a raw slug into a clean kebab-case string.
func SanitizeSlug(s string) string {
	if s == "" {
		return "unknown"
	}
	out := Transliterate(s)
	out = strings.ReplaceAll(out, "_", "-")
	out = strings.ReplaceAll(out, ".", "-")
	nonAlpha := regexp.MustCompile(`[^a-zA-Z0-9-]`)
	out = nonAlpha.ReplaceAllString(out, "")
	multiHyphen := regexp.MustCompile(`-+`)
	out = multiHyphen.ReplaceAllString(out, "-")
	out = strings.Trim(out, "-")

	raw := strings.Split(out, "-")
	var parts []string
	digitRE := regexp.MustCompile(`^\d+$`)
	for _, p := range raw {
		if p == "" {
			continue
		}
		if digitRE.MatchString(p) && len(parts) > 0 {
			parts[len(parts)-1] += p
		} else {
			parts = append(parts, p)
		}
	}
	out = strings.Join(parts, "-")

	if out == "" {
		return "unknown"
	}
	if out[0] >= '0' && out[0] <= '9' {
		out = "n" + out
	}
	return out
}

// SlugToPascalCase converts a raw slug to PascalCase.
func SlugToPascalCase(s string) string {
	slug := SanitizeSlug(s)
	if slug == "unknown" {
		return "Unknown"
	}
	parts := strings.Split(slug, "-")
	var result strings.Builder
	for _, p := range parts {
		if p != "" {
			result.WriteString(strings.ToUpper(p[:1]) + p[1:])
		}
	}
	return result.String()
}

// Validator normalizes a type string to its canonical form.
func Validator(torig any) string {
	validCanon := map[string]string{
		"string": "`$STRING`", "number": "`$NUMBER`", "integer": "`$INTEGER`",
		"boolean": "`$BOOLEAN`", "null": "`$NULL`", "array": "`$ARRAY`",
		"object": "`$OBJECT`", "any": "`$ANY`",
	}
	switch v := torig.(type) {
	case string:
		tstr := strings.ToLower(strings.TrimSpace(v))
		if canon, ok := validCanon[tstr]; ok {
			return canon
		}
		return "Any"
	default:
		return "`$ANY`"
	}
}

// InferFieldType infers field type from its name and spec type.
func InferFieldType(name string, specType string) string {
	if specType == "`$ANY`" {
		if booleanNameRE.MatchString(name) {
			return "`$BOOLEAN`"
		}
		if idNameRE.MatchString(name) {
			return "`$STRING`"
		}
		if integerNameRE.MatchString(name) {
			return "`$INTEGER`"
		}
		if numberNameRE.MatchString(name) {
			return "`$NUMBER`"
		}
		if stringNameRE.MatchString(name) {
			return "`$STRING`"
		}
	} else if specType == "`$STRING`" {
		if booleanNameRE.MatchString(name) {
			return "`$BOOLEAN`"
		}
	}
	return specType
}

// NormalizeFieldName normalizes a field name.
func NormalizeFieldName(s string) string {
	if s == "" {
		return ""
	}
	out := strings.ReplaceAll(s, "[]", "")
	bracketRE := regexp.MustCompile(`[\[\].]+`)
	out = bracketRE.ReplaceAllString(out, "_")
	underscoreRE := regexp.MustCompile(`_+`)
	out = underscoreRE.ReplaceAllString(out, "_")
	out = strings.Trim(out, "_")
	return out
}

// CleanComponentName cleans a component name by removing common suffixes/prefixes.
func CleanComponentName(name string) string {
	cleaned := name
	suffixes := []string{"_rest_controller", "_controller", "_response", "_request"}
	prefixes := []string{"get_", "post_", "put_", "delete_", "patch_"}

	for _, suffix := range suffixes {
		if strings.HasSuffix(cleaned, suffix) {
			parts := strings.Split(cleaned, "_")
			suffixParts := len(strings.Split(strings.TrimPrefix(suffix, "_"), "_"))
			if len(parts) > suffixParts {
				cleaned = Canonize(strings.Join(parts[:len(parts)-suffixParts], "_"))
			}
			break
		}
	}
	for _, prefix := range prefixes {
		if strings.HasPrefix(cleaned, prefix) {
			remainder := cleaned[len(prefix):]
			if len(remainder) >= 3 {
				cleaned = remainder
			}
			break
		}
	}
	return cleaned
}

const (
	minEntityNameLen = 3
	maxEntityNameLen = 67
)

// EnsureMinEntityName ensures an entity name meets minimum length requirements.
func EnsureMinEntityName(name string, existing map[string]any) string {
	padded := nonAlphaNumRE.ReplaceAllString(name, "")
	padded = strings.TrimLeft(padded, "_")

	if len(padded) > maxEntityNameLen {
		parts := strings.Split(padded, "_")
		truncated := ""
		for _, part := range parts {
			next := truncated
			if next == "" {
				next = part
			} else {
				next = next + "_" + part
			}
			if len(next) > maxEntityNameLen {
				break
			}
			truncated = next
		}
		if truncated == "" {
			padded = parts[0][:maxEntityNameLen]
		} else {
			padded = truncated
		}
	}

	if len(padded) > 0 && padded[0] >= '0' && padded[0] <= '9' {
		padded = "n" + padded
	}
	if len(padded) < minEntityNameLen {
		padding := "nt"
		if minEntityNameLen-len(padded) < len(padding) {
			padding = padding[:minEntityNameLen-len(padded)]
		}
		padded = padded + padding
	}

	if padded != name && existing != nil {
		if _, ok := existing[padded]; ok {
			i := 2
			for {
				key := fmt.Sprintf("%s%d", padded, i)
				if _, ok := existing[key]; !ok {
					padded = key
					break
				}
				i++
			}
		}
	}

	return padded
}

// Find searches an object tree for all occurrences of a key.
func Find(obj any, qkey string) []map[string]any {
	var vals []map[string]any
	vs.Walk(obj, func(key *string, val any, parent any, path []string) any {
		if key != nil && *key == qkey {
			vals = append(vals, map[string]any{
				"key": *key, "val": val, "path": path,
			})
		}
		return val
	})
	return vals
}

// PathMatch performs regex-style matching on URL paths.
// t - text part, p - param part, / - separator
// / at start - must match from start; / at end - must match to end
func PathMatch(path any, expr string) *PathMatchResult {
	if path == nil {
		return nil
	}

	var parts []string
	switch v := path.(type) {
	case []string:
		for _, p := range v {
			if p != "" {
				parts = append(parts, p)
			}
		}
	case string:
		for _, p := range strings.Split(v, "/") {
			if p != "" {
				parts = append(parts, p)
			}
		}
	default:
		return nil
	}

	res := &PathMatchResult{
		Index: -1,
		Expr:  expr,
	}
	switch v := path.(type) {
	case string:
		res.Path = v
	case []string:
		res.Path = "/" + strings.Join(v, "/")
	}

	plen := len(parts)
	xlen := len(expr)
	xI, pI, mI := 0, 0, -1

	for pI <= plen {
		var p string
		if pI < plen {
			p = parts[pI]
		}
		var x byte
		if xI < xlen {
			x = expr[xI]
		}
		isp := isParam(p)

		if x == '/' {
			if xI == 0 {
				if pI == 0 {
					mI = 0
					pI--
					xI++
				} else {
					break
				}
			} else if xI == xlen-1 {
				if pI == plen {
					xI++
					break
				} else {
					if mI > -1 {
						pI = mI
						mI = -1
					}
					xI = 0
				}
			} else if xI < xlen-1 {
				pI--
				xI++
			} else {
				xI = 0
				break
			}
		} else if x == 't' && !isp {
			xI++
			if mI < 0 {
				mI = pI
			}
		} else if x == 'p' && isp {
			xI++
			if mI < 0 {
				mI = pI
			}
		} else {
			if mI > -1 {
				pI = mI
				mI = -1
			}
			xI = 0
		}

		if xI == xlen {
			break
		}
		pI++
	}

	if xI == xlen {
		res.Index = mI
		if mI >= 0 && mI <= plen {
			end := pI + 1
			if end > plen {
				end = plen
			}
			res.Matches = parts[mI:end]
		}
		return res
	}

	return nil
}

func isParam(partStr string) bool {
	return len(partStr) > 0 && partStr[0] == '{' && partStr[len(partStr)-1] == '}'
}

// RelativizePath makes a path relative to the current working directory.
func RelativizePath(path string) string {
	cwd, err := os.Getwd()
	if err != nil {
		return path
	}
	if strings.HasPrefix(path, cwd) {
		return "." + path[len(cwd):]
	}
	return path
}

// GetModelPath retrieves a value from a nested model by dot-separated path.
func GetModelPath(model any, path string, required bool) (any, error) {
	if path == "" {
		if required {
			return nil, fmt.Errorf("getModelPath: empty path provided")
		}
		return nil, nil
	}

	parts := strings.Split(path, ".")
	current := model
	var validPath []string

	for _, part := range parts {
		if current == nil {
			if required {
				validPathStr := "(root)"
				if len(validPath) > 0 {
					validPathStr = strings.Join(validPath, ".")
				}
				return nil, fmt.Errorf(
					"getModelPath: path not found at '%s'.\n"+
						"Valid path up to: '%s'.\n"+
						"Cannot access property '%s' of %v.",
					path, validPathStr, part, current,
				)
			}
			return nil, nil
		}

		switch m := current.(type) {
		case map[string]any:
			v, ok := m[part]
			if !ok {
				if required {
					validPathStr := "(root)"
					if len(validPath) > 0 {
						validPathStr = strings.Join(validPath, ".")
					}
					keys := make([]string, 0, len(m))
					for k := range m {
						keys = append(keys, k)
					}
					return nil, fmt.Errorf(
						"getModelPath: path not found at '%s'.\n"+
							"Valid path up to: '%s'.\n"+
							"Property '%s' does not exist.\n"+
							"Available keys: [%s]",
						path, validPathStr, part, strings.Join(keys, ", "),
					)
				}
				return nil, nil
			}
			current = v
		default:
			if required {
				validPathStr := "(root)"
				if len(validPath) > 0 {
					validPathStr = strings.Join(validPath, ".")
				}
				return nil, fmt.Errorf(
					"getModelPath: path not found at '%s'.\n"+
						"Valid path up to: '%s'.\n"+
						"Cannot access property '%s' of %T.",
					path, validPathStr, part, current,
				)
			}
			return nil, nil
		}
		validPath = append(validPath, part)
	}

	return current, nil
}

// FormatJSONIC formats a value as JSONIC text.
func FormatJSONIC(val any) string {
	if val == nil {
		return ""
	}
	safe := util.Decircular(val)
	b, err := json.MarshalIndent(safe, "", "  ")
	if err != nil {
		return fmt.Sprintf("%v", val)
	}
	return string(b)
}

// LoadFile reads a file and returns its contents.
func LoadFile(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("failed to load file %s: %w", path, err)
	}
	return string(data), nil
}

// MakeWarner creates a new Warner instance.
func MakeWarner(point string, log Logger) Warner {
	return &warnerImpl{
		point:   point,
		log:     log,
		history: make([]map[string]any, 0),
	}
}

type warnerImpl struct {
	point   string
	log     Logger
	history []map[string]any
}

func (w *warnerImpl) Warn(details map[string]any) {
	details["point"] = w.point
	if w.log != nil {
		w.log.Warn(details)
	}
	w.history = append(w.history, details)
}

func (w *warnerImpl) History() []map[string]any {
	return w.history
}

func (w *warnerImpl) Point() string {
	return w.point
}

// InferTypeFromValue infers a type string from a Go value.
func InferTypeFromValue(value any) string {
	if value == nil {
		return "string"
	}
	switch v := value.(type) {
	case bool:
		return "boolean"
	case float64:
		if v == float64(int64(v)) {
			return "integer"
		}
		return "number"
	case int, int64:
		return "integer"
	case string:
		return "string"
	case []any:
		return "array"
	case map[string]any:
		return "object"
	default:
		return "string"
	}
}

// Nom gets a value from an object and formats it according to the format string.
func Nom(v map[string]any, format string) string {
	if format == "" || v == nil {
		return "__MISSING__"
	}
	canon := Canonize(format)
	outStr := "__MISSING_" + format + "__"
	if val, ok := v[canon]; ok {
		if s, ok := val.(string); ok {
			outStr = s
		}
	}

	if len(format) >= 2 && format[0] >= 'A' && format[0] <= 'Z' && format[1] >= 'a' && format[1] <= 'z' {
		return Camelify(outStr)
	}
	if len(format) >= 2 && format[0] >= 'A' && format[0] <= 'Z' && format[1] >= 'A' && format[1] <= 'Z' {
		return strings.ToUpper(Snakify(outStr))
	}
	if strings.Contains(format, "-") {
		return Kebabify(outStr)
	}
	return outStr
}

// WriteFileWarn writes a file and warns on error.
func WriteFileWarn(warn Warner, path string, text string) {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		warn.Warn(map[string]any{
			"note": "Unable to create directory: " + RelativizePath(dir),
			"err":  err.Error(),
		})
		return
	}
	if err := os.WriteFile(path, []byte(text), 0644); err != nil {
		warn.Warn(map[string]any{
			"note": "Unable to save file: " + RelativizePath(path),
			"err":  err.Error(),
		})
	}
}

// FindPathsWithPrefix counts paths that start with a given prefix.
func FindPathsWithPrefix(ctx *ApiDefContext, pathStr string, strict bool, param bool) int {
	if !param {
		paramRE := regexp.MustCompile(`\{[^}]+\}`)
		pathStr = paramRE.ReplaceAllString(pathStr, "{}")
	}

	count := 0
	defPaths, _ := ctx.Def["paths"].(map[string]any)
	for p := range defPaths {
		path := p
		if !param {
			paramRE := regexp.MustCompile(`\{[^}]+\}`)
			path = paramRE.ReplaceAllString(path, "{}")
		}
		if strict {
			if strings.HasPrefix(path, pathStr) && len(path) > len(pathStr) {
				count++
			}
		} else {
			if strings.HasPrefix(path, pathStr) {
				count++
			}
		}
	}
	return count
}

// DebugPath logs debug info when APIDEF_DEBUG_PATH is set.
func DebugPath(pathStr string, methodName string, args ...any) {
	apipath := os.Getenv("APIDEF_DEBUG_PATH")
	if apipath == "" {
		return
	}

	if apipath != "ALL" {
		parts := strings.SplitN(apipath, ":", 2)
		targetPath := parts[0]
		if pathStr != targetPath {
			return
		}
		if len(parts) > 1 && methodName != "" {
			if !strings.EqualFold(methodName, parts[1]) {
				return
			}
		}
	}

	fmt.Println(methodName, args)
}

// WarnOnError calls fn and returns its result, warning on error.
func WarnOnError(where string, warn Warner, fn func() any, fallback any) any {
	defer func() {
		if r := recover(); r != nil {
			warn.Warn(map[string]any{
				"note": fmt.Sprintf("Error in %s: %v", where, r),
			})
		}
	}()
	return fn()
}

// Items returns sorted key-value pairs from a map (matches @voxgig/struct items).
func Items(val any) [][2]any {
	result := vs.Items(val)
	// Convert to [][2]any
	out := make([][2]any, len(result))
	for i, item := range result {
		out[i] = [2]any{item[0], item[1]}
	}
	return out
}

// IsEmpty checks if a value is empty (matches @voxgig/struct isempty).
func IsEmpty(val any) bool {
	return vs.IsEmpty(val)
}

// Size returns the size of a value (matches @voxgig/struct size).
func Size(val any) int {
	return vs.Size(val)
}

// KeysOf returns sorted keys of a map (matches @voxgig/struct keysof).
func KeysOf(val any) []string {
	return vs.KeysOf(val)
}

// GetElem gets an element from a list by index, supporting negative indices.
func GetElem(val any, idx int, alts ...any) any {
	return vs.GetElem(val, idx, alts...)
}

// Merge deep-merges values (matches @voxgig/struct merge).
func Merge(val any, maxdepths ...int) any {
	return vs.Merge(val, maxdepths...)
}

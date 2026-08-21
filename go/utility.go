/* Copyright (c) 2024-2025 Voxgig, MIT License */

package apidef

import (
	"bytes"
	"encoding/json"
	"fmt"
	"golang.org/x/text/cases"
	"golang.org/x/text/language"
	"golang.org/x/text/unicode/norm"
	"math"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf16"
	"unicode/utf8"

	vs "github.com/voxgig/struct/go"
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

// matchCase reapplies the case pattern of source onto target. Mirrors
// src/utility.ts:matchCase so the case-insensitive irregular lookups in
// Depluralize preserve the caller's casing (HOUSES → HOUSE, Houses →
// House, houses → house).
func matchCase(source, target string) string {
	if target == "" {
		return target
	}
	if source == strings.ToLower(source) {
		return strings.ToLower(target)
	}
	if source == strings.ToUpper(source) {
		return strings.ToUpper(target)
	}
	if source[:1] == strings.ToUpper(source[:1]) {
		return strings.ToUpper(target[:1]) + strings.ToLower(target[1:])
	}
	return target
}

// irregularPlurals maps plural → singular for forms the suffix rules in
// Depluralize would otherwise mishandle. Mirrors the IRREGULARS table in
// src/utility.ts; keys are lowercase and looked up case-insensitively.
// Package-level so it is built once rather than per call.
var irregularPlurals = map[string]string{
	"analytics": "analytics", "analyses": "analysis", "appendices": "appendix",
	"avalanches": "avalanche", "axes": "axis", "caches": "cache", "canoes": "canoe",
	"cases":    "case",
	"children": "child", "cliches": "cliche", "courses": "course", "creches": "creche",
	"crises": "crisis", "criteria": "criterion", "diagnoses": "diagnosis",
	"doses": "dose", "douches": "douche", "feet": "foot", "furnaces": "furnace",
	"geese": "goose", "headaches": "headache", "horses": "horse", "hoses": "hose",
	"houses": "house", "indices": "index", "lens": "lens", "licenses": "license",
	"matrices": "matrix", "men": "man", "mice": "mouse", "moustaches": "moustache",
	"movies": "movie", "mustaches": "mustache", "niches": "niche", "noses": "nose",
	"notices": "notice", "nurses": "nurse", "oases": "oasis", "oboes": "oboe",
	"pastiches": "pastiche",
	"pauses":    "pause", "phases": "phase", "phrases": "phrase", "practices": "practice",
	"premises": "premise", "promises": "promise", "psyches": "psyche", "purses": "purse",
	"releases": "release", "roses": "rose", "people": "person", "phenomena": "phenomenon",
	"series": "series", "shoes": "shoe", "sources": "source", "species": "species",
	"teeth":  "tooth",
	"theses": "thesis", "verses": "verse", "vertices": "vertex", "women": "woman",
	"yes": "yes",
}

// irregularKeys holds irregularPlurals' keys sorted longest-first so the
// most specific suffix wins (e.g. "women" before "men"), matching the
// IRREGULAR_KEYS ordering in src/utility.ts.
var irregularKeys = sortedByLenDesc(irregularPlurals)

func sortedByLenDesc(m map[string]string) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Slice(keys, func(i, j int) bool {
		if len(keys[i]) != len(keys[j]) {
			return len(keys[i]) > len(keys[j])
		}
		return keys[i] < keys[j]
	})
	return keys
}

// customPlurals holds per-model plural overrides (plural -> singular),
// installed via SetCustomPlurals and consulted by Depluralize before the
// built-in table. Mirrors CUSTOM_PLURALS in src/utility.ts. Module-level
// (single-model-per-process), matching the TS design.
var (
	customPlurals    = map[string]string{}
	customPluralKeys []string
)

// SetCustomPlurals installs per-model plural overrides. Keys are lowercased;
// non-string or empty values are skipped so a partially-typed model entry
// can't poison the map. Mirrors src/utility.ts:setCustomPlurals.
func SetCustomPlurals(plurals any) {
	customPlurals = map[string]string{}
	if pm, ok := plurals.(map[string]any); ok {
		for k, v := range pm {
			s, ok := v.(string)
			if !ok || s == "" {
				continue
			}
			customPlurals[strings.ToLower(k)] = s
		}
	}
	customPluralKeys = sortedByLenDesc(customPlurals)
}

// ClearCustomPlurals drops the per-model overrides so a subsequent
// Generate in the same process starts clean.
func ClearCustomPlurals() {
	SetCustomPlurals(nil)
}

// Depluralize converts a plural word to its singular form. Mirrors
// src/utility.ts:depluralize, including per-model custom plural overrides
// installed via SetCustomPlurals.
func Depluralize(word string) string {
	if word == "" {
		return word
	}

	lower := strings.ToLower(word)

	// Per-model custom plurals win over the built-in table and rules.
	if v, ok := customPlurals[lower]; ok {
		return matchCase(word, v)
	}
	for _, ending := range customPluralKeys {
		if strings.HasSuffix(lower, ending) {
			cut := len(word) - len(ending)
			return word[:cut] + matchCase(word[cut:], customPlurals[ending])
		}
	}

	if v, ok := irregularPlurals[lower]; ok {
		return matchCase(word, v)
	}
	for _, ending := range irregularKeys {
		if strings.HasSuffix(lower, ending) {
			cut := len(word) - len(ending)
			return word[:cut] + matchCase(word[cut:], irregularPlurals[ending])
		}
	}

	// Rules for regular plurals (applied in order).

	// -ies -> -y (cities -> city), only if result is > 2 chars
	if strings.HasSuffix(lower, "ies") && len(word) > 3 {
		dropped := word[len(word)-3:]
		y := "y"
		if dropped == strings.ToUpper(dropped) {
			y = "Y"
		}
		result := word[:len(word)-3] + y
		if len(result) > 2 {
			return result
		}
	}

	// -ves -> -f or -fe (wolves -> wolf, knives -> knife)
	if strings.HasSuffix(lower, "ves") {
		stem := word[:len(word)-3]
		dropped := word[len(word)-3:]
		isUpper := dropped == strings.ToUpper(dropped)
		switch strings.ToLower(stem) {
		case "kni", "wi", "li":
			if isUpper {
				return stem + "FE"
			}
			return stem + "fe"
		}
		if isUpper {
			return stem + "F"
		}
		return stem + "f"
	}

	// -oes -> -o (potatoes -> potato)
	if strings.HasSuffix(lower, "oes") {
		return word[:len(word)-2]
	}

	// -nses -> drop only the final -s (responses -> response)
	if strings.HasSuffix(lower, "nses") {
		return word[:len(word)-1]
	}

	// -zzes -> drop -es (buzzes -> buzz); -zes -> drop -s (prizes -> prize).
	// The -zes singular keeps its trailing -e far more often than not, so
	// only the doubled-z stem strips the full -es.
	if strings.HasSuffix(lower, "zzes") {
		return word[:len(word)-2]
	}
	if strings.HasSuffix(lower, "zes") {
		return word[:len(word)-1]
	}

	// -ses, -xes, -shes, -ches -> remove -es (boxes -> box)
	if strings.HasSuffix(lower, "ses") || strings.HasSuffix(lower, "xes") ||
		strings.HasSuffix(lower, "shes") || strings.HasSuffix(lower, "ches") {
		return word[:len(word)-2]
	}

	// -s -> remove -s (cats -> cat), only if result is > 2 chars
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

// partify mirrors jostraca's partify (jostraca/util/basic.ts) exactly. That
// function is the root of every generated identifier — entity names, field
// names, SDK class names — so any deviation here changes the emitted SDK.
// The TS side imports it from jostraca; this is a hand port, so it is pinned
// by the shared snakify/camelify/kebabify TSV fixtures. Do not "simplify" it
// without re-running those.
//
// The original is three steps:
//
//	.replace(/([A-Z])([A-Z]+)(?![a-z])/g, (_, a, b) => a + b.toLowerCase())
//	.split(/[-_ ]|([A-Z])/).filter(p => null != p && '' !== p)
//	.reduce(merge-single-UPPERCASE-into-following-lowercase)
//
// Example: "m_img" → ["mimg"]; "ab_cd" → ["ab", "cd"]; "APIKeys" → ["Api","Keys"].
func partify(s string) []string {
	if s == "" {
		return nil
	}

	// Step 1: collapse acronym runs, honouring the regex's (?![a-z]) guard.
	//
	// For a maximal run of N uppercase letters, the greedy match backtracks so
	// the run's LAST letter is left alone when a lowercase letter follows it —
	// that letter starts the next word. So "APIaddress" collapses only "AP"
	// (→ "Ap") and yields "ApIaddress", not "Apiaddress"; and "ABc" is left
	// untouched because only one letter would remain to collapse.
	var collapsed strings.Builder
	collapsed.Grow(len(s))
	for i := 0; i < len(s); {
		if !isUpperASCII(s[i]) {
			collapsed.WriteByte(s[i])
			i++
			continue
		}
		run := i
		for run < len(s) && isUpperASCII(s[run]) {
			run++
		}
		n := run - i
		// A lowercase letter directly after the run claims the run's last letter.
		eff := n
		if run < len(s) && s[run] >= 'a' && s[run] <= 'z' {
			eff = n - 1
		}
		if eff >= 2 {
			collapsed.WriteByte(s[i])
			for j := i + 1; j < i+eff; j++ {
				collapsed.WriteByte(s[j] + ('a' - 'A'))
			}
			collapsed.WriteString(s[i+eff : run])
		} else {
			collapsed.WriteString(s[i:run])
		}
		i = run
	}
	src := collapsed.String()

	// Step 2: split on -/_/space (delimiter consumed) and at capital letters
	// (the capital is captured, so it becomes its own single-char segment).
	var raw []string
	cur := []byte{}
	flush := func() {
		if len(cur) > 0 {
			raw = append(raw, string(cur))
			cur = cur[:0]
		}
	}
	for i := 0; i < len(src); i++ {
		c := src[i]
		switch {
		case c == '-' || c == '_' || c == ' ':
			flush()
		case isUpperASCII(c):
			flush()
			raw = append(raw, string(c))
		default:
			cur = append(cur, c)
		}
	}
	flush()

	// Step 3: re-attach a captured single UPPERCASE letter to the lowercase
	// tail that follows it. The uppercase guard matters: without it a lone
	// lowercase segment between separators ("a" in "yes-as-a-service", or any
	// digit in "1_2_3") would also be glued to the next part.
	out := make([]string, 0, len(raw))
	for _, p := range raw {
		if p == "" {
			continue
		}
		if len(out) > 0 {
			prev := out[len(out)-1]
			if len(prev) == 1 && isUpperASCII(prev[0]) && !isUpperASCII(p[0]) {
				out[len(out)-1] = prev + p
				continue
			}
		}
		out = append(out, p)
	}
	return out
}

func isUpperASCII(c byte) bool { return c >= 'A' && c <= 'Z' }

// Snakify converts a string to snake_case using jostraca-compatible partify.
func Snakify(s string) string {
	parts := partify(s)
	for i, p := range parts {
		parts[i] = strings.ToLower(p)
	}
	return strings.Join(parts, "_")
}

// jsUpper reproduces JavaScript's String.prototype.toUpperCase: locale-
// independent FULL Unicode case mapping, so "ß" → "SS" and "ﬁ" → "FI".
// Go's strings.ToUpper is simple (1:1) mapping and leaves those unchanged.
// Only used where output must match TS character-for-character.
var jsUpperCaser = cases.Upper(language.Und)

func jsUpper(s string) string { return jsUpperCaser.String(s) }

// Camelify converts a string to PascalCase using jostraca-compatible partify.
// Mirrors TS jostraca/util/basic.ts:camelify so single-char segments merge
// into the next segment (e.g. "poetry_o_racle" → "PoetryOracle", not "PoetryORacle").
func Camelify(s string) string {
	parts := partify(s)
	var result strings.Builder
	for _, part := range parts {
		if part == "" {
			continue
		}
		// Upper-case the first RUNE, not the first byte. `part[:1]` splits a
		// multibyte character (schema names carry accented and non-Latin
		// text), so "Ünicode" became a replacement char followed by a stray
		// continuation byte — invalid UTF-8 in a generated identifier.
		//
		// jsUpper, not strings.ToUpper: JS toUpperCase() applies full Unicode
		// case mapping, where one code point can expand to several ("ß" → "SS").
		// strings.ToUpper only does simple 1:1 mapping and leaves "ß" alone.
		//
		// Supplementary-plane characters are left alone: JS strings are UTF-16
		// and `p[0]` is a single code UNIT, so for an astral character it is a
		// lone high surrogate, which has no uppercase mapping and comes back
		// unchanged. Upper-casing the whole code point here (e.g. U+10428 →
		// U+10400) would diverge from the canonical implementation.
		r, size := utf8.DecodeRuneInString(part)
		if r > 0xFFFF {
			result.WriteString(part)
			continue
		}
		result.WriteString(jsUpper(string(r)))
		result.WriteString(part[size:])
	}
	return result.String()
}

// Kebabify converts a string to kebab-case, stripping leading/trailing separators.
func Kebabify(s string) string {
	out := Snakify(s)
	out = strings.ReplaceAll(out, "_", "-")
	// Collapse multiple hyphens and strip leading/trailing
	out = multiHyphenRE.ReplaceAllString(out, "-")
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

// CanonizeField canonicalises a FIELD name — which is a WIRE identifier, not
// a type name.
//
// Canonize is right for entity/type names: it snakifies and depluralizes so
// `Users` and `user-items` converge on `user` / `user_item`. Applied to a
// field it is actively WRONG, because the name has to match the JSON the
// server actually sends:
//
//	modelType   -> Canonize -> model_type    (server sends modelType)
//	items       -> Canonize -> item          (server sends items)
//
// Nothing maps back: the model's `alias.field` map is emitted empty and no
// generator consumes it, so the wire name is simply lost. Across the fleet's
// specs that renamed 23% of all fields (146 repos) and depluralized another
// 13% — every one of those SDKs reading a key the server never sends.
//
// So: keep the transliteration and identifier sanitisation that stop a name
// being unusable in a target language, and drop the snakify/depluralize that
// change what the name MEANS. Case and plurality are preserved verbatim.
//
// Mirrors src/utility.ts canonizeField.
func CanonizeField(s string) string {
	if s == "" {
		return ""
	}
	out := Transliterate(s)
	out = nonAlphaNumRE.ReplaceAllString(out, "")
	return out
}

// StripSchemaNamespace reduces a namespace-qualified schema name
// (ASP.NET/Java style: "NoFrixion.MoneyMoov.Models.PaymentRequests.X",
// "com.example.api.Payment") to its last meaningful dotted segment —
// skipping version-ish ("v2", "10") or too-short tails — so entity names
// derive from the type, not the namespace.
// Mirrors src/utility.ts stripSchemaNamespace.
func StripSchemaNamespace(name string) string {
	if name == "" || !strings.Contains(name, ".") {
		return name
	}
	segs := strings.Split(name, ".")
	for i := len(segs) - 1; i >= 0; i-- {
		seg := segs[i]
		if len(seg) >= 3 && !versionSegRE.MatchString(seg) {
			return seg
		}
	}
	return name
}

var versionSegRE = regexp.MustCompile(`^[vV]?\d+$`)

// CanonizeCmpName is the canonical form of an OpenAPI component schema
// name, for use as an entity-name candidate and as the frequency-metric
// key. Must be applied uniformly wherever schema refs are counted or
// resolved (MeasureRef, ResolveEntityComponent, findcmps) so the metric
// keys stay consistent.
// Mirrors src/utility.ts canonizeCmpName.
func CanonizeCmpName(orig string) string {
	return Canonize(StripSchemaNamespace(orig))
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

// validCanon is the runtime canonical map, private so public-API use cannot
// alter Validator behavior (parity with TS, where the exported const binding
// is not replaceable — a Go exported var or shared map reference would be).
var validCanon = map[string]string{
	"string": "`$STRING`", "number": "`$NUMBER`", "integer": "`$INTEGER`",
	"boolean": "`$BOOLEAN`", "null": "`$NULL`", "array": "`$ARRAY`",
	"object": "`$OBJECT`", "any": "`$ANY`",
}

// ValidCanon returns a COPY of the canonical OpenAPI type NAME ->
// `$SENTINEL` map. Mirrors src/utility.ts:VALID_CANON. Exported (with
// CanonOne) so downstream consumers can verify they cover the full sentinel
// vocabulary; mutating the returned map does not affect Validator.
func ValidCanon() map[string]string {
	out := make(map[string]string, len(validCanon))
	for k, v := range validCanon {
		out[k] = v
	}
	return out
}

// CanonOne is the union sentinel used for multi-type values. Mirrors
// src/utility.ts:CANON_ONE.
const CanonOne = "`$ONE`"

// Validator normalizes a spec type to its canonical form. Mirrors
// src/utility.ts:validator.
//
// Returns `any`, not `string`: OpenAPI 3.1 expresses a nullable field as a
// type ARRAY (`type: [string, "null"]`), and TS maps that to the union form
// [CANON_ONE, [member, ...]]. An earlier port declared this `string`, which
// made the array branch unreachable and silently degraded every nullable
// field to `$ANY` — so the Go SDK lost all union type information.
//
// A string that doesn't map to a canonical type returns the literal "Any",
// matching TS (VALID_CANON[tstr] ?? 'Any'). That includes the empty string:
// TS lowercases and trims first, finds no entry, and yields "Any" — only a
// genuinely absent value (nil here, undefined there) reaches `$ANY`.
func Validator(torig any) any {
	switch v := torig.(type) {
	case string:
		tstr := strings.ToLower(strings.TrimSpace(v))
		if canon, ok := validCanon[tstr]; ok {
			return canon
		}
		return "Any"
	case []any:
		members := make([]any, 0, len(v))
		for _, t := range v {
			members = append(members, Validator(t))
		}
		return []any{CanonOne, members}
	case []string:
		members := make([]any, 0, len(v))
		for _, t := range v {
			members = append(members, Validator(t))
		}
		return []any{CanonOne, members}
	default:
		return "`$ANY`"
	}
}

// ValidatorString is Validator for callers that know the input is a single
// type name and want the string form (the shared TSV fixtures, mainly).
// Union results are returned unchanged as their `$ONE` sentinel.
func ValidatorString(torig any) string {
	if s, ok := Validator(torig).(string); ok {
		return s
	}
	return CanonOne
}

// InferFieldType infers field type from its name and spec type. Mirrors
// src/utility.ts:inferFieldType.
//
// specType is `any` because Validator can hand back a union array; TS types
// this parameter `string` but is called with validator()'s `any` result, and
// the array falls through both branches to be returned unchanged.
func InferFieldType(name string, specType any) any {
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

// InferFieldTypeString is InferFieldType for the string-only call sites and
// the shared TSV fixtures.
func InferFieldTypeString(name string, specType string) string {
	if s, ok := InferFieldType(name, specType).(string); ok {
		return s
	}
	return specType
}

// NormalizeFieldName normalizes a field name.
func NormalizeFieldName(s string) string {
	if s == "" {
		return ""
	}
	out := strings.ReplaceAll(s, "[]", "")
	out = bracketRE.ReplaceAllString(out, "_")
	out = underscoreRE.ReplaceAllString(out, "_")
	out = strings.Trim(out, "_")
	return out
}

// Package-level: NormalizeFieldName runs once per field of every entity, so
// compiling these per call showed up in the profile.
var (
	bracketRE     = regexp.MustCompile(`[\[\].]+`)
	underscoreRE  = regexp.MustCompile(`_+`)
	multiHyphenRE = regexp.MustCompile(`-+`)
)

// reCmpVersion splits a trailing _v<N> off a canonized component name.
var reCmpVersion = regexp.MustCompile(`^(.*)_v(\d+)$`)

// guideActive reports whether a guide node (entity, path or op) is active.
// Absent means active. Mirrors src/utility.ts guideActive.
func guideActive(node any) bool {
	m, ok := node.(map[string]any)
	if !ok {
		return true
	}
	if v, has := m["active"]; has {
		if b, isBool := v.(bool); isBool {
			return b
		}
	}
	return true
}

// CleanComponentName cleans a component name by removing common
// suffixes/prefixes. Guarded wrapper suffixes (pagination and op-reply
// wrappers: '_page_response', '_page', '_create_response',
// '_update_response') are stripped ONLY when isKnownCmp reports the
// canonized remainder is itself a known component schema — the wrapper
// convention. Without that guard a real noun gets mangled: an API whose
// resource IS a page (LandingPage at /landing-pages) must keep
// 'landing_page', not become 'landing'. Pass nil to skip guarded
// stripping. Mirrors src/utility.ts cleanComponentName.
func CleanComponentName(name string, isKnownCmp func(string) bool) string {
	cleaned := name
	stripped := false
	// Order matters: longer suffixes first — '_page_response' and
	// '_create_response' also end with '_response'.
	guarded := []string{"_create_response", "_update_response", "_page_response", "_page"}
	suffixes := []string{"_rest_controller", "_controller", "_response", "_request"}
	prefixes := []string{"get_", "post_", "put_", "delete_", "patch_"}
	resultVerbs := []string{
		"list", "create", "show", "update", "delete", "remove",
		"get", "edit", "resolve", "rotate", "search",
	}

	// Version-tolerant known-schema probe: APIs that version their schemas
	// name the base type SeverityV1 / IncidentV2, so a guard asking only for
	// 'severity' misses by exactly the version suffix.
	version := ""
	preVersion := cleaned
	if m := reCmpVersion.FindStringSubmatch(cleaned); m != nil {
		version = m[2]
		cleaned = m[1]
	}
	knownWithVersion := func(remainder string) bool {
		if isKnownCmp == nil {
			return false
		}
		if isKnownCmp(remainder) {
			return true
		}
		return version != "" && isKnownCmp(remainder+"_v"+version)
	}

	// <namespace>_<verb>[_<object>]_result -> the object, else the namespace.
	if isKnownCmp != nil && strings.HasSuffix(cleaned, "_result") {
		base := strings.TrimSuffix(cleaned, "_result")
		parts := strings.Split(base, "_")
		vI := -1
		for i, p := range parts {
			for _, v := range resultVerbs {
				if p == v {
					vI = i
					break
				}
			}
			if vI >= 0 {
				break
			}
		}
		if vI >= 0 {
			after := strings.Join(parts[vI+1:], "_")
			before := strings.Join(parts[:vI], "_")
			var cands []string
			if after != "" {
				cands = []string{Canonize(Depluralize(after)), Canonize(Depluralize(before + "_" + after))}
			} else if before != "" {
				cands = []string{Canonize(Depluralize(before))}
			}
			for _, cand := range cands {
				if len(cand) >= 3 && knownWithVersion(cand) {
					return cand
				}
			}
		}
	}

	if isKnownCmp != nil {
		for _, suffix := range guarded {
			if strings.HasSuffix(cleaned, suffix) {
				parts := strings.Split(cleaned, "_")
				suffixParts := len(strings.Split(strings.TrimPrefix(suffix, "_"), "_"))
				if len(parts) > suffixParts {
					remainder := Canonize(strings.Join(parts[:len(parts)-suffixParts], "_"))
					if len(remainder) >= 3 && knownWithVersion(remainder) {
						cleaned = remainder
						stripped = true
					}
				}
				break
			}
		}
	}

	if !stripped {
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
	}

	// Nothing stripped it: restore the version suffix removed above, or a
	// versioned schema that is a real entity (IncidentV2) silently renames.
	if !stripped && cleaned == reCmpVersion.ReplaceAllString(preVersion, "$1") && version != "" {
		cleaned = preVersion
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
		if cur, ok := existing[padded]; ok {
			// The name was modified (truncated/sanitized) and collides with
			// an existing entity. Only a collision between DIFFERENT origins
			// needs a numeric suffix — the same original name re-encountered
			// (e.g. the same long schema referenced by several methods on one
			// path) must reuse the existing entity so its ops merge instead
			// of minting phantom "<entity>2/3/4" entities. Entities record
			// their pre-truncation name as `longname`; entries without one
			// keep the old always-suffix rule.
			// Mirrors src/utility.ts ensureMinEntityName.
			if sameLongname(cur, name) {
				return padded
			}
			i := 2
			for {
				key := fmt.Sprintf("%s%d", padded, i)
				prev, ok := existing[key]
				if !ok {
					padded = key
					break
				}
				if sameLongname(prev, name) {
					return key
				}
				i++
			}
		}
	}

	return padded
}

// sameLongname reports whether an entmap entry's recorded pre-truncation
// name (`longname`) equals the given original name.
func sameLongname(entry any, name string) bool {
	m, ok := entry.(map[string]any)
	if !ok {
		return false
	}
	ln, ok := m["longname"].(string)
	return ok && ln == name
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
					keys := sortedKeys(m)
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
// FormatJSONIC formats a value in JSONIC format (like JSON but with
// unquoted bare keys, no commas, and keys ending in $ excluded).
// Matches the TS formatJSONIC output exactly.
func FormatJSONIC(val any) string {
	if val == nil {
		return ""
	}
	var lines []string
	seen := map[uintptr]bool{}
	formatJSONICValue(val, 0, "", &lines, seen)
	return strings.Join(lines, "\n") + "\n"
}

var reBareKey = regexp.MustCompile(`^[A-Za-z_][_A-Za-z0-9]*$`)

func isBareKey(k string) bool {
	return reBareKey.MatchString(k)
}

func quoteKey(k string) string {
	if isBareKey(k) {
		return k
	}
	b, _ := json.Marshal(k)
	return string(b)
}

func formatJSONICValue(val any, indent int, prefix string, lines *[]string, seen map[uintptr]bool) {
	space := "  "
	indentStr := strings.Repeat(space, indent)

	if val == nil {
		*lines = append(*lines, prefix+"null")
		return
	}

	switch v := val.(type) {
	case [][]string:
		if len(v) == 0 {
			*lines = append(*lines, prefix+"[")
			*lines = append(*lines, indentStr+"]")
			return
		}
		*lines = append(*lines, prefix+"[")
		for _, inner := range v {
			formatJSONICValue(inner, indent+1, strings.Repeat(space, indent+1), lines, seen)
		}
		*lines = append(*lines, indentStr+"]")
	case string:
		*lines = append(*lines, prefix+jsonString(v))
	case float64:
		if math.IsInf(v, 0) || math.IsNaN(v) {
			*lines = append(*lines, prefix+"null")
		} else if v == math.Trunc(v) {
			*lines = append(*lines, prefix+strconv.FormatInt(int64(v), 10))
		} else {
			*lines = append(*lines, prefix+strconv.FormatFloat(v, 'f', -1, 64))
		}
	case int:
		*lines = append(*lines, prefix+strconv.Itoa(v))
	case int64:
		*lines = append(*lines, prefix+strconv.FormatInt(v, 10))
	case bool:
		if v {
			*lines = append(*lines, prefix+"true")
		} else {
			*lines = append(*lines, prefix+"false")
		}
	case []string:
		if len(v) == 0 {
			*lines = append(*lines, prefix+"[")
			hsep := indent > 0 && indent <= 1
			closeSuffix := ""
			if hsep {
				closeSuffix = "\n"
			}
			*lines = append(*lines, indentStr+"]"+closeSuffix)
			return
		}
		*lines = append(*lines, prefix+"[")
		childPrefix := strings.Repeat(space, indent+1)
		for _, item := range v {
			*lines = append(*lines, childPrefix+jsonString(item))
		}
		hsep := indent > 0 && indent <= 1
		closeSuffix := ""
		if hsep {
			closeSuffix = "\n"
		}
		*lines = append(*lines, indentStr+"]"+closeSuffix)
	case []any:
		if len(v) == 0 {
			*lines = append(*lines, prefix+"[")
			hsep := indent > 0 && indent <= 1
			closeSuffix := ""
			if hsep {
				closeSuffix = "\n"
			}
			*lines = append(*lines, indentStr+"]"+closeSuffix)
			return
		}
		*lines = append(*lines, prefix+"[")
		childPrefix := strings.Repeat(space, indent+1)
		for _, item := range v {
			formatJSONICValue(item, indent+1, childPrefix, lines, seen)
		}
		hsep := indent > 0 && indent <= 1
		closeSuffix := ""
		if hsep {
			closeSuffix = "\n"
		}
		*lines = append(*lines, indentStr+"]"+closeSuffix)
	case map[string]any:
		keys := make([]string, 0, len(v))
		for k := range v {
			// Exclude keys ending in $ or _COMMENT
			if strings.HasSuffix(k, "$") || strings.HasSuffix(k, "_COMMENT") {
				continue
			}
			keys = append(keys, k)
		}
		sort.Strings(keys)

		if len(keys) == 0 {
			*lines = append(*lines, prefix+"{")
			*lines = append(*lines, indentStr+"}")
			return
		}
		*lines = append(*lines, prefix+"{")
		nextIndent := strings.Repeat(space, indent+1)
		for _, k := range keys {
			keyText := quoteKey(k)
			childPrefix := nextIndent + keyText + ": "
			formatJSONICValue(v[k], indent+1, childPrefix, lines, seen)
		}
		sep := ""
		if indent > 0 && indent <= 1 {
			sep = "\n"
		}
		*lines = append(*lines, indentStr+"}"+sep)
	default:
		*lines = append(*lines, prefix+fmt.Sprintf("%v", val))
	}
}

// jsonString serialises a string in JSON-compatible quoting, but mirrors
// TS JSON.stringify by NOT HTML-escaping `<`, `>`, `&` and by emitting
// backtick-quoted JSONIC literals for strings containing newlines (matches
// formatJSONIC's renderPrimitive in src/utility.ts).
func jsonString(s string) string {
	if strings.ContainsAny(s, "\n\r") {
		// Backtick-quoted JSONIC literal — newlines kept verbatim.
		// Mirrors src/utility.ts renderPrimitive: inside a backtick
		// literal a double quote is a literal character, so unescape
		// JSON's \" back to " (was previously replaced with ':', which
		// silently corrupted quoted text).
		raw := jsonStringHTMLSafe(s)
		body := raw[1 : len(raw)-1]
		body = strings.ReplaceAll(body, "\\n", "\n")
		body = strings.ReplaceAll(body, "\\\"", "\"")
		body = strings.ReplaceAll(body, "`", "\\`")
		return "`" + body + "`"
	}
	return jsonStringHTMLSafe(s)
}

// jsonStringHTMLSafe runs json.Marshal-equivalent encoding without
// HTML-escaping (`<` / `>` / `&` / ` ` etc.).
func jsonStringHTMLSafe(s string) string {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(s); err != nil {
		b, _ := json.Marshal(s)
		return string(b)
	}
	out := buf.Bytes()
	if len(out) > 0 && out[len(out)-1] == '\n' {
		out = out[:len(out)-1]
	}
	return string(out)
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
	for _, p := range sortedKeys(defPaths) {
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

func sortedKeys(m map[string]any) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

func sortedKeysBool(m map[string]bool) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

func sortedKeysOpmWork(m map[string][]map[string]any) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
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

// envelopeProp reports the single response property to unwrap to when the body
// is nothing but an ENVELOPE around the result — `{item: {...}}`,
// `{data: {...}}`, `{items: [...]}`, `{results: [...]}` — or "" when the body
// is the result itself.
//
// Two conditions keep this from firing on a response that IS the entity:
//
//  1. EXACTLY ONE property. A body with siblings is a structure in its own
//     right, not a wrapper — `{ok, id}` from a delete, or any paged
//     `{results, next}`, must be handed over whole.
//  2. The property's SHAPE matches the operation's cardinality. A `list`
//     unwraps only to an array, every other op only to a non-array. So a
//     single-entity op facing `{items: [...]}` is left alone rather than
//     silently yielding a list, and vice versa.
//
// A one-field entity whose sole field is itself structured can still be
// unwrapped wrongly; that is the residual cost of the spec not saying which it
// means. Naming the wrapper after the entity remains the unambiguous signal,
// and is still checked first. Mirrors ts/src/utility.ts.
func envelopeProp(resprops map[string]any, opname string) string {
	if len(resprops) == 0 {
		return ""
	}

	// Exactly one STRUCTURED property, with any siblings being scalars.
	//
	// The original rule demanded exactly one property full stop, which missed
	// the single most common envelope shape in the wild:
	//
	//   { "success": true, "data": [ ... ] }
	//   { "status": "ok",  "result": { ... } }
	//
	// A boolean/string status flag beside the payload is metadata, not a
	// sibling of equal standing, so the body is still an envelope. Scalar-only
	// siblings keep the guard meaningful: `{ok, id}` from a delete has no
	// structured member and is still handed over whole, and a body with TWO
	// structured members is a composite we must not guess at.
	//
	// Sorted keys: map iteration order is random in Go, and with more than one
	// structured member the choice must be deterministic to match TS.
	structured := make([]string, 0, len(resprops))
	for _, k := range sortedKeys(resprops) {
		if isEntityWrapperProp(resprops[k]) {
			structured = append(structured, k)
		}
	}
	if len(structured) != 1 {
		return ""
	}

	key := structured[0]
	prop := resprops[key]

	islist, known := propIsList(prop)
	if !known || islist != (opname == "list") {
		return ""
	}

	return key
}

// propIsList reports whether a schema is a collection, and whether the schema
// says at all.
//
// isEntityWrapperProp accepts a composed schema (allOf/oneOf/anyOf) as
// structured, but a composed schema carries no outer `type` or `items` — so
// reading those alone silently called it a non-list. A `list` then kept its
// envelope, and worse, a single-entity op unwrapped to an array-valued
// property. Composed branches are inspected instead, and unanimity required: a
// union that is an array in one branch and an object in another does not say
// what the caller will get, and an envelope is not worth guessing at. Mirrors
// ts/src/utility.ts.
func propIsList(schema any) (bool, bool) {
	sch, ok := schema.(map[string]any)
	if !ok || sch == nil {
		return false, false
	}

	branches, ok := sch["allOf"].([]any)
	if !ok {
		branches, ok = sch["oneOf"].([]any)
	}
	if !ok {
		branches, ok = sch["anyOf"].([]any)
	}
	if ok {
		if len(branches) == 0 {
			return false, false
		}
		first, known := propIsList(branches[0])
		if !known {
			return false, false
		}
		for _, branch := range branches {
			islist, known := propIsList(branch)
			if !known || islist != first {
				return false, false
			}
		}
		return first, true
	}

	return safeStr(sch["type"]) == "array" || sch["items"] != nil, true
}

// isEntityWrapperProp reports whether a response property "wraps" the entity:
// it must be a structured value that could contain the entity (object, array,
// $ref, or composed allOf/oneOf/anyOf schema). A scalar property (string,
// integer, number, boolean) that merely shares the entity's name is a field of
// the entity, not a wrapper. Mirrors ts/src/utility.ts.
func isEntityWrapperProp(propSchema any) bool {
	prop, ok := propSchema.(map[string]any)
	if !ok || prop == nil {
		return false
	}
	if prop["$ref"] != nil {
		return true
	}
	if prop["properties"] != nil ||
		prop["items"] != nil ||
		prop["allOf"] != nil ||
		prop["oneOf"] != nil ||
		prop["anyOf"] != nil {
		return true
	}
	t := safeStr(prop["type"])
	return t == "object" || t == "array"
}

// closedBodyTransform returns the request BODY a closed schema permits, as a
// transform mapping, or nil when there is nothing to restrict.
//
// `additionalProperties: false` is the spec saying the server rejects any
// property it did not declare. When a body says that, sending the caller's
// whole request payload is wrong: an op's payload also carries its PATH params
// (`id` for `PUT /item/{id}`), and a closed shape 400s the entire request over
// that one extra key. Restricting the body to the declared properties is then
// not a heuristic — it is what the spec asked for.
//
// nil for an open or property-less schema, where `reqdata` (send everything)
// remains the right default: an open body accepts extras, and with no declared
// properties there is nothing to restrict to. Mirrors ts/src/utility.ts.
func closedBodyTransform(schema any) map[string]any {
	sch, ok := schema.(map[string]any)
	if !ok || sch == nil {
		return nil
	}

	ap, ok := sch["additionalProperties"].(bool)
	if !ok || ap {
		return nil
	}

	props, _ := sch["properties"].(map[string]any)
	if len(props) == 0 {
		return nil
	}

	// The KEY is the property's wire name — that is what goes on the wire and
	// what the server matches against. The SOURCE is read by the field's
	// CANONICAL name, because that is the only name the caller ever sees:
	// findFieldDefs runs every property through Canonize(NormalizeFieldName()),
	// so a spec property `UserName` reaches the generated request type as
	// `user_name`. Reading `reqdata.UserName` would find nothing and send an
	// undefined value.
	out := map[string]any{}
	for name := range props {
		out[name] = "`reqdata." + Canonize(NormalizeFieldName(name)) + "`"
	}
	return out
}

// UntaggedUnionBranches reports the number of real branches in an UNTAGGED
// union: oneOf/anyOf with two or more branches and no discriminator. Nothing
// in such a schema says which branch a given value is, so no generator can
// choose a variant and the field can only be modelled as an open type.
//
// Two shapes are deliberately NOT unions to resolve: a discriminated union,
// where the discriminator names the deciding property; and the nullable idiom
// anyOf: [X, {type: null}], which is one type that may be absent rather than a
// choice between variants.
//
// Mirrors ts/src/utility.ts untaggedUnionBranches.
func UntaggedUnionBranches(schema any) int {
	sch, ok := schema.(map[string]any)
	if !ok || sch == nil {
		return 0
	}
	if sch["discriminator"] != nil {
		return 0
	}
	branches, ok := sch["oneOf"].([]any)
	if !ok {
		branches, ok = sch["anyOf"].([]any)
	}
	if !ok || len(branches) < 2 {
		return 0
	}
	real := 0
	for _, b := range branches {
		bm, ok := b.(map[string]any)
		if !ok || bm == nil {
			continue
		}
		if safeStr(bm["type"]) == "null" {
			continue
		}
		real++
	}
	if real < 2 {
		return 0
	}
	return real
}

// UnionScan is the widest untagged union reachable from a field schema.
type UnionScan struct {
	Count    int `json:"count"`
	Branches int `json:"branches"`
	Depth    int `json:"depth"`
}

const maxUnionScanDepth = 64

// ScanUntaggedUnion finds the widest untagged union beneath a field schema, or
// nil when the field is resolvable.
//
// The search is RECURSIVE because the union is rarely at the top: in the
// Typebot Builder spec the groups field is an array whose item schema carries
// 18 untagged unions, the widest 19 branches, 12 levels down.
//
// Mirrors ts/src/utility.ts scanUntaggedUnion.
func ScanUntaggedUnion(schema any) *UnionScan {
	return scanUntaggedUnion(schema, 0, map[any]bool{})
}

func scanUntaggedUnion(schema any, depth int, seen map[any]bool) *UnionScan {
	sch, ok := schema.(map[string]any)
	if !ok || sch == nil || depth > maxUnionScanDepth {
		return nil
	}
	// Go maps are not comparable, so identity is tracked by the address of the
	// reflected value rather than the map itself.
	key := fmt.Sprintf("%p", sch)
	if seen[key] {
		return nil
	}
	seen[key] = true

	count := 0
	branches := 0
	at := 0

	if here := UntaggedUnionBranches(sch); here > 0 {
		count = 1
		branches = here
		at = depth
	}

	for _, child := range sch {
		var found *UnionScan
		switch c := child.(type) {
		case map[string]any:
			found = scanUntaggedUnion(c, depth+1, seen)
		case []any:
			for _, item := range c {
				if sub := scanUntaggedUnion(item, depth+2, seen); sub != nil {
					if found == nil {
						found = &UnionScan{}
					}
					found.Count += sub.Count
					if sub.Branches > found.Branches {
						found.Branches = sub.Branches
					}
					if sub.Depth > found.Depth {
						found.Depth = sub.Depth
					}
				}
			}
		}
		if found == nil {
			continue
		}
		count += found.Count
		if found.Branches > branches {
			branches = found.Branches
		}
		if found.Depth > at {
			at = found.Depth
		}
	}

	if count == 0 {
		return nil
	}
	return &UnionScan{Count: count, Branches: branches, Depth: at}
}

// jsWhitespace is the character class JavaScript's `\s` matches. Go's `\s` is
// ASCII-only, and the TS side is the reference implementation, so the set is
// spelled out rather than approximated — a class mismatch would collapse
// whitespace differently in the two ports and surface as a model diff.
const jsWhitespace = "\t\n\v\f\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005" +
	"\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"

var jsWhitespaceRun = regexp.MustCompile("[" + jsWhitespace + "]+")

var firstSentenceRe = regexp.MustCompile(`^(.+?[.!?])([` + jsWhitespace + `]|$)`)

// FirstSentence returns the first sentence of text (up to a `.`/`!`/`?`
// followed by whitespace or end), whitespace-collapsed and length-capped with
// an ellipsis.
//
// Mirrors src/utility.ts firstSentence. The cap counts UTF-16 code units and
// slices on them, because the reference implementation is JavaScript and
// `String.prototype.length` is UTF-16 — counting runes or bytes here would cut
// a long non-ASCII description at a different point than TS does.
//
// Nothing would catch that today: TestValidateModelData compares this port
// against ts/test/model-ref/, but only for solar, petstore and taxonomy, and
// none of those has a description long enough to reach the cap. The ports are
// matched here deliberately rather than because a test insists on it.
func FirstSentence(text string) string {
	collapsed := strings.Trim(jsWhitespaceRun.ReplaceAllString(text, " "), jsWhitespace)

	out := collapsed
	if m := firstSentenceRe.FindStringSubmatch(collapsed); m != nil {
		out = m[1]
	}

	const max = 240
	units := utf16.Encode([]rune(out))
	if len(units) > max {
		out = strings.TrimRight(string(utf16.Decode(units[:max-1])), jsWhitespace) + "\u2026"
	}

	return out
}

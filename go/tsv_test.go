/* Copyright (c) 2024-2025 Voxgig Ltd, MIT License */

package apidef

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"sort"
	"strings"
	"testing"
)

type tsvRow = map[string]string

func loadTsv(t *testing.T, name string) []tsvRow {
	t.Helper()
	fp := filepath.Join("..", "ts", "test", name+".tsv")
	data, err := os.ReadFile(fp)
	if err != nil {
		t.Fatalf("failed to load TSV %s: %v", name, err)
	}
	text := string(data)
	lines := strings.Split(text, "\n")
	var nonEmpty []string
	for _, line := range lines {
		if strings.TrimSpace(line) != "" {
			nonEmpty = append(nonEmpty, line)
		}
	}
	if len(nonEmpty) < 2 {
		return nil
	}
	headers := strings.Split(nonEmpty[0], "\t")
	var rows []tsvRow
	for i := 1; i < len(nonEmpty); i++ {
		cols := strings.Split(nonEmpty[i], "\t")
		row := make(tsvRow)
		for j, h := range headers {
			if j < len(cols) {
				row[h] = cols[j]
			} else {
				row[h] = ""
			}
		}
		rows = append(rows, row)
	}
	return rows
}

// Snakify/Camelify/Kebabify are a hand port of jostraca's partify (the TS
// side imports it). They drive every generated identifier, so this fixture is
// the contract that keeps the port honest — see the note in tsv.test.ts.
func TestTsvNameParts(t *testing.T) {
	rows := loadTsv(t, "name-parts")
	for _, row := range rows {
		input := row["input"]
		t.Run("snakify("+input+")", func(t *testing.T) {
			if got := Snakify(input); got != row["snakify"] {
				t.Errorf("Snakify(%q) = %q, want %q", input, got, row["snakify"])
			}
		})
		t.Run("camelify("+input+")", func(t *testing.T) {
			if got := Camelify(input); got != row["camelify"] {
				t.Errorf("Camelify(%q) = %q, want %q", input, got, row["camelify"])
			}
		})
		t.Run("kebabify("+input+")", func(t *testing.T) {
			if got := Kebabify(input); got != row["kebabify"] {
				t.Errorf("Kebabify(%q) = %q, want %q", input, got, row["kebabify"])
			}
		})
	}
}

func TestTsvDepluralize(t *testing.T) {
	rows := loadTsv(t, "depluralize")
	for _, row := range rows {
		input, expected := row["input"], row["expected"]
		t.Run("depluralize("+input+")", func(t *testing.T) {
			got := Depluralize(input)
			if got != expected {
				t.Errorf("Depluralize(%q) = %q, want %q", input, got, expected)
			}
		})
	}
}

func TestTsvCanonize(t *testing.T) {
	rows := loadTsv(t, "canonize")
	for _, row := range rows {
		input, expected := row["input"], row["expected"]
		t.Run("canonize("+input+")", func(t *testing.T) {
			got := Canonize(input)
			if got != expected {
				t.Errorf("Canonize(%q) = %q, want %q", input, got, expected)
			}
		})
	}
}

func TestTsvPrefixLeadingDigit(t *testing.T) {
	rows := loadTsv(t, "prefix-leading-digit")
	for _, row := range rows {
		input, expected := row["input"], row["expected"]
		t.Run("prefixLeadingDigit("+input+")", func(t *testing.T) {
			got := PrefixLeadingDigit(input)
			if got != expected {
				t.Errorf("PrefixLeadingDigit(%q) = %q, want %q", input, got, expected)
			}
		})
	}
}

func TestTsvSanitizeSlug(t *testing.T) {
	rows := loadTsv(t, "sanitize-slug")
	for _, row := range rows {
		input, expected := row["input"], row["expected"]
		t.Run("sanitizeSlug("+input+")", func(t *testing.T) {
			got := SanitizeSlug(input)
			if got != expected {
				t.Errorf("SanitizeSlug(%q) = %q, want %q", input, got, expected)
			}
		})
	}
}

func TestTsvSlugToPascal(t *testing.T) {
	rows := loadTsv(t, "slug-to-pascal")
	for _, row := range rows {
		input, expected := row["input"], row["expected"]
		t.Run("slugToPascalCase("+input+")", func(t *testing.T) {
			got := SlugToPascalCase(input)
			if got != expected {
				t.Errorf("SlugToPascalCase(%q) = %q, want %q", input, got, expected)
			}
		})
	}
}

func TestTsvTransliterate(t *testing.T) {
	rows := loadTsv(t, "transliterate")
	for _, row := range rows {
		input, expected := row["input"], row["expected"]
		t.Run("transliterate("+input+")", func(t *testing.T) {
			got := Transliterate(input)
			if got != expected {
				t.Errorf("Transliterate(%q) = %q, want %q", input, got, expected)
			}
		})
	}
}

func TestTsvNormalizeFieldName(t *testing.T) {
	rows := loadTsv(t, "normalize-field-name")
	for _, row := range rows {
		input, expected := row["input"], row["expected"]
		t.Run("normalizeFieldName("+input+")", func(t *testing.T) {
			got := NormalizeFieldName(input)
			if got != expected {
				t.Errorf("NormalizeFieldName(%q) = %q, want %q", input, got, expected)
			}
		})
	}
}

func TestTsvCleanComponentName(t *testing.T) {
	rows := loadTsv(t, "clean-component-name")
	for _, row := range rows {
		input, expected := row["input"], row["expected"]
		t.Run("cleanComponentName("+input+")", func(t *testing.T) {
			got := CleanComponentName(input, nil)
			if got != expected {
				t.Errorf("CleanComponentName(%q) = %q, want %q", input, got, expected)
			}
		})
	}
}

func TestTsvInferFieldType(t *testing.T) {
	rows := loadTsv(t, "infer-field-type")
	for _, row := range rows {
		name, specType, expected := row["name"], row["specType"], row["expected"]
		t.Run("inferFieldType("+name+","+specType+")", func(t *testing.T) {
			got := InferFieldTypeString(name, specType)
			if got != expected {
				t.Errorf("InferFieldType(%q, %q) = %q, want %q", name, specType, got, expected)
			}
		})
	}
}

func TestTsvValidator(t *testing.T) {
	rows := loadTsv(t, "validator")
	for _, row := range rows {
		input, expected := row["input"], row["expected"]
		t.Run("validator("+input+")", func(t *testing.T) {
			got := ValidatorString(input)
			if got != expected {
				t.Errorf("Validator(%q) = %q, want %q", input, got, expected)
			}
		})
	}
}

func TestTsvInferTypeFromValue(t *testing.T) {
	rows := loadTsv(t, "infer-type-from-value")
	for _, row := range rows {
		inputStr, expected := row["input"], row["expected"]
		t.Run("inferTypeFromValue("+inputStr+")", func(t *testing.T) {
			var input any
			if inputStr == "null" {
				input = nil
			} else if inputStr == "true" {
				input = true
			} else if inputStr == "false" {
				input = false
			} else {
				json.Unmarshal([]byte(inputStr), &input)
			}
			got := InferTypeFromValue(input)
			if got != expected {
				t.Errorf("InferTypeFromValue(%v) = %q, want %q", input, got, expected)
			}
		})
	}
}

func TestTsvEnsureMinEntityName(t *testing.T) {
	rows := loadTsv(t, "ensure-min-entity-name")
	for _, row := range rows {
		input, expected := row["input"], row["expected"]
		t.Run("ensureMinEntityName("+input+")", func(t *testing.T) {
			got := EnsureMinEntityName(input, map[string]any{})
			if got != expected {
				t.Errorf("EnsureMinEntityName(%q) = %q, want %q", input, got, expected)
			}
		})
	}
}

func TestTsvNom(t *testing.T) {
	rows := loadTsv(t, "nom")
	for _, row := range rows {
		objStr, format, expected := row["object"], row["format"], row["expected"]
		t.Run("nom("+objStr+","+format+")", func(t *testing.T) {
			var obj map[string]any
			json.Unmarshal([]byte(objStr), &obj)
			got := Nom(obj, format)
			if got != expected {
				t.Errorf("Nom(%s, %q) = %q, want %q", objStr, format, got, expected)
			}
		})
	}
}

func TestTsvParseErrors(t *testing.T) {
	rows := loadTsv(t, "parse-errors")
	for _, row := range rows {
		kind, source, pattern := row["kind"], row["source"], row["errorPattern"]
		t.Run("parse("+kind+")_rejects_"+pattern, func(t *testing.T) {
			_, err := Parse(kind, source, map[string]string{"file": "test-file"})
			if err == nil {
				t.Fatalf("expected error matching /%s/, got nil", pattern)
			}
			re := regexp.MustCompile(pattern)
			if !re.MatchString(err.Error()) {
				t.Errorf("error %q does not match /%s/", err.Error(), pattern)
			}
		})
	}

	t.Run("parse_rejects_undefined_source_with_string", func(t *testing.T) {
		_, err := Parse("OpenAPI", "", map[string]string{"file": "test-file"})
		if err == nil {
			t.Fatal("expected error")
		}
		// TS passes undefined which hits "source must be a string"
		// Go passes "" which hits "source is empty" or "source must be a string"
		// Both are acceptable - the key is that it errors
	})

	t.Run("parse_rejects_yaml_comments_with_empty", func(t *testing.T) {
		_, err := Parse("OpenAPI", "# comment 1\n# comment 2", map[string]string{"file": "test-file"})
		if err == nil {
			t.Fatal("expected error")
		}
		if !regexp.MustCompile("empty").MatchString(err.Error()) {
			t.Errorf("error %q does not match /empty/", err.Error())
		}
	})
}

func TestTsvFormatJsonSrc(t *testing.T) {
	rows := loadTsv(t, "format-json-src")
	for _, row := range rows {
		input := row["input"]
		expected := row["expected"]
		t.Run("formatJsonSrc("+input+")", func(t *testing.T) {
			got := FormatJsonSrc(input)
			if got != expected {
				t.Errorf("FormatJsonSrc(%q) = %q, want %q", input, got, expected)
			}
		})
	}
}

func TestTsvStripSchemaNamespace(t *testing.T) {
	rows := loadTsv(t, "strip-schema-namespace")
	for _, row := range rows {
		input, expected := row["input"], row["expected"]
		t.Run("stripSchemaNamespace("+input+")", func(t *testing.T) {
			got := StripSchemaNamespace(input)
			if got != expected {
				t.Errorf("StripSchemaNamespace(%q) = %q, want %q", input, got, expected)
			}
		})
	}
}

func TestTsvCanonizeCmpName(t *testing.T) {
	rows := loadTsv(t, "canonize-cmp-name")
	for _, row := range rows {
		input, expected := row["input"], row["expected"]
		t.Run("canonizeCmpName("+input+")", func(t *testing.T) {
			got := CanonizeCmpName(input)
			if got != expected {
				t.Errorf("CanonizeCmpName(%q) = %q, want %q", input, got, expected)
			}
		})
	}
}

// EnsureMinEntityName same-origin dedup is stateful (depends on the
// `existing` map), so it cannot be a pure-function TSV fixture.
// Mirrors ts/test/tsv.test.ts ensure-min-entity-name-longname.
func TestEnsureMinEntityNameLongname(t *testing.T) {
	long := strings.Repeat("x", 80) + "_tail"
	other := strings.Repeat("x", 80) + "_othertail"

	t.Run("same origin re-encountered reuses the truncated name", func(t *testing.T) {
		existing := map[string]any{}
		first := EnsureMinEntityName(long, existing)
		existing[first] = map[string]any{"name": first, "longname": long}
		if got := EnsureMinEntityName(long, existing); got != first {
			t.Errorf("same-origin re-encounter = %q, want %q", got, first)
		}
	})

	t.Run("different origin with same truncation gets a numeric suffix", func(t *testing.T) {
		existing := map[string]any{}
		first := EnsureMinEntityName(long, existing)
		existing[first] = map[string]any{"name": first, "longname": long}
		second := EnsureMinEntityName(other, existing)
		if second != first+"2" {
			t.Errorf("different-origin = %q, want %q", second, first+"2")
		}
		existing[second] = map[string]any{"name": second, "longname": other}
		if got := EnsureMinEntityName(long, existing); got != first {
			t.Errorf("origin A resolves to %q, want %q", got, first)
		}
		if got := EnsureMinEntityName(other, existing); got != second {
			t.Errorf("origin B resolves to %q, want %q", got, second)
		}
	})

	t.Run("entries without longname keep the always-suffix rule", func(t *testing.T) {
		existing := map[string]any{}
		first := EnsureMinEntityName(long, existing)
		existing[first] = map[string]any{"name": first}
		if got := EnsureMinEntityName(long, existing); got != first+"2" {
			t.Errorf("no-longname entry = %q, want %q", got, first+"2")
		}
	})
}

// Guarded wrapper-suffix stripping needs the isKnownCmp checker, so it
// cannot be a pure-function TSV fixture. Mirrors
// ts/test/tsv.test.ts clean-component-name-guarded.
func TestCleanComponentNameGuarded(t *testing.T) {
	known := map[string]bool{
		"beneficiary": true, "merchant_token": true, "transaction": true,
		"payout": true, "user_invite": true, "role": true,
	}
	isKnown := func(n string) bool { return known[n] }
	cases := [][2]string{
		{"beneficiary_page_response", "beneficiary"},
		{"merchant_token_page", "merchant_token"},
		{"transaction_page", "transaction"},
		{"payouts_create_response", "payout"},
		{"user_invites_update_response", "user_invite"},
		{"roles_create_response", "role"},
		{"landing_page", "landing_page"},
		{"static_page", "static_page"},
		{"generic_page_response", "generic_page"},
	}
	for _, c := range cases {
		input, expected := c[0], c[1]
		t.Run("cleanComponentNameGuarded("+input+")", func(t *testing.T) {
			if got := CleanComponentName(input, isKnown); got != expected {
				t.Errorf("CleanComponentName(%q, known) = %q, want %q", input, got, expected)
			}
		})
	}
}

func TestValidatorUnion(t *testing.T) {
	cases := []struct {
		in   any
		want string
	}{
		{[]any{"string", "null"}, `["` + "`$ONE`" + `",["` + "`$STRING`" + `","` + "`$NULL`" + `"]]`},
		{[]any{"integer", "null", "boolean"}, `["` + "`$ONE`" + `",["` + "`$INTEGER`" + `","` + "`$NULL`" + `","` + "`$BOOLEAN`" + `"]]`},
		{[]any{}, `["` + "`$ONE`" + `",[]]`},
		{"string", `"` + "`$STRING`" + `"`},
		{nil, `"` + "`$ANY`" + `"`},
	}
	for _, c := range cases {
		got, err := json.Marshal(Validator(c.in))
		if err != nil {
			t.Fatalf("marshal: %v", err)
		}
		if string(got) != c.want {
			t.Errorf("Validator(%v) = %s, want %s", c.in, got, c.want)
		}
	}
}

// A nullable field must keep its union all the way through the field
// transform — asserting Validator alone would miss a caller that re-asserts
// the spec type to string and drops the array before Validator sees it.
func TestNullableFieldKeepsUnion(t *testing.T) {
	spec := `openapi: 3.1.0
info: { title: t, version: "1.0.0" }
servers: [ { url: "https://x.example" } ]
paths:
  /widgets:
    get:
      responses:
        "200":
          content:
            application/json:
              schema: { type: array, items: { $ref: "#/components/schemas/Widget" } }
  /widgets/{id}:
    get:
      parameters: [ { name: id, in: path, required: true, schema: { type: string } } ]
      responses:
        "200":
          content: { application/json: { schema: { $ref: "#/components/schemas/Widget" } } }
components:
  schemas:
    Widget:
      type: object
      properties:
        id: { type: string }
        note: { type: [string, "null"] }
`
	def, err := Parse("OpenAPI", spec, map[string]string{"file": "u.yaml"})
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	props := def["components"].(map[string]any)["schemas"].(map[string]any)["Widget"].(map[string]any)["properties"].(map[string]any)
	noteType := props["note"].(map[string]any)["type"]
	got, _ := json.Marshal(InferFieldType("note", Validator(noteType)))
	want := `["` + "`$ONE`" + `",["` + "`$STRING`" + `","` + "`$NULL`" + `"]]`
	if string(got) != want {
		t.Errorf("nullable field type = %s, want %s", got, want)
	}
}

// Alias chains, $ref siblings and cycles — the cases where resolvePointer
// differs from a single-hop lookup. Mirrors ts/test/parse.test.ts parse-refs.
func TestParseRefChains(t *testing.T) {
	const head = `openapi: 3.0.0
info: { title: t, version: "1.0.0" }
servers: [ { url: "https://x.example" } ]
`
	const paths = `paths:
  /thing:
    get:
      responses:
        "200":
          content: { application/json: { schema: { $ref: "#/components/schemas/Alias" } } }
`
	const chain = `components:
  schemas:
    Alias: { $ref: "#/components/schemas/Mid" }
    Mid: { $ref: "#/components/schemas/Real" }
    Real: { type: object, properties: { id: { type: string } } }
`
	const sib = `components:
  schemas:
    Alias: { $ref: "#/components/schemas/Real", description: "aliased" }
    Real: { type: object, description: "target", properties: { id: { type: string } } }
`
	const cyc = `components:
  schemas:
    Alias: { $ref: "#/components/schemas/B" }
    B: { $ref: "#/components/schemas/Alias" }
`
	schemaOf := func(t *testing.T, src string) map[string]any {
		t.Helper()
		def, err := Parse("OpenAPI", src, map[string]string{"file": "p.yaml"})
		if err != nil {
			t.Fatalf("parse: %v", err)
		}
		s := def["paths"].(map[string]any)["/thing"].(map[string]any)["get"].(map[string]any)["responses"].(map[string]any)["200"].(map[string]any)["content"].(map[string]any)["application/json"].(map[string]any)["schema"]
		m, _ := s.(map[string]any)
		return m
	}

	for _, c := range []struct{ name, src string }{
		{"chain/paths-first", head + paths + chain},
		{"chain/components-first", head + chain + paths},
	} {
		t.Run(c.name, func(t *testing.T) {
			s := schemaOf(t, c.src)
			props, ok := s["properties"].(map[string]any)
			if !ok || props["id"] == nil {
				t.Fatalf("alias chain not resolved: %v", s)
			}
		})
	}

	for _, c := range []struct{ name, src string }{
		{"siblings/paths-first", head + paths + sib},
		{"siblings/components-first", head + sib + paths},
	} {
		t.Run(c.name, func(t *testing.T) {
			s := schemaOf(t, c.src)
			if _, ok := s["properties"].(map[string]any); !ok {
				t.Fatalf("not resolved: %v", s)
			}
			if s["description"] != "aliased" {
				t.Errorf("description = %v, want \"aliased\" (sibling must win)", s["description"])
			}
		})
	}

	t.Run("cyclic alias terminates", func(t *testing.T) {
		if s := schemaOf(t, head+paths+cyc); s == nil {
			t.Fatal("expected an object")
		}
	})

	const tree = `components:
  schemas:
    Alias: { type: array, items: { $ref: "#/components/schemas/Alias" } }
`
	for _, c := range []struct{ name, src string }{
		{"own-item/paths-first", head + paths + tree},
		{"own-item/components-first", head + tree + paths},
	} {
		t.Run(c.name, func(t *testing.T) {
			s := schemaOf(t, c.src)
			items, _ := s["items"].(map[string]any)
			if s["type"] != "array" || items == nil || items["type"] != "array" {
				t.Fatalf("self-referential item not resolved: keys %v", sortedKeys(s))
			}
			if s["x-ref"] != "#/components/schemas/Alias" || items["x-ref"] != "#/components/schemas/Alias" {
				t.Errorf("x-ref = %v / %v, want #/components/schemas/Alias", s["x-ref"], items["x-ref"])
			}
		})
	}
}

func TestTsvGuideMigrate(t *testing.T) {
	rows := loadTsv(t, "guide-migrate")
	if len(rows) == 0 {
		t.Fatal("no guide-migrate rows loaded")
	}
	str := func(t *testing.T, cell string) string {
		var s string
		if err := json.Unmarshal([]byte(cell), &s); err != nil {
			t.Fatalf("bad cell %q: %v", cell, err)
		}
		return s
	}
	for _, row := range rows {
		t.Run(row["name"], func(t *testing.T) {
			src := str(t, row["src"])
			includes := migrateGuideIncludes(src, row["prefix"])
			if want := str(t, row["includes"]); includes != want {
				t.Errorf("migrateGuideIncludes = %q, want %q", includes, want)
			}
			if got, want := prefixGuideInclude(src, row["prefix"]), str(t, row["prefixed"]); got != want {
				t.Errorf("prefixGuideInclude = %q, want %q", got, want)
			}
			if got, want := prefixGuideInclude(includes, row["prefix"]), str(t, row["both"]); got != want {
				t.Errorf("both = %q, want %q", got, want)
			}
		})
	}
}

func TestTsvBaseGuideHeader(t *testing.T) {
	rows := loadTsv(t, "base-guide-header")
	if len(rows) == 0 {
		t.Fatal("no base-guide-header rows loaded")
	}
	for _, row := range rows {
		var want []string
		if err := json.Unmarshal([]byte(row["expected"]), &want); err != nil {
			t.Fatal(err)
		}
		if got := baseGuideHeader(row["prefix"]); !reflect.DeepEqual(got, want) {
			t.Errorf("baseGuideHeader(%q) = %q, want %q", row["prefix"], got, want)
		}
	}
}

func TestTsvGuideQuote(t *testing.T) {
	rows := loadTsv(t, "guide-quote")
	if len(rows) == 0 {
		t.Fatal("no guide-quote rows loaded")
	}
	for _, row := range rows {
		var input, want string
		if err := json.Unmarshal([]byte(row["input"]), &input); err != nil {
			t.Fatal(err)
		}
		if err := json.Unmarshal([]byte(row["expected"]), &want); err != nil {
			t.Fatal(err)
		}
		if got := guideJSON(input); got != want {
			t.Errorf("%s: guideJSON = %q, want %q", row["name"], got, want)
		}
	}
}

func TestTsvGuideConflict(t *testing.T) {
	rows := loadTsv(t, "guide-conflict")
	if len(rows) == 0 {
		t.Fatal("no guide-conflict rows loaded")
	}
	for _, row := range rows {
		t.Run(row["name"], func(t *testing.T) {
			var src string
			if err := json.Unmarshal([]byte(row["src"]), &src); err != nil {
				t.Fatal(err)
			}
			var want *guideConflict
			if err := json.Unmarshal([]byte(row["expected"]), &want); err != nil {
				t.Fatal(err)
			}
			got := findConflict(src)
			if !reflect.DeepEqual(got, want) {
				t.Errorf("findConflict(%q) = %+v, want %+v", src, got, want)
			}
		})
	}
}

func TestEnvelopeProp(t *testing.T) {
	rows := loadTsv(t, "envelope-prop")
	if len(rows) == 0 {
		t.Fatal("no envelope-prop rows loaded")
	}
	for _, row := range rows {
		resprops, opname, want := row["resprops"], row["opname"], row["expected"]
		t.Run(resprops+" "+opname, func(t *testing.T) {
			var props map[string]any
			if err := json.Unmarshal([]byte(resprops), &props); err != nil {
				t.Fatalf("bad resprops %q: %v", resprops, err)
			}
			if got := envelopeProp(props, opname); got != want {
				t.Errorf("envelopeProp(%s, %q) = %q, want %q",
					resprops, opname, got, want)
			}
		})
	}
}

func TestEntityWrapperProp(t *testing.T) {
	rows := loadTsv(t, "entity-wrapper-prop")
	if len(rows) == 0 {
		t.Fatal("no entity-wrapper-prop rows loaded")
	}
	for _, row := range rows {
		t.Run(row["name"], func(t *testing.T) {
			var schema any
			if err := json.Unmarshal([]byte(row["schema"]), &schema); err != nil {
				t.Fatalf("bad schema %q: %v", row["schema"], err)
			}
			before, _ := json.Marshal(schema)
			if got, want := isEntityWrapperProp(schema), row["expected"] == "true"; got != want {
				t.Errorf("isEntityWrapperProp(%s) = %v, want %v", row["schema"], got, want)
			}

			// A parsed schema is shared between references, so it is left as it was.
			if after, _ := json.Marshal(schema); string(after) != string(before) {
				t.Errorf("isEntityWrapperProp changed its argument to %s", after)
			}
		})
	}
}

func TestEnvelopeItemRef(t *testing.T) {
	rows := loadTsv(t, "envelope-item-ref")
	if len(rows) == 0 {
		t.Fatal("no envelope-item-ref rows loaded")
	}
	for _, row := range rows {
		src, opname, want := row["schema"], row["opname"], row["expected"]
		t.Run(src+" "+opname, func(t *testing.T) {
			var schema map[string]any
			if err := json.Unmarshal([]byte(src), &schema); err != nil {
				t.Fatalf("bad schema %q: %v", src, err)
			}
			if got := envelopeItemRef(schema, opname); got != want {
				t.Errorf("envelopeItemRef(%s, %q) = %q, want %q", src, opname, got, want)
			}
		})
	}
}

func TestComposedEnvelopeProp(t *testing.T) {
	rows := loadTsv(t, "composed-envelope-prop")
	if len(rows) == 0 {
		t.Fatal("no composed-envelope-prop rows loaded")
	}
	for _, row := range rows {
		src, opname, want := row["schema"], row["opname"], row["expected"]
		t.Run(src+" "+opname, func(t *testing.T) {
			var schema map[string]any
			if err := json.Unmarshal([]byte(src), &schema); err != nil {
				t.Fatalf("bad schema %q: %v", src, err)
			}
			if got := composedEnvelopeProp(schema, opname); got != want {
				t.Errorf("composedEnvelopeProp(%s, %q) = %q, want %q", src, opname, got, want)
			}
		})
	}
}

func TestMergedProperties(t *testing.T) {
	rows := loadTsv(t, "merged-properties")
	if len(rows) == 0 {
		t.Fatal("no merged-properties rows loaded")
	}
	for _, row := range rows {
		src, want := row["schema"], row["expected"]
		t.Run(src, func(t *testing.T) {
			var schema map[string]any
			if err := json.Unmarshal([]byte(src), &schema); err != nil {
				t.Fatalf("bad schema %q: %v", src, err)
			}
			got := mergedProperties(schema)
			if want == "" {
				if got != nil {
					t.Errorf("mergedProperties(%s) = %v, want none", src, got)
				}
				return
			}
			var wantVal map[string]any
			if err := json.Unmarshal([]byte(want), &wantVal); err != nil {
				t.Fatalf("bad expected %q: %v", want, err)
			}
			if !reflect.DeepEqual(got, wantVal) {
				t.Errorf("mergedProperties(%s) = %v, want %v", src, got, wantVal)
			}
		})
	}
}

func TestInferFieldsFromExamples(t *testing.T) {
	rows := loadTsv(t, "infer-fields-from-examples")
	if len(rows) == 0 {
		t.Fatal("no infer-fields-from-examples rows loaded")
	}
	for _, row := range rows {
		src, envelope, want := row["opdef"], row["envelope"], row["expected"]
		t.Run(src+" "+envelope, func(t *testing.T) {
			var opdef map[string]any
			if err := json.Unmarshal([]byte(src), &opdef); err != nil {
				t.Fatalf("bad opdef %q: %v", src, err)
			}
			var wantVal []string
			if err := json.Unmarshal([]byte(want), &wantVal); err != nil {
				t.Fatalf("bad expected %q: %v", want, err)
			}
			got := []string{}
			for _, f := range inferFieldsFromExamples(opdef, envelope) {
				got = append(got, f["key$"].(string)+":"+f["type"].(string))
			}
			if !reflect.DeepEqual(got, wantVal) {
				t.Errorf("inferFieldsFromExamples(%s, %q) = %v, want %v", src, envelope, got, wantVal)
			}
		})
	}
}

// The field FieldTransform builds from one property, beside a plain property
// so that the record is not read as an envelope around it.
func TestAllOfField(t *testing.T) {
	rows := loadTsv(t, "allof-field")
	if len(rows) == 0 {
		t.Fatal("no allof-field rows loaded")
	}
	for _, row := range rows {
		t.Run(row["name"], func(t *testing.T) {
			var schema map[string]any
			if err := json.Unmarshal([]byte(row["schema"]), &schema); err != nil {
				t.Fatalf("bad schema %q: %v", row["schema"], err)
			}
			var want any
			if err := json.Unmarshal([]byte(row["expected"]), &want); err != nil {
				t.Fatalf("bad expected %q: %v", row["expected"], err)
			}
			members, _ := json.Marshal(schema["allOf"])

			ent := map[string]any{
				"name":   "thing",
				"fields": map[string]any{},
				"op": map[string]any{"load": map[string]any{
					"name":   "load",
					"points": []any{map[string]any{"m": "GET", "o": "/things"}},
				}},
			}
			record := map[string]any{"type": "object", "properties": map[string]any{
				row["field"]: schema,
				"label":      map[string]any{"type": "string"},
			}}
			def := map[string]any{"paths": map[string]any{"/things": map[string]any{
				"get": map[string]any{"responses": map[string]any{"200": map[string]any{
					"content": map[string]any{"application/json": map[string]any{"schema": record}},
				}}},
			}}}
			apimodel := map[string]any{"main": map[string]any{
				KIT: map[string]any{"entity": map[string]any{"thing": ent}},
			}}

			if _, err := FieldTransform(&ApiDefContext{ApiModel: apimodel, Def: def}); err != nil {
				t.Fatalf("FieldTransform: %v", err)
			}

			got := map[string]any{}
			for _, fv := range ent["fields"].(map[string]any) {
				f, _ := fv.(map[string]any)
				if f["n"] != row["field"] {
					continue
				}
				for _, k := range []string{"t", "fo", "sh", "de", "ro", "wo"} {
					if v, ok := f[k]; ok {
						got[k] = v
					}
				}
			}
			gotJSON, _ := json.Marshal(got)
			var gotVal any
			_ = json.Unmarshal(gotJSON, &gotVal)
			if !reflect.DeepEqual(gotVal, want) {
				t.Errorf("field %s = %s, want %s", row["field"], gotJSON, row["expected"])
			}

			// A parsed schema is shared between references, so it is left as it was.
			if after, _ := json.Marshal(schema["allOf"]); string(after) != string(members) {
				t.Errorf("the parsed schema changed: %s, was %s", after, members)
			}
		})
	}
}

func TestPathResource(t *testing.T) {
	rows := loadTsv(t, "path-resource")
	if len(rows) == 0 {
		t.Fatal("no path-resource rows loaded")
	}
	for _, row := range rows {
		path, method, want := row["path"], row["method"], row["expected"]
		t.Run(method+" "+path, func(t *testing.T) {
			if got := pathResource(splitAndFilter(path, "/"), method); got != want {
				t.Errorf("pathResource(%q, %q) = %q, want %q", path, method, got, want)
			}
		})
	}
}

func TestNamingSchemas(t *testing.T) {
	rows := loadTsv(t, "naming-schemas")
	if len(rows) == 0 {
		t.Fatal("no naming-schemas rows loaded")
	}
	for _, row := range rows {
		t.Run(row["name"], func(t *testing.T) {
			var paths map[string]any
			var envelope map[string]string
			var want []string
			if err := json.Unmarshal([]byte(row["paths"]), &paths); err != nil {
				t.Fatalf("bad paths %q: %v", row["paths"], err)
			}
			if err := json.Unmarshal([]byte(row["envelope"]), &envelope); err != nil {
				t.Fatalf("bad envelope %q: %v", row["envelope"], err)
			}
			if err := json.Unmarshal([]byte(row["expected"]), &want); err != nil {
				t.Fatalf("bad expected %q: %v", row["expected"], err)
			}
			route := strings.SplitN(row["route"], " ", 2)
			method, path := route[0], route[1]
			answered := answeredRefs(map[string]any{"paths": paths}, envelope)
			pathdef, _ := paths[path].(map[string]any)
			mdef, _ := pathdef[strings.ToLower(method)].(map[string]any)
			responses, _ := mdef["responses"].(map[string]any)
			got := []string{}
			for _, schema := range namingSchemas(method, responses, answered, envelope) {
				got = append(got, namingRef(schema, envelope))
			}
			if !reflect.DeepEqual(got, want) {
				t.Errorf("namingSchemas = %v, want %v", got, want)
			}
		})
	}
}

func TestDistinctShare(t *testing.T) {
	rows := loadTsv(t, "distinct-share")
	if len(rows) == 0 {
		t.Fatal("no distinct-share rows loaded")
	}
	route := func(cell string) ([]string, string) {
		f := strings.SplitN(cell, " ", 2)
		return strings.Split(f[0], ","), f[1]
	}
	for _, row := range rows {
		t.Run(row["name"], func(t *testing.T) {
			var def map[string]any
			if err := json.Unmarshal([]byte(row["def"]), &def); err != nil {
				t.Fatalf("bad def %q: %v", row["def"], err)
			}
			shareMethods, sharePath := route(row["share"])
			itemMethods, itemPath := route(row["item"])
			if got, want := distinctShare(def, sharePath, shareMethods, itemPath, itemMethods), row["expected"] == "true"; got != want {
				t.Errorf("distinctShare = %v, want %v", got, want)
			}
		})
	}
}

func TestDistinctRecord(t *testing.T) {
	rows := loadTsv(t, "distinct-record")
	if len(rows) == 0 {
		t.Fatal("no distinct-record rows loaded")
	}
	for _, row := range rows {
		t.Run(row["name"], func(t *testing.T) {
			var share, item map[string]any
			if err := json.Unmarshal([]byte(row["share"]), &share); err != nil {
				t.Fatalf("bad share %q: %v", row["share"], err)
			}
			if err := json.Unmarshal([]byte(row["item"]), &item); err != nil {
				t.Fatalf("bad item %q: %v", row["item"], err)
			}
			if got, want := distinctRecord(share, item), row["expected"] == "true"; got != want {
				t.Errorf("distinctRecord(%s, %s) = %v, want %v", row["share"], row["item"], got, want)
			}
		})
	}
}

func TestSharedRoutes(t *testing.T) {
	rows := loadTsv(t, "shared-routes")
	if len(rows) == 0 {
		t.Fatal("no shared-routes rows loaded")
	}
	list := func(cell string, sep string) []string {
		if cell == "" {
			return []string{}
		}
		return strings.Split(cell, sep)
	}
	for _, row := range rows {
		t.Run(row["name"], func(t *testing.T) {
			routes := []SharingRoute{}
			for _, route := range list(row["routes"], ";") {
				f := strings.Split(route, " ")
				routes = append(routes, SharingRoute{Cmp: f[0], Method: f[1], Path: f[2], Op: f[3]})
			}
			got := sharedRoutes(routes, list(row["records"], ","))
			if want := list(row["expected"], ";"); !reflect.DeepEqual(got, want) {
				t.Errorf("sharedRoutes = %q, want %q", got, want)
			}
		})
	}
}

func TestEntityParamNames(t *testing.T) {
	rows := loadTsv(t, "entity-param-names")
	if len(rows) == 0 {
		t.Fatal("no entity-param-names rows loaded")
	}
	for _, row := range rows {
		t.Run(row["name"], func(t *testing.T) {
			var paths, want map[string]map[string]string
			if err := json.Unmarshal([]byte(row["paths"]), &paths); err != nil {
				t.Fatalf("bad paths %q: %v", row["paths"], err)
			}
			if err := json.Unmarshal([]byte(row["expected"]), &want); err != nil {
				t.Fatalf("bad expected %q: %v", row["expected"], err)
			}
			if got := entityParamNames(paths); !reflect.DeepEqual(got, want) {
				t.Errorf("entityParamNames = %v, want %v", got, want)
			}
		})
	}
}

func TestNameParam(t *testing.T) {
	rows := loadTsv(t, "name-param")
	if len(rows) == 0 {
		t.Fatal("no name-param rows loaded")
	}
	for _, row := range rows {
		param, want := row["param"], row["expected"] == "true"
		t.Run(param, func(t *testing.T) {
			if got := isNameParam(param); got != want {
				t.Errorf("isNameParam(%q) = %v, want %v", param, got, want)
			}
		})
	}
}

func TestTsvVerbParts(t *testing.T) {
	rows := loadTsv(t, "verb-parts")
	if len(rows) == 0 {
		t.Fatal("no verb-parts rows loaded")
	}
	for _, row := range rows {
		t.Run(row["name"], func(t *testing.T) {
			var want []string
			unmarshalCol(t, row, "parts", &want)
			if got := verbParts(splitAndFilter(row["path"], "/")); !reflect.DeepEqual(got, want) {
				t.Errorf("verbParts(%s) = %q, want %q", row["path"], got, want)
			}
		})
	}
}

func TestTsvPathSegments(t *testing.T) {
	rows := loadTsv(t, "path-segments")
	if len(rows) == 0 {
		t.Fatal("no path-segments rows loaded")
	}
	for _, row := range rows {
		t.Run(row["name"], func(t *testing.T) {
			var rename map[string]any
			unmarshalCol(t, row, "rename", &rename)
			paths := resolvePathList(map[string]any{"path": map[string]any{
				row["path"]: map[string]any{"rename": map[string]any{"param": rename}},
			}}, map[string]any{"paths": map[string]any{}})
			var want any
			unmarshalCol(t, row, "segments", &want)
			if got := paths[0]["segments"]; !jsonEqual(got, want) {
				out, _ := json.Marshal(got)
				t.Errorf("segments\ngot  %s\nwant %s", out, row["segments"])
			}
		})
	}
}

func TestTsvResolveArgs(t *testing.T) {
	rows := loadTsv(t, "resolve-args")
	if len(rows) == 0 {
		t.Fatal("no resolve-args rows loaded")
	}
	for _, row := range rows {
		t.Run(row["name"], func(t *testing.T) {
			var rename map[string]any
			var parameters []any
			unmarshalCol(t, row, "rename", &rename)
			unmarshalCol(t, row, "parameters", &parameters)
			point := map[string]any{
				"o": row["path"], "m": "GET", "r": map[string]any{"param": rename},
				"g": map[string]any{}, "q": map[string]any{"exist": []any{}}, "t": map[string]any{},
			}
			warn := MakeWarner("warning", nil)
			ctx := &ApiDefContext{
				ApiModel: map[string]any{"main": map[string]any{KIT: map[string]any{
					"entity": map[string]any{"widget": map[string]any{
						"name": "widget",
						"op": map[string]any{"load": map[string]any{
							"name": "load", "points": []any{point},
						}},
					}},
				}}},
				Def: map[string]any{"paths": map[string]any{row["path"]: map[string]any{
					"get": map[string]any{"parameters": parameters},
				}}},
				Warn: warn,
			}
			if _, err := ArgsTransform(ctx); err != nil {
				t.Fatal(err)
			}

			g, _ := point["g"].(map[string]any)
			args := func(kind string) []any {
				out := []any{}
				list, _ := g[kind].([]any)
				for _, a := range list {
					am, _ := a.(map[string]any)
					out = append(out, map[string]any{"n": am["n"], "or": am["or"], "k": am["k"], "r": am["r"]})
				}
				return out
			}
			for _, col := range []string{"params", "query"} {
				var want any
				unmarshalCol(t, row, col, &want)
				if got := args(col); !jsonEqual(got, want) {
					out, _ := json.Marshal(got)
					t.Errorf("%s\ngot  %s\nwant %s", col, out, row[col])
				}
			}

			notes := []any{}
			for _, w := range warn.History() {
				notes = append(notes, w["note"])
			}
			var want any
			unmarshalCol(t, row, "warnings", &want)
			if !jsonEqual(notes, want) {
				out, _ := json.Marshal(notes)
				t.Errorf("warnings\ngot  %s\nwant %s", out, row["warnings"])
			}
		})
	}
}

// A Swagger 2 row's `openapi3` column is the parameter it converts to, which
// must give the same argument.
func TestTsvParamSchema(t *testing.T) {
	rows := loadTsv(t, "param-schema")
	if len(rows) == 0 {
		t.Fatal("no param-schema rows loaded")
	}
	argsOf := func(t *testing.T, path string, parameter map[string]any) []any {
		t.Helper()
		point := map[string]any{
			"o": path, "m": "GET", "r": map[string]any{"param": map[string]any{}},
			"g": map[string]any{}, "q": map[string]any{"exist": []any{}}, "t": map[string]any{},
		}
		warn := MakeWarner("warning", nil)
		ctx := &ApiDefContext{
			ApiModel: map[string]any{"main": map[string]any{KIT: map[string]any{
				"entity": map[string]any{"widget": map[string]any{
					"name": "widget",
					"op": map[string]any{"load": map[string]any{
						"name": "load", "points": []any{point},
					}},
				}},
			}}},
			Def: map[string]any{"paths": map[string]any{path: map[string]any{
				"get": map[string]any{"parameters": []any{parameter}},
			}}},
			Warn: warn,
		}
		if _, err := ArgsTransform(ctx); err != nil {
			t.Fatal(err)
		}
		for _, w := range warn.History() {
			t.Errorf("unexpected warning: %v", w["note"])
		}
		args := []any{}
		g, _ := point["g"].(map[string]any)
		for _, kind := range sortedKeys(g) {
			list, _ := g[kind].([]any)
			for _, a := range list {
				am, _ := a.(map[string]any)
				arg := map[string]any{"n": am["n"], "or": am["or"], "t": am["t"], "k": am["k"], "r": am["r"]}
				if ex, has := am["ex"]; has {
					arg["ex"] = ex
				}
				args = append(args, arg)
			}
		}
		return args
	}
	for _, row := range rows {
		t.Run(row["name"], func(t *testing.T) {
			var parameter map[string]any
			var arg any
			unmarshalCol(t, row, "parameter", &parameter)
			unmarshalCol(t, row, "arg", &arg)
			want := []any{arg}
			if got := argsOf(t, row["path"], parameter); !jsonEqual(got, want) {
				out, _ := json.Marshal(got)
				t.Errorf("parameter\ngot  %s\nwant [%s]", out, row["arg"])
			}
			if row["openapi3"] == "-" {
				return
			}
			var twin map[string]any
			unmarshalCol(t, row, "openapi3", &twin)
			if got := argsOf(t, row["path"], twin); !jsonEqual(got, want) {
				out, _ := json.Marshal(got)
				t.Errorf("openapi3\ngot  %s\nwant [%s]", out, row["arg"])
			}
		})
	}
}

func TestClosedBodyTransform(t *testing.T) {
	rows := loadTsv(t, "closed-body-transform")
	if len(rows) == 0 {
		t.Fatal("no closed-body-transform rows loaded")
	}
	for _, row := range rows {
		schemaSrc, wantSrc := row["schema"], row["expected"]
		t.Run(schemaSrc, func(t *testing.T) {
			var schema any
			if err := json.Unmarshal([]byte(schemaSrc), &schema); err != nil {
				t.Fatalf("bad schema %q: %v", schemaSrc, err)
			}
			var want map[string]any
			if err := json.Unmarshal([]byte(wantSrc), &want); err != nil {
				t.Fatalf("bad expected %q: %v", wantSrc, err)
			}

			got := closedBodyTransform(schema)
			if len(got) != len(want) {
				t.Fatalf("closedBodyTransform(%s) = %v, want %v", schemaSrc, got, want)
			}
			for k, v := range want {
				if got[k] != v {
					t.Errorf("closedBodyTransform(%s)[%q] = %v, want %v",
						schemaSrc, k, got[k], v)
				}
			}
		})
	}
}

func TestTsvAuthExchange(t *testing.T) {
	rows := loadTsv(t, "auth-exchange")
	if len(rows) == 0 {
		t.Fatal("no auth-exchange rows loaded")
	}
	for _, row := range rows {
		t.Run(row["note"], func(t *testing.T) {
			var op map[string]any
			if err := json.Unmarshal([]byte(row["op"]), &op); err != nil {
				t.Fatalf("bad op %q: %v", row["op"], err)
			}
			var want any
			if "" != row["expected"] {
				if err := json.Unmarshal([]byte(row["expected"]), &want); err != nil {
					t.Fatalf("bad expected %q: %v", row["expected"], err)
				}
			}

			found := authExchangeOp(op, "true" == row["secured"])
			var got any
			if nil != found {
				got = found
			}
			if !reflect.DeepEqual(got, want) {
				t.Errorf("authExchangeOp(%s) = %v, want %v", row["note"], got, want)
			}
		})
	}
}

func TestTsvSelect(t *testing.T) {
	rows := loadTsv(t, "select")
	if len(rows) == 0 {
		t.Fatal("no select rows loaded")
	}
	for _, row := range rows {
		t.Run(row["name"], func(t *testing.T) {
			var ent, gent map[string]any
			unmarshalCol(t, row, "entity", &ent)
			unmarshalCol(t, row, "guide", &gent)
			name, _ := ent["name"].(string)
			warn := MakeWarner("warning", nil)
			ctx := &ApiDefContext{
				ApiModel: map[string]any{"main": map[string]any{
					KIT: map[string]any{"entity": map[string]any{name: ent}},
				}},
				Guide: map[string]any{"entity": map[string]any{name: gent}},
				Warn:  warn,
			}
			if _, err := SelectTransform(ctx); err != nil {
				t.Fatal(err)
			}

			points := map[string]any{}
			ops, _ := ent["op"].(map[string]any)
			for opname, op := range ops {
				list := []any{}
				opPoints, _ := op.(map[string]any)["points"].([]any)
				for _, pt := range opPoints {
					point, _ := pt.(map[string]any)
					list = append(list, map[string]any{"o": point["o"], "q": point["q"]})
				}
				points[opname] = list
			}
			var wantPoints any
			unmarshalCol(t, row, "points", &wantPoints)
			if !jsonEqual(points, wantPoints) {
				got, _ := json.Marshal(points)
				t.Errorf("points\ngot  %s\nwant %s", got, row["points"])
			}

			warnings := []any{}
			for _, w := range warn.History() {
				warnings = append(warnings, map[string]any{
					"note": w["note"], "entity": w["entity"], "op": w["op"], "points": w["points"],
				})
			}
			var wantWarnings any
			unmarshalCol(t, row, "warnings", &wantWarnings)
			if !jsonEqual(warnings, wantWarnings) {
				got, _ := json.Marshal(warnings)
				t.Errorf("warnings\ngot  %s\nwant %s", got, row["warnings"])
			}
		})
	}
}

func TestTsvSecurity(t *testing.T) {
	rows := loadTsv(t, "security")
	if len(rows) == 0 {
		t.Fatal("no security rows loaded")
	}
	for _, row := range rows {
		t.Run(row["name"], func(t *testing.T) {
			def, err := Parse("OpenAPI", row["spec"], map[string]string{"file": row["name"]})
			if err != nil {
				t.Fatal(err)
			}
			var want any
			unmarshalCol(t, row, "expected", &want)
			var got any
			if found := resolveSecurity(def); found != nil {
				got = found
			}
			if !jsonEqual(got, want) {
				b, _ := json.Marshal(got)
				t.Errorf("got  %s\nwant %s", b, row["expected"])
			}
		})
	}
}

func TestTsvServers(t *testing.T) {
	rows := loadTsv(t, "servers")
	if len(rows) == 0 {
		t.Fatal("no servers rows loaded")
	}
	for _, row := range rows {
		t.Run(row["name"], func(t *testing.T) {
			def := map[string]any{"info": map[string]any{}}
			var fragment map[string]any
			unmarshalCol(t, row, "def", &fragment)
			for k, v := range fragment {
				def[k] = v
			}
			warn := MakeWarner("warning", nil)
			ctx := &ApiDefContext{
				Def:      def,
				Warn:     warn,
				ApiModel: map[string]any{"main": map[string]any{KIT: map[string]any{}}},
			}
			if _, err := TopTransform(ctx); err != nil {
				t.Fatal(err)
			}
			info, _ := getKit(ctx)["info"].(map[string]any)
			var want any
			unmarshalCol(t, row, "servers", &want)
			if !jsonEqual(info["servers"], want) {
				got, _ := json.Marshal(info["servers"])
				t.Errorf("servers\ngot  %s\nwant %s", got, row["servers"])
			}
			notes := []any{}
			for _, w := range warn.History() {
				notes = append(notes, w["note"])
			}
			var wantNotes any
			unmarshalCol(t, row, "warnings", &wantNotes)
			if !jsonEqual(notes, wantNotes) {
				got, _ := json.Marshal(notes)
				t.Errorf("warnings\ngot  %s\nwant %s", got, row["warnings"])
			}
		})
	}
}

func TestTsvAuthPrefix(t *testing.T) {
	rows := loadTsv(t, "auth-prefix")
	if len(rows) == 0 {
		t.Fatal("no auth-prefix rows loaded")
	}
	for _, row := range rows {
		t.Run(row["name"], func(t *testing.T) {
			var text string
			unmarshalCol(t, row, "text", &text)
			if got := findAuthPrefix(text); got != row["expected"] {
				t.Errorf("findAuthPrefix(%q) = %q, want %q", text, got, row["expected"])
			}
		})
	}
}

// Mirrors the TS `spec-secured-by-default` cases.
func TestSpecSecuredByDefault(t *testing.T) {
	cases := []struct {
		name string
		def  map[string]any
		want bool
	}{
		{"non-empty top-level security", map[string]any{
			"security": []any{map[string]any{"bearerAuth": []any{}}}}, true},
		{"empty top-level security", map[string]any{"security": []any{}}, false},
		{"no top-level security", map[string]any{}, false},
		{"nil def", nil, false},
	}
	for _, c := range cases {
		if got := specSecuredByDefault(c.def); got != c.want {
			t.Errorf("%s: specSecuredByDefault = %v, want %v", c.name, got, c.want)
		}
	}
}

func TestRequestEnvelopeProp(t *testing.T) {
	rows := loadTsv(t, "request-envelope")
	if len(rows) == 0 {
		t.Fatal("no request-envelope rows loaded")
	}

	// The name lookup as resolveTransform performs it.
	wrapperName := func(schema map[string]any, origname, name string) string {
		props, _ := schema["properties"].(map[string]any)
		if _, ok := props[origname]; ok && origname != "" {
			return origname
		}
		if _, ok := props[name]; ok && name != "" {
			return name
		}
		return ""
	}

	for _, row := range rows {
		src, origname, name, want :=
			row["reqschema"], row["origname"], row["name"], row["expected"]
		t.Run(src+" "+origname+"/"+name, func(t *testing.T) {
			var schema map[string]any
			if err := json.Unmarshal([]byte(src), &schema); err != nil {
				t.Fatalf("bad reqschema %q: %v", src, err)
			}
			if got := wrapperName(schema, origname, name); got != want {
				t.Errorf("wrapperName(%s, %q, %q) = %q, want %q",
					src, origname, name, got, want)
			}
		})
	}
}

func TestTsvResolved(t *testing.T) {
	for _, row := range loadTsv(t, "resolved") {
		t.Run(row["name"], func(t *testing.T) {
			var def, guide map[string]any
			var selector *OperationSelector
			var expected any
			for _, pair := range []struct {
				text   string
				target any
			}{
				{row["def"], &def}, {row["guide"], &guide}, {row["selector"], &selector}, {row["expected"], &expected},
			} {
				if err := json.Unmarshal([]byte(pair.text), pair.target); err != nil {
					t.Fatal(err)
				}
			}
			before, _ := json.Marshal(def)
			resolved := MakeResolved("openapi3", def, func() map[string]any { return guide })
			var selection []OperationSelector
			if selector != nil {
				selection = append(selection, *selector)
			}
			facts, err := resolved.Operation(row["method"], row["path"], selection...)
			if row["error"] != "" {
				if err == nil || !strings.Contains(err.Error(), row["error"]) {
					t.Fatalf("expected %s, got %v", row["error"], err)
				}
			} else {
				if err != nil {
					t.Fatal(err)
				}
				got, _ := json.Marshal(facts)
				want, _ := json.Marshal(expected)
				if string(got) != string(want) {
					t.Fatalf("got %s, want %s", got, want)
				}
			}
			after, _ := json.Marshal(def)
			if string(before) != string(after) {
				t.Fatal("definition mutated")
			}
		})
	}
}

func TestTsvHumanTitle(t *testing.T) {
	for _, row := range loadTsv(t, "human-title") {
		t.Run(row["input"], func(t *testing.T) {
			if got := HumanTitle(row["input"]); got != row["expected"] {
				t.Errorf("HumanTitle(%q) = %q, want %q", row["input"], got, row["expected"])
			}
		})
	}
}

func TestTsvRefCount(t *testing.T) {
	rows := loadTsv(t, "ref-count")
	if len(rows) == 0 {
		t.Fatal("no ref-count rows loaded")
	}
	for _, row := range rows {
		t.Run(row["name"], func(t *testing.T) {
			def, err := Parse("OpenAPI", row["spec"], map[string]string{"file": row["name"]})
			if err != nil {
				t.Fatal(err)
			}
			var want map[string]int64
			if err := json.Unmarshal([]byte(row["expected"]), &want); err != nil {
				t.Fatal(err)
			}
			if got := CountRefs(def); !jsonEqual(got, want) {
				t.Errorf("got %v\nwant %v", got, want)
			}
		})
	}
}

// Mirrors the TS `find walks a graph, not a tree` cases.
func TestFindWalksAGraph(t *testing.T) {
	vals := func(hits []map[string]any) []string {
		var out []string
		for _, h := range hits {
			out = append(out, h["val"].(string))
		}
		sort.Strings(out)
		return out
	}

	t.Run("a self-referential object terminates", func(t *testing.T) {
		a := map[string]any{"name": "a"}
		a["self"] = a
		if got := vals(Find(a, "name")); !reflect.DeepEqual(got, []string{"a"}) {
			t.Errorf("got %v, want [a]", got)
		}
	})

	t.Run("a cycle through a list terminates, and every match is found once", func(t *testing.T) {
		parent := map[string]any{"name": "parent"}
		child := map[string]any{"name": "child", "parent": parent}
		parent["kids"] = []any{child}
		if got := vals(Find(parent, "name")); !reflect.DeepEqual(got, []string{"child", "parent"}) {
			t.Errorf("got %v, want [child parent]", got)
		}
	})

	t.Run("two references to one object are not two results", func(t *testing.T) {
		shared := map[string]any{"name": "shared"}
		root := map[string]any{"a": shared, "b": shared, "c": map[string]any{"d": shared}}
		if got := len(Find(root, "name")); got != 1 {
			t.Errorf("got %d results, want 1", got)
		}
	})
}

func TestRequestBody(t *testing.T) {
	rows := loadTsv(t, "request-body")
	if len(rows) == 0 {
		t.Fatal("no request-body rows loaded")
	}
	for _, row := range rows {
		t.Run(row["name"], func(t *testing.T) {
			var def map[string]any
			if err := json.Unmarshal([]byte(row["def"]), &def); err != nil {
				t.Fatalf("bad def %q: %v", row["def"], err)
			}
			var got, want any
			if rb := requestBody(def, "POST", "/x", row["media"]); rb != nil {
				b, _ := json.Marshal(rb)
				json.Unmarshal(b, &got)
			}
			if err := json.Unmarshal([]byte(row["expected"]), &want); err != nil {
				t.Fatalf("bad expected %q: %v", row["expected"], err)
			}
			if !reflect.DeepEqual(got, want) {
				t.Errorf("requestBody\ngot  %s\nwant %s", asJSON(got), asJSON(want))
			}
		})
	}
}

// The exported ModelPoint keeps a point's bodies through a round trip.
func TestPointBody(t *testing.T) {
	rows := loadTsv(t, "point-body")
	if len(rows) == 0 {
		t.Fatal("no point-body rows loaded")
	}
	for _, row := range rows {
		t.Run(row["name"], func(t *testing.T) {
			var point ModelPoint
			if err := json.Unmarshal([]byte(row["point"]), &point); err != nil {
				t.Fatalf("bad point %q: %v", row["point"], err)
			}
			data, err := json.Marshal(point)
			if err != nil {
				t.Fatal(err)
			}
			var got, want map[string]any
			json.Unmarshal(data, &got)
			if err := json.Unmarshal([]byte(row["expected"]), &want); err != nil {
				t.Fatalf("bad expected %q: %v", row["expected"], err)
			}
			bodies := map[string]any{}
			for _, key := range []string{"rb", "rs"} {
				if got[key] != nil {
					bodies[key] = got[key]
				}
			}
			if !reflect.DeepEqual(bodies, want) {
				t.Errorf("bodies after a round trip\ngot  %s\nwant %s", asJSON(bodies), asJSON(want))
			}
		})
	}
}

func TestResponseBody(t *testing.T) {
	rows := loadTsv(t, "response-body")
	if len(rows) == 0 {
		t.Fatal("no response-body rows loaded")
	}
	for _, row := range rows {
		t.Run(row["name"], func(t *testing.T) {
			var def map[string]any
			if err := json.Unmarshal([]byte(row["def"]), &def); err != nil {
				t.Fatalf("bad def %q: %v", row["def"], err)
			}
			var got, want any
			if rs := responseBody(def, "GET", "/x", row["media"]); rs != nil {
				b, _ := json.Marshal(rs)
				json.Unmarshal(b, &got)
			}
			if err := json.Unmarshal([]byte(row["expected"]), &want); err != nil {
				t.Fatalf("bad expected %q: %v", row["expected"], err)
			}
			if !reflect.DeepEqual(got, want) {
				t.Errorf("responseBody\ngot  %s\nwant %s", asJSON(got), asJSON(want))
			}
		})
	}
}

// The body pass reads a point's media from its own op's guide entry.
func TestBodyGuide(t *testing.T) {
	rows := loadTsv(t, "body-guide")
	if len(rows) == 0 {
		t.Fatal("no body-guide rows loaded")
	}
	for _, row := range rows {
		t.Run(row["name"], func(t *testing.T) {
			var ent, gent, def map[string]any
			unmarshalCol(t, row, "entity", &ent)
			unmarshalCol(t, row, "guide", &gent)
			unmarshalCol(t, row, "def", &def)
			name, _ := ent["name"].(string)
			ctx := &ApiDefContext{
				ApiModel: map[string]any{"main": map[string]any{
					KIT: map[string]any{"entity": map[string]any{name: ent}},
				}},
				Def:   def,
				Guide: map[string]any{"entity": map[string]any{name: gent}},
			}
			if _, err := BodyTransform(ctx); err != nil {
				t.Fatal(err)
			}

			points := map[string]any{}
			ops, _ := ent["op"].(map[string]any)
			for opname, op := range ops {
				list := []any{}
				opPoints, _ := op.(map[string]any)["points"].([]any)
				for _, pt := range opPoints {
					point, _ := pt.(map[string]any)
					media := map[string]any{}
					for _, key := range []string{"rb", "rs"} {
						if body, ok := point[key].(map[string]any); ok {
							media[key] = body["media"]
						}
					}
					list = append(list, media)
				}
				points[opname] = list
			}
			var want any
			unmarshalCol(t, row, "points", &want)
			if !jsonEqual(points, want) {
				got, _ := json.Marshal(points)
				t.Errorf("points\ngot  %s\nwant %s", got, row["points"])
			}
		})
	}
}

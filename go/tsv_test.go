/* Copyright (c) 2024-2025 Voxgig Ltd, MIT License */

package apidef

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
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

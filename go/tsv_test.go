/* Copyright (c) 2024-2025 Voxgig Ltd, MIT License */

package apidef

import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

type tsvRow = map[string]string

func loadTsv(t *testing.T, name string) []tsvRow {
	t.Helper()
	fp := filepath.Join("..", "test", name+".tsv")
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
			got := CleanComponentName(input)
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
			got := InferFieldType(name, specType)
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
			got := Validator(input)
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

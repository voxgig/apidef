/* Copyright (c) 2024-2025 Voxgig Ltd, MIT License */

package apidef

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type validateCase struct {
	Name    string
	Version string
	Spec    string
	Format  string
}

var validateCases = []validateCase{
	{"solar", "1.0.0", "openapi-3.0.0", "yaml"},
	{"petstore", "1.0.7", "swagger-2.0", "json"},
	{"taxonomy", "1.0.0", "openapi-3.1.0", "yaml"},
	{"foo", "1.0.0", "openapi-3.1.0", "yaml"},
}

func caseName(c validateCase) string {
	return fmt.Sprintf("%s-%s-%s", c.Name, c.Version, c.Spec)
}

func TestValidateGuide(t *testing.T) {
	validateDir := os.Getenv("APIDEF_VALIDATE_DIR")
	if validateDir == "" {
		validateDir = filepath.Join("..", "..", "apidef-validate", "v1")
	}

	defDir := filepath.Join(validateDir, "..", "def")

	for _, c := range validateCases {
		cn := caseName(c)
		t.Run("guide-"+cn, func(t *testing.T) {
			defFile := filepath.Join(defDir, cn+"."+c.Format)
			if _, err := os.Stat(defFile); os.IsNotExist(err) {
				t.Skipf("def file not found: %s", defFile)
				return
			}

			defsrc, err := os.ReadFile(defFile)
			if err != nil {
				t.Fatalf("failed to read def: %v", err)
			}

			parsed, err := Parse("OpenAPI", string(defsrc), map[string]string{"file": defFile})
			if err != nil {
				t.Fatalf("parse failed: %v", err)
			}

			// Verify basic structure
			if parsed == nil {
				t.Fatal("parsed result is nil")
			}
			if _, ok := parsed["paths"]; !ok {
				t.Fatal("no paths in parsed result")
			}

			paths, _ := parsed["paths"].(map[string]any)
			if len(paths) == 0 {
				t.Fatal("no paths found")
			}

			t.Logf("%s: parsed OK, %d paths", cn, len(paths))

			// Run the heuristic to build a guide
			ctx := &ApiDefContext{
				Opts: ApiDefOptions{
					Folder:    t.TempDir(),
					OutPrefix: cn + "-",
					Strategy:  "heuristic01",
				},
				Def:  parsed,
				Note: map[string]any{},
				Warn: MakeWarner("test", nil),
				Work: map[string]any{},
			}

			guideResult, err := BuildGuide(ctx)
			if err != nil {
				t.Fatalf("guide build failed: %v", err)
			}
			if guideResult == nil {
				t.Fatal("guide result is nil")
			}

			guide, _ := guideResult["guide"].(map[string]any)
			if guide == nil {
				// Try nested
				for _, v := range guideResult {
					if m, ok := v.(map[string]any); ok {
						if _, ok := m["entity"]; ok {
							guide = m
							break
						}
					}
				}
			}
			if guide == nil {
				t.Fatal("no guide in result")
			}

			entities, _ := guide["entity"].(map[string]any)
			t.Logf("%s: guide OK, %d entities", cn, len(entities))

			// Compare entity names with TS reference
			refGuideFile := filepath.Join(validateDir, "guide", cn+"-base-guide.jsonic")
			if _, err := os.Stat(refGuideFile); err == nil {
				refGuide, _ := os.ReadFile(refGuideFile)
				refStr := string(refGuide)

				// Extract entity names from reference
				var refEntities []string
				for _, line := range strings.Split(refStr, "\n") {
					line = strings.TrimSpace(line)
					if strings.HasPrefix(line, "entity:") && strings.HasSuffix(line, "{") {
						parts := strings.Fields(line)
						if len(parts) >= 2 {
							entName := strings.TrimSuffix(parts[1], ":")
							refEntities = append(refEntities, entName)
						}
					}
				}

				var goEntities []string
				for name := range entities {
					goEntities = append(goEntities, name)
				}

				t.Logf("%s: TS entities: %v", cn, refEntities)
				t.Logf("%s: Go entities: %v", cn, goEntities)

				// Check that Go found at least the same entities
				refSet := map[string]bool{}
				for _, e := range refEntities {
					refSet[e] = true
				}
				for _, e := range goEntities {
					if !refSet[e] {
						t.Logf("EXTRA Go entity: %s", e)
					}
				}
				goSet := map[string]bool{}
				for _, e := range goEntities {
					goSet[e] = true
				}
				for _, e := range refEntities {
					if !goSet[e] {
						t.Errorf("MISSING Go entity: %s (present in TS)", e)
					}
				}
			}
		})
	}
}

func TestValidateModel(t *testing.T) {
	validateDir := os.Getenv("APIDEF_VALIDATE_DIR")
	if validateDir == "" {
		validateDir = filepath.Join("..", "..", "apidef-validate", "v1")
	}

	defDir := filepath.Join(validateDir, "..", "def")

	for _, c := range validateCases {
		cn := caseName(c)
		t.Run("model-"+cn, func(t *testing.T) {
			defFile := filepath.Join(defDir, cn+"."+c.Format)
			if _, err := os.Stat(defFile); os.IsNotExist(err) {
				t.Skipf("def file not found: %s", defFile)
				return
			}

			if _, err := os.ReadFile(defFile); err != nil {
				t.Fatalf("failed to read def: %v", err)
			}

			tmpDir := t.TempDir()

			apidef := NewApiDef(ApiDefOptions{
				Folder:    tmpDir,
				OutPrefix: cn + "-",
				Strategy:  "heuristic01",
				Debug:     true,
			})

			result, err := apidef.Generate(map[string]any{
				"model": map[string]any{
					"name": c.Name,
					"def":  cn + "." + c.Format,
				},
				"build": map[string]any{
					"spec": map[string]any{
						"base": validateDir,
					},
				},
				"ctrl": map[string]any{
					"step": map[string]any{
						"parse":        true,
						"guide":        true,
						"transformers": true,
						"builders":     false,
						"generate":     false,
					},
				},
			})

			if err != nil {
				t.Fatalf("generate failed: %v", err)
			}
			if !result.OK {
				t.Fatalf("generate not OK: err=%v steps=%v", result.Err, result.Steps)
			}

			apimodel := result.ApiModel
			if apimodel == nil {
				t.Fatalf("no apimodel in result, steps=%v err=%v", result.Steps, result.Err)
			}

			main, _ := apimodel["main"].(map[string]any)
			kit, _ := main[KIT].(map[string]any)
			entities, _ := kit["entity"].(map[string]any)

			t.Logf("%s: model OK, %d entities, steps=%v", cn, len(entities), result.Steps)

			// Compare entity field counts with TS reference
			refModelDir := filepath.Join(validateDir, "model", cn)
			if _, err := os.Stat(refModelDir); err == nil {
				for entName, ent := range entities {
					entMap, _ := ent.(map[string]any)
					if entMap == nil {
						continue
					}

					fields, _ := entMap["fields"].([]any)
					refFile := filepath.Join(refModelDir, cn+"-"+entName+".jsonic")
					if _, err := os.Stat(refFile); err == nil {
						refData, _ := os.ReadFile(refFile)
						refStr := string(refData)
						// Count field entries in reference
						refFieldCount := strings.Count(refStr, "name:")
						goFieldCount := len(fields)

						if goFieldCount != refFieldCount {
							t.Logf("FIELD COUNT DIFF %s: Go=%d TS=%d", entName, goFieldCount, refFieldCount)
						} else {
							t.Logf("%s: %d fields match", entName, goFieldCount)
						}
					}
				}
			}

			// Dump model JSON for inspection
			modelJSON, _ := json.MarshalIndent(map[string]any{
				"entities": len(entities),
				"steps":    result.Steps,
			}, "", "  ")
			t.Logf("%s: summary=%s", cn, string(modelJSON))
		})
	}
}

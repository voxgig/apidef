/* Copyright (c) 2024-2025 Voxgig, MIT License */

package apidef

import "sort"

// FieldTransform extracts and infers entity fields from operations.
func FieldTransform(ctx *ApiDefContext) (*TransformResult, error) {
	kit := getKit(ctx)
	def := ctx.Def
	entityMap := kit["entity"].(map[string]any)

	msg := "field "
	opFieldPrecedence := []string{"load", "create", "update", "patch", "list"}

	for entname, ment := range entityMap {
		mentMap, _ := ment.(map[string]any)
		if mentMap == nil {
			continue
		}

		var fields []any
		seen := map[string]map[string]any{}
		opMap, _ := mentMap["op"].(map[string]any)

		for _, opname := range opFieldPrecedence {
			mop, ok := opMap[opname].(map[string]any)
			if !ok || mop == nil {
				continue
			}
			points, _ := mop["points"].([]any)
			for _, pt := range points {
				mtarget, _ := pt.(map[string]any)
				if mtarget == nil {
					continue
				}
				opfields := resolveOpFields(mtarget, def)
				for _, opfield := range opfields {
					name, _ := opfield["name"].(string)
					if _, exists := seen[name]; !exists {
						fields = append(fields, opfield)
						seen[name] = opfield
					}
				}
			}
		}

		// Sort fields by name
		sort.Slice(fields, func(i, j int) bool {
			fi, _ := fields[i].(map[string]any)
			fj, _ := fields[j].(map[string]any)
			ni, _ := fi["name"].(string)
			nj, _ := fj["name"].(string)
			return ni < nj
		})

		mentMap["fields"] = fields
		msg += entname + " "
	}

	return &TransformResult{OK: true, Msg: msg}, nil
}

func resolveOpFields(mtarget map[string]any, def map[string]any) []map[string]any {
	var mfields []map[string]any
	fielddefs := findFieldDefs(mtarget, def)

	for _, fielddef := range fielddefs {
		name := Canonize(NormalizeFieldName(fielddef["key$"].(string)))
		ftype, _ := fielddef["type"].(string)
		mfield := map[string]any{
			"name":   name,
			"type":   InferFieldType(name, Validator(ftype)),
			"req":    toBool(fielddef["required"]),
			"active": true,
			"op":     map[string]any{},
		}
		mfields = append(mfields, mfield)
	}
	return mfields
}

func findFieldDefs(mtarget map[string]any, def map[string]any) []map[string]any {
	var fielddefs []map[string]any
	defPaths, _ := def["paths"].(map[string]any)
	orig, _ := mtarget["orig"].(string)
	method, _ := mtarget["method"].(string)

	pathdef, _ := defPaths[orig].(map[string]any)
	if pathdef == nil {
		return fielddefs
	}

	methodLower := toLower(method)
	opdef, _ := pathdef[methodLower].(map[string]any)
	if opdef == nil {
		return fielddefs
	}

	responses, _ := opdef["responses"].(map[string]any)
	requestBody, _ := opdef["requestBody"].(map[string]any)

	var fieldSets any

	if responses != nil {
		fieldSets = getFieldResponseSchema(responses, "200")
		if fieldSets == nil {
			fieldSets = getFieldResponseSchema(responses, "201")
		}
	}

	if requestBody != nil {
		reqSchema := getFieldRequestBodySchema(requestBody)
		if reqSchema != nil {
			if fieldSets != nil {
				fieldSets = []any{fieldSets, reqSchema}
			} else {
				fieldSets = reqSchema
			}
		}
	}

	if fieldSets != nil {
		extractFields(fieldSets, &fielddefs)
	}

	// Fallback: infer from examples
	if len(fielddefs) == 0 {
		exampleFields := inferFieldsFromExamples(opdef)
		fielddefs = append(fielddefs, exampleFields...)
	}

	return fielddefs
}

func getFieldResponseSchema(responses map[string]any, code string) any {
	resdef, _ := responses[code].(map[string]any)
	if resdef == nil {
		return nil
	}

	// OpenAPI 3.x
	if content, ok := resdef["content"].(map[string]any); ok {
		if appjson, ok := content["application/json"].(map[string]any); ok {
			if schema, ok := appjson["schema"]; ok {
				return schema
			}
		}
	}

	// Swagger 2.0
	if schema, ok := resdef["schema"]; ok {
		return schema
	}
	return nil
}

func getFieldRequestBodySchema(requestBody map[string]any) any {
	if content, ok := requestBody["content"].(map[string]any); ok {
		if appjson, ok := content["application/json"].(map[string]any); ok {
			if schema, ok := appjson["schema"]; ok {
				return schema
			}
		}
	}
	if schema, ok := requestBody["schema"]; ok {
		return schema
	}
	return nil
}

func extractFields(fieldSets any, fielddefs *[]map[string]any) {
	switch fs := fieldSets.(type) {
	case map[string]any:
		if allOf, ok := fs["allOf"].([]any); ok {
			for _, item := range allOf {
				extractFields(item, fielddefs)
			}
			return
		}
		if props, ok := fs["properties"].(map[string]any); ok {
			requiredNames := map[string]bool{}
			if req, ok := fs["required"].([]any); ok {
				for _, r := range req {
					if s, ok := r.(string); ok {
						requiredNames[s] = true
					}
				}
			}
			for name, prop := range props {
				fd := map[string]any{"key$": name}
				if pm, ok := prop.(map[string]any); ok {
					if t, ok := pm["type"].(string); ok {
						fd["type"] = t
					}
				}
				if requiredNames[name] {
					fd["required"] = true
				}
				*fielddefs = append(*fielddefs, fd)
			}
		}
	case []any:
		for _, item := range fs {
			extractFields(item, fielddefs)
		}
	}
}

func inferFieldsFromExamples(opdef map[string]any) []map[string]any {
	example := findExampleObject(opdef)
	if example == nil {
		return nil
	}
	exMap, ok := example.(map[string]any)
	if !ok {
		return nil
	}

	var fielddefs []map[string]any
	for key, value := range exMap {
		fielddefs = append(fielddefs, map[string]any{
			"key$": key,
			"type": InferTypeFromValue(value),
		})
	}
	return fielddefs
}

func findExampleObject(opdef map[string]any) any {
	responses, _ := opdef["responses"].(map[string]any)
	if responses == nil {
		return nil
	}

	var resdef map[string]any
	for _, code := range []string{"200", "201"} {
		if rd, ok := responses[code].(map[string]any); ok {
			resdef = rd
			break
		}
	}
	if resdef == nil {
		return nil
	}

	// OpenAPI 3.x: content.application/json.example
	if content, ok := resdef["content"].(map[string]any); ok {
		if appjson, ok := content["application/json"].(map[string]any); ok {
			if example, ok := appjson["example"]; ok {
				return unwrapExample(example)
			}
			if examples, ok := appjson["examples"].(map[string]any); ok {
				for _, v := range examples {
					if vm, ok := v.(map[string]any); ok {
						if ex, ok := vm["value"]; ok {
							return unwrapExample(ex)
						}
					}
				}
			}
		}
	}

	// Swagger 2.0
	if example, ok := resdef["example"]; ok {
		return unwrapExample(example)
	}
	if examples, ok := resdef["examples"].(map[string]any); ok {
		if appjson, ok := examples["application/json"]; ok {
			return unwrapExample(appjson)
		}
	}
	if schema, ok := resdef["schema"].(map[string]any); ok {
		if example, ok := schema["example"]; ok {
			return unwrapExample(example)
		}
	}

	return nil
}

func unwrapExample(example any) any {
	if arr, ok := example.([]any); ok {
		if len(arr) > 0 {
			return arr[0]
		}
		return nil
	}
	return example
}

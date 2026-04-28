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

	for _, entname := range sortedKeys(entityMap) {
		ment := entityMap[entname]
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
				opfields := resolveOpFields(mtarget, def, opname)
				for _, opfield := range opfields {
					name, _ := opfield["name"].(string)
					if existing, exists := seen[name]; !exists {
						fields = append(fields, opfield)
						seen[name] = opfield
					} else {
						// Mirrors src/transform/field.ts mergeField: when the
						// same field appears under another op with a
						// different `req`, record the per-op override on the
						// merged field's `op` map.
						newReq, _ := opfield["req"].(bool)
						existReq, _ := existing["req"].(bool)
						if newReq != existReq {
							opOverrides, _ := existing["op"].(map[string]any)
							if opOverrides == nil {
								opOverrides = map[string]any{}
								existing["op"] = opOverrides
							}
							opOverrides[opname] = map[string]any{
								"req":  newReq,
								"type": opfield["type"],
							}
						}
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

func resolveOpFields(mtarget map[string]any, def map[string]any, opname string) []map[string]any {
	var mfields []map[string]any
	fielddefs := findFieldDefs(mtarget, def, opname)

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

func findFieldDefs(mtarget map[string]any, def map[string]any, opname string) []map[string]any {
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

	// Mirrors src/transform/field.ts:117-144. Key invariants:
	//   - Default lookup is the 200 schema; we do NOT fall back to 201 for
	//     arbitrary methods, otherwise create/post ops collect response
	//     fields that TS leaves out (TS only sees 200, which is missing here).
	//   - The list branch unwraps array wrappers, with a 201-items fallback
	//     when no unwrap is possible.
	//   - PUT (method override 'put') falls back to 201 if 200 is absent.
	if responses != nil {
		fieldSets = getFieldResponseSchema(responses, "200")
		if opname == "list" {
			if unwrapped := unwrapArrayWrapper(fieldSets); unwrapped != nil {
				fieldSets = unwrapped
			} else {
				if fromCreated := getFieldResponseSchemaItems(responses, "201"); fromCreated != nil {
					fieldSets = fromCreated
				}
			}
		} else if methodLower == "put" && fieldSets == nil {
			fieldSets = getFieldResponseSchema(responses, "201")
		}
	}

	if requestBody != nil {
		// Mirrors src/transform/field.ts:146-152. TS unconditionally wraps
		// fieldSets in an array when requestBody is present, even if the
		// JSON schema lookup returns undefined. The wrapping is what stops
		// the subsequent reshape (.allOf / .properties) from descending into
		// a response wrapper like MessageResponse — once fieldSets is an
		// array, neither check fires, so each-iteration only sees per-item
		// `properties` (which an allOf-only schema doesn't have).
		reqSchema := getFieldRequestBodySchema(requestBody)
		fieldSets = []any{fieldSets, reqSchema}
	}

	// Mirrors src/transform/field.ts:155-173.
	// TS reshapes fieldSets, then `each(fieldSets, fieldSet => each(fieldSet?.properties, ...))`.
	//   - `each` over an array iterates elements.
	//   - `each` over an object iterates values (sorted by key).
	// So when fieldSets is e.g. `{type: "array", items: <schema>}` neither
	// allOf nor top-level properties trigger a reshape, but the object-each
	// still surfaces the inner `items` schema's properties — which is how
	// non-list ops with array responses still produce fields.
	if fieldSets != nil {
		extractFieldsTopLevel(fieldSets, &fielddefs)
	}

	// Fallback: infer from examples
	if len(fielddefs) == 0 {
		exampleFields := inferFieldsFromExamples(opdef)
		fielddefs = append(fielddefs, exampleFields...)
	}

	return fielddefs
}

// unwrapArrayWrapper inspects a list-response schema and, when it is an
// object with a single array-of-object-schema property (e.g.
// { boards: [Board] } or { items: [Foo], page, total, ... }), returns
// the inner item schema. Returns nil if the input is not unambiguously
// such a wrapper. Mirrors src/transform/field.ts unwrapArrayWrapper.
func unwrapArrayWrapper(schema any) any {
	m, ok := schema.(map[string]any)
	if !ok || m == nil {
		return nil
	}
	// Direct list shape — { type: array, items: ... }
	if t, _ := m["type"].(string); t == "array" {
		if items, ok := m["items"].(map[string]any); ok {
			if hasResolvableProperties(items) {
				return items
			}
		}
		return nil
	}
	props, ok := m["properties"].(map[string]any)
	if !ok || props == nil {
		return nil
	}
	var resolved any
	for _, key := range sortedKeys(props) {
		prop, ok := props[key].(map[string]any)
		if !ok || prop == nil {
			continue
		}
		if t, _ := prop["type"].(string); t != "array" {
			continue
		}
		items, ok := prop["items"].(map[string]any)
		if !ok || items == nil {
			continue
		}
		if !hasResolvableProperties(items) {
			continue
		}
		if resolved != nil {
			return nil // ambiguous: multiple array-of-object properties
		}
		resolved = items
	}
	return resolved
}

func hasResolvableProperties(schema map[string]any) bool {
	if _, ok := schema["properties"].(map[string]any); ok {
		return true
	}
	if allOf, ok := schema["allOf"].([]any); ok && len(allOf) > 0 {
		return true
	}
	return false
}

// getFieldResponseSchemaItems extracts the items array schema from a list response.
// For list endpoints, the response is typically { items: [...], page: N, total: N }.
// This navigates to the items schema to extract entity fields, not wrapper fields.
func getFieldResponseSchemaItems(responses map[string]any, code string) any {
	schema := getFieldResponseSchema(responses, code)
	if schema == nil {
		return nil
	}
	if schemaMap, ok := schema.(map[string]any); ok {
		// Check for properties.items or direct items
		if props, ok := schemaMap["properties"].(map[string]any); ok {
			if items, ok := props["items"].(map[string]any); ok {
				// items might have its own items (array schema)
				if innerItems, ok := items["items"]; ok {
					return innerItems
				}
				return items
			}
		}
		// Direct items field (array schema)
		if items, ok := schemaMap["items"]; ok {
			return items
		}
	}
	return nil
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

// extractFieldsTopLevel handles the TS reshape-then-each pattern:
//
//	if Array.isArray(fieldSets.allOf) → fieldSets = fieldSets.allOf
//	else if fieldSets.properties     → fieldSets = [fieldSets]
//	each(fieldSets, fieldSet => each(fieldSet?.properties, ...))
//
// The implicit "object → iterate values" behavior of `each` means that a
// schema like `{type: "array", items: <schema>}` still yields fields from
// the inner items.
//
// jostraca's each marks every iterated object value with a `key$` property,
// and inferFieldsFromExamples later iterates the same map — so a schema with
// no allOf/properties (e.g. {type: "object", additionalProperties: …,
// example: {…}}) ends up adding a synthetic "key$" entry to the example map.
// Mirror that mutation here so canonize("key$")="key" surfaces alongside the
// example fields, matching TS exactly.
func extractFieldsTopLevel(fieldSets any, fielddefs *[]map[string]any) {
	switch fs := fieldSets.(type) {
	case map[string]any:
		if _, ok := fs["allOf"].([]any); ok {
			extractFields(fs, fielddefs)
			return
		}
		if _, ok := fs["properties"].(map[string]any); ok {
			extractFields(fs, fielddefs)
			return
		}
		for _, k := range sortedKeys(fs) {
			val := fs[k]
			if vm, ok := val.(map[string]any); ok {
				vm["key$"] = k
			}
			extractPropertiesOnly(val, fielddefs)
		}
	case []any:
		for _, item := range fs {
			extractPropertiesOnly(item, fielddefs)
		}
	}
}

// extractPropertiesOnly mirrors the inner `each(fieldSet?.properties, ...)`:
// it pulls a single level of properties (and required[]) from the value, but
// does not descend further. Required[] from the property's own sub-schema is
// preserved as truthy so $ref-resolved properties keep their `req`.
func extractPropertiesOnly(fieldSet any, fielddefs *[]map[string]any) {
	fs, ok := fieldSet.(map[string]any)
	if !ok || fs == nil {
		return
	}
	props, ok := fs["properties"].(map[string]any)
	if !ok || props == nil {
		return
	}
	requiredNames := map[string]bool{}
	if req, ok := fs["required"].([]any); ok {
		for _, r := range req {
			if s, ok := r.(string); ok {
				requiredNames[s] = true
			}
		}
	}
	for _, name := range sortedKeys(props) {
		prop := props[name]
		fd := map[string]any{"key$": name}
		if pm, ok := prop.(map[string]any); ok {
			if t, ok := pm["type"].(string); ok {
				fd["type"] = t
			}
			if r, ok := pm["required"]; ok {
				fd["required"] = r
			}
		}
		if requiredNames[name] {
			fd["required"] = true
		}
		*fielddefs = append(*fielddefs, fd)
	}
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
			for _, name := range sortedKeys(props) {
				prop := props[name]
				fd := map[string]any{"key$": name}
				if pm, ok := prop.(map[string]any); ok {
					if t, ok := pm["type"].(string); ok {
						fd["type"] = t
					}
					// Preserve the property's own `required` so a $ref-
					// resolved sub-schema with its own required array
					// surfaces as a truthy `req` (TS treats `!!array` as
					// true). Mirrors src/transform/field.ts:fielddefs.push(property).
					if r, ok := pm["required"]; ok {
						fd["required"] = r
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
	for _, key := range sortedKeys(exMap) {
		value := exMap[key]
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
				// Mirrors TS Object.values(examples) iteration order: when
				// the parser annotated an `x-examples-order` slice via
				// annotateExamplesOrder we use it; otherwise fall back to
				// alphabetical (e.g. for YAML specs that didn't go through
				// the JSON token walker).
				order := exampleOrder(examples)
				for _, ek := range order {
					v := examples[ek]
					if vm, ok := v.(map[string]any); ok {
						if ex, ok := vm["value"]; ok {
							return unwrapExample(ex)
						}
					}
				}
			}
			// OpenAPI 3.x: content.application/json.schema.example.
			// Mirrors src/transform/field.ts:findExampleObject — TS probes
			// this path after content-level example/examples, so single-key
			// schemas with `example: { ... }` still surface fields.
			if schema, ok := appjson["schema"].(map[string]any); ok {
				if example, ok := schema["example"]; ok {
					return unwrapExample(example)
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

// exampleOrder returns the iteration order for an examples map, preferring
// the `x-examples-order` annotation set by annotateExamplesOrder during
// parse. The annotation key itself is filtered out so it never participates
// in iteration. When no annotation is present (e.g. YAML specs), falls back
// to alphabetical to keep behavior deterministic.
func exampleOrder(examples map[string]any) []string {
	if raw, ok := examples["x-examples-order"]; ok {
		switch o := raw.(type) {
		case []string:
			return o
		case []any:
			out := make([]string, 0, len(o))
			for _, v := range o {
				if s, ok := v.(string); ok {
					out = append(out, s)
				}
			}
			return out
		}
	}
	keys := sortedKeys(examples)
	out := make([]string, 0, len(keys))
	for _, k := range keys {
		if k == "x-examples-order" {
			continue
		}
		out = append(out, k)
	}
	return out
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

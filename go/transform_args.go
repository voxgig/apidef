/* Copyright (c) 2024-2025 Voxgig, MIT License */

package apidef

import "sort"

// ArgsTransform extracts and resolves operation arguments from the API spec.
func ArgsTransform(ctx *ApiDefContext) (*TransformResult, error) {
	kit := getKit(ctx)
	def := ctx.Def
	entityMap := kit["entity"].(map[string]any)

	msg := "args "
	defPaths, _ := def["paths"].(map[string]any)

	for _, entname := range sortedKeys(entityMap) {
		ment := entityMap[entname]
		mentMap, _ := ment.(map[string]any)
		if mentMap == nil {
			continue
		}
		opMap, _ := mentMap["op"].(map[string]any)
		for _, opkey := range sortedKeys(opMap) {
			mop := opMap[opkey]
			mopMap, _ := mop.(map[string]any)
			if mopMap == nil {
				continue
			}
			points, _ := mopMap["points"].([]any)
			for _, pt := range points {
				mtarget, _ := pt.(map[string]any)
				if mtarget == nil {
					continue
				}

				orig, _ := mtarget["orig"].(string)
				method, _ := mtarget["method"].(string)

				var argdefs []map[string]any

				// Path-level parameters
				if pathdef, ok := defPaths[orig].(map[string]any); ok {
					if params, ok := pathdef["parameters"].([]any); ok {
						for _, p := range params {
							if pm, ok := p.(map[string]any); ok {
								argdefs = append(argdefs, pm)
							}
						}
					}
					// Method-level parameters
					methodLower := toLower(method)
					if opdef, ok := pathdef[methodLower].(map[string]any); ok {
						if params, ok := opdef["parameters"].([]any); ok {
							for _, p := range params {
								if pm, ok := p.(map[string]any); ok {
									argdefs = append(argdefs, pm)
								}
							}
						}
					}
				}

				resolveArgs(mtarget, argdefs)
			}
		}
		msg += entname + " "
	}

	return &TransformResult{OK: true, Msg: msg}, nil
}

var argKindMap = map[string]string{
	"query":  "query",
	"header": "header",
	"path":   "param",
	"cookie": "cookie",
}

func resolveArgs(mtarget map[string]any, argdefs []map[string]any) {
	rename, _ := mtarget["rename"].(map[string]any)
	args, _ := mtarget["args"].(map[string]any)
	if args == nil {
		args = map[string]any{}
		mtarget["args"] = args
	}

	for _, argdef := range argdefs {
		argName, _ := argdef["name"].(string)
		argIn, _ := argdef["in"].(string)

		orig := Depluralize(Snakify(NormalizeFieldName(argName)))
		kind := argKindMap[argIn]
		if kind == "" {
			kind = "query"
		}

		name := orig
		if rename != nil {
			if kindRename, ok := rename[kind].(map[string]any); ok {
				if rn, ok := kindRename[orig].(string); ok {
					name = rn
				}
			}
		}

		schemaType := ""
		if schema, ok := argdef["schema"].(map[string]any); ok {
			if t, ok := schema["type"].(string); ok {
				schemaType = t
			}
		}

		var fieldType any = InferFieldType(name, Validator(schemaType))

		// Handle nullable parameters
		if toBool(argdef["nullable"]) {
			fieldType = []any{"`$ONE`", "`$NULL`", fieldType}
		}

		marg := map[string]any{
			"name":   name,
			"orig":   orig,
			"type":   fieldType,
			"kind":   kind,
			"reqd":   toBool(argdef["required"]),
			"active": true,
		}

		argsKey := kind
		if kind == "param" {
			argsKey = "params"
		}

		kindargs, _ := args[argsKey].([]any)
		kindargs = append(kindargs, marg)

		// Sort by name
		sort.Slice(kindargs, func(i, j int) bool {
			ai, _ := kindargs[i].(map[string]any)
			aj, _ := kindargs[j].(map[string]any)
			ni, _ := ai["name"].(string)
			nj, _ := aj["name"].(string)
			return ni < nj
		})

		args[argsKey] = kindargs
	}
}

func toBool(v any) bool {
	if b, ok := v.(bool); ok {
		return b
	}
	return false
}

func toLower(s string) string {
	result := make([]byte, len(s))
	for i := range s {
		if s[i] >= 'A' && s[i] <= 'Z' {
			result[i] = s[i] + 32
		} else {
			result[i] = s[i]
		}
	}
	return string(result)
}

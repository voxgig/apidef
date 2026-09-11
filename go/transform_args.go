/* Copyright (c) 2024-2025 Voxgig, MIT License */

package apidef

import (
	"fmt"
	"sort"
)

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

				resolveArgs(ctx, entname, opkey, mtarget, argdefs)
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

func resolveArgs(
	ctx *ApiDefContext, entname string, opname string,
	mtarget map[string]any, argdefs []map[string]any,
) {
	rename, _ := mtarget["rename"].(map[string]any)
	args, _ := mtarget["args"].(map[string]any)
	if args == nil {
		args = map[string]any{}
		mtarget["args"] = args
	}

	for _, argdef := range argdefs {
		argName, _ := argdef["name"].(string)
		argIn, _ := argdef["in"].(string)

		// THE SPEC NAME AS WRITTEN is what the rename map is keyed by; the
		// snakified form is the user-friendly runtime identifier. Both are
		// needed, and this port kept only the second.
		specName := NormalizeFieldName(argName)
		orig := Depluralize(Snakify(specName))

		// A parameter with no name is not a parameter. This is what a
		// DANGLING `$ref` looks like by the time it reaches here: the
		// reference survives unresolved, `name` and `in` are both absent,
		// and the arg would become a nameless `query` entry that every
		// target then has to render. Ruby cannot: `Struct.new(:"")` raises
		// at load and takes the whole SDK with it. Drop it and say which
		// reference is missing. Mirrors src/transform/args.ts.
		if orig == "" {
			if ctx != nil && ctx.Warn != nil {
				detail := "."
				if ref, ok := argdef["$ref"].(string); ok && ref != "" {
					detail = fmt.Sprintf(": `$ref` %q resolves to nothing.", ref)
				}
				ctx.Warn.Warn(map[string]any{
					"note": fmt.Sprintf(
						"Parameter with no name on entity=%s op=%s path=%s is dropped%s"+
							" A parameter needs a `name`, or a reference that resolves to one.",
						entname, opname, safeStr(mtarget["orig"]), detail),
					"entity": entname,
					"path":   mtarget["orig"],
					"op":     opname,
				})
			}
			continue
		}

		kind := argKindMap[argIn]
		if kind == "" {
			kind = "query"
		}

		// The rename map can be keyed by either the spec original (camelCase)
		// or the snakified form, depending on which path went through
		// heuristic01 — so try both, SPEC NAME FIRST, exactly as TS does.
		//
		// Looking up only the snakified form missed every camelCase rename:
		// petstore renames `petId` to `id`, Go asked the map for `pet_id`,
		// found nothing, and named the parameter `pet_id`. The model then
		// disagreed with TS about the name of the key that addresses a pet,
		// and with its own path segments, which the rename had already
		// rewritten to `{id}`.
		name := orig
		if rename != nil {
			if kindRename, ok := rename[kind].(map[string]any); ok {
				if rn, ok := kindRename[specName].(string); ok && "" != rn {
					name = rn
				} else if rn, ok := kindRename[orig].(string); ok && "" != rn {
					name = rn
				}
			}
		}

		// Mirrors src/transform/args.ts: `validator(argdef.schema?.type)`.
		// Keep this nil (not "") when absent — TS passes `undefined`, which
		// Validator maps to `$ANY`, whereas an empty string maps to "Any".
		// Keep it unasserted when present — a 3.1 nullable arg has a type
		// ARRAY, and asserting to string would drop the union.
		var schemaType any
		if schema, ok := argdef["schema"].(map[string]any); ok {
			schemaType = schema["type"]
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

		// AN EXAMPLE VALUE, where the spec advertises one. Mirrors
		// resolveArgExample in src/transform/args.ts and was missing here, so
		// taxonomy's `page` and `per_page` carried `example: 1` / `20` in the
		// TS model and nothing in Go — a test generator reading the Go model
		// had no valid value for a required parameter with no other source.
		if example, has := resolveArgExample(argdef); has {
			marg["example"] = example
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

// toBool mirrors JavaScript's truthy semantics for non-bool values:
// non-empty arrays/maps/strings → true; zero/empty → false; bool → as-is.
func toBool(v any) bool {
	switch x := v.(type) {
	case nil:
		return false
	case bool:
		return x
	case string:
		return x != ""
	case []any:
		return len(x) > 0
	case []string:
		return len(x) > 0
	case map[string]any:
		return len(x) > 0
	case int:
		return x != 0
	case int64:
		return x != 0
	case float64:
		return x != 0
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

// resolveArgExample finds the example value a spec advertises for a
// parameter. OpenAPI allows four spellings:
//
//	parameter.example         (single value, OAS 3.0+)
//	parameter.examples        (named-example object, take the first .value)
//	parameter.schema.example  (single value on the schema)
//	parameter.schema.default  (default value)
//
// The first found wins, so a test generator can produce a valid live request
// even for a required parameter with no other source. Mirrors
// resolveArgExample in src/transform/args.ts.
func resolveArgExample(argdef map[string]any) (any, bool) {
	if v, has := argdef["example"]; has && v != nil {
		return v, true
	}

	if examples, ok := argdef["examples"].(map[string]any); ok {
		// SORTED, so "the first one" is the same on both ports: Go map
		// iteration is randomised and TS reads insertion order, so an
		// unsorted walk would make this key vary between runs.
		for _, k := range sortedKeys(examples) {
			if e, ok := examples[k].(map[string]any); ok {
				if v, has := e["value"]; has && v != nil {
					return v, true
				}
			}
		}
	}

	if schema, ok := argdef["schema"].(map[string]any); ok {
		if v, has := schema["example"]; has && v != nil {
			return v, true
		}
		if v, has := schema["default"]; has && v != nil {
			return v, true
		}
	}

	return nil, false
}

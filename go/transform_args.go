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

				orig, _ := mtarget["o"].(string)
				method, _ := mtarget["m"].(string)

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
	rename, _ := mtarget["r"].(map[string]any)
	args, _ := mtarget["g"].(map[string]any)
	if args == nil {
		args = map[string]any{}
		mtarget["g"] = args
	}

	var placeholders []string
	for _, m := range pathParamRE.FindAllStringSubmatch(safeStr(mtarget["o"]), -1) {
		placeholders = append(placeholders, m[1])
	}
	paramRename, _ := rename["param"].(map[string]any)

	for _, argdef := range argdefs {
		argName, _ := argdef["name"].(string)
		argIn, _ := argdef["in"].(string)

		// THE SPEC NAME AS WRITTEN is what the rename map is keyed by; the
		// snakified form is the user-friendly runtime identifier. Both are
		// needed, and this port kept only the second.
		specName := NormalizeFieldName(argName)
		orig := Depluralize(Snakify(specName))

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
						entname, opname, safeStr(mtarget["o"]), detail),
					"entity": entname,
					"path":   mtarget["o"],
					"op":     opname,
				})
			}
			continue
		}

		kind := argKindMap[argIn]
		if kind == "" {
			kind = "query"
		}
		placed := false
		if argIn == "" {
			for _, p := range placeholders {
				if p == argName {
					placed = true
					break
				}
			}
			note := fmt.Sprintf("Parameter %s on entity=%s op=%s path=%s has no `in`",
				argName, entname, opname, safeStr(mtarget["o"]))
			if placed {
				kind = "param"
				note += fmt.Sprintf("; it names the path placeholder {%s}, so it is taken as"+
					" a path parameter.", argName)
			} else {
				kind = "query"
				note += ", so it is taken as a query parameter."
			}
			if ctx != nil && ctx.Warn != nil {
				ctx.Warn.Warn(map[string]any{
					"note":   note + " A parameter needs an `in`.",
					"entity": entname,
					"path":   mtarget["o"],
					"op":     opname,
					"param":  argName,
				})
			}
		}

		// Mirrors ts/src/transform/args.ts: a path argument is named by the
		// lookup that names its segment, and is required when it fills a placeholder.
		path := kind == "param"
		fills := false
		for _, p := range placeholders {
			if path && (p == argName || CanonizeParam(p) == orig) {
				fills = true
				break
			}
		}
		name := orig
		if path {
			name = ParamName(argName, paramRename)
		} else if rename != nil {
			if kindRename, ok := rename[kind].(map[string]any); ok {
				if rn, ok := kindRename[specName].(string); ok && "" != rn {
					name = rn
				} else if rn, ok := kindRename[orig].(string); ok && "" != rn {
					name = rn
				}
			}
		}

		schema := paramSchema(argdef)
		var fieldType any = InferFieldType(name, Validator(schema["type"]))

		// Handle nullable parameters
		if toBool(argdef["nullable"]) {
			fieldType = []any{"`$ONE`", "`$NULL`", fieldType}
		}

		// The name the definition gives, which the SDK sends on the wire. The
		// model name beside it is only what a caller writes.
		marg := map[string]any{
			"n":  name,
			"or": argName,
			"t":  fieldType,
			"k":  kind,
			"r":  fills || toBool(argdef["required"]),
			"a":  true,
		}

		if example, has := resolveArgExample(argdef, schema); has {
			marg["ex"] = example
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
			ni, _ := ai["n"].(string)
			nj, _ := aj["n"].(string)
			return lessUTF16(ni, nj)
		})

		args[argsKey] = kindargs
	}

	// Mirrors ts/src/transform/args.ts: a placeholder the definition declares
	// no parameter for takes a required string argument, with a warning.
	if safeStr(mtarget["k"]) != "graphql" {
		params, _ := args["params"].([]any)
		declared := map[string]bool{}
		for _, a := range params {
			am, _ := a.(map[string]any)
			declared[CanonizeParam(safeStr(am["or"]))] = true
		}
		added := false
		named := func(name string) bool {
			for _, a := range params {
				if am, _ := a.(map[string]any); safeStr(am["n"]) == name {
					return true
				}
			}
			return false
		}
		for _, wire := range placeholders {
			orig := CanonizeParam(wire)
			name := ParamName(wire, paramRename)
			// A declared parameter the placeholder is renamed to already fills it.
			if orig == "" || declared[orig] || named(name) {
				continue
			}
			declared[orig] = true
			params = append(params, map[string]any{
				"n": name, "or": wire, "t": InferFieldType(name, Validator("string")),
				"k": "param", "r": true, "a": true,
			})
			added = true
			if ctx != nil && ctx.Warn != nil {
				ctx.Warn.Warn(map[string]any{
					"note": fmt.Sprintf(
						"Path placeholder {%s} on entity=%s op=%s path=%s has no declared parameter,"+
							" so it is taken as a required string.",
						wire, entname, opname, safeStr(mtarget["o"])),
					"entity": entname,
					"path":   mtarget["o"],
					"op":     opname,
				})
			}
		}
		if added {
			sort.Slice(params, func(i, j int) bool {
				ai, _ := params[i].(map[string]any)
				aj, _ := params[j].(map[string]any)
				ni, _ := ai["n"].(string)
				nj, _ := aj["n"].(string)
				return lessUTF16(ni, nj)
			})
			args["params"] = params
		}
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

// paramSchema mirrors ts/src/transform/args.ts: type facts sit on a Swagger 2
// parameter itself, and under `schema` in OpenAPI 3.
func paramSchema(argdef map[string]any) map[string]any {
	if s, has := argdef["schema"]; has && s != nil {
		schema, _ := s.(map[string]any)
		return schema
	}
	if argdef["in"] == "formData" {
		return nil
	}
	if argdef["type"] != "file" {
		return argdef
	}
	binary := make(map[string]any, len(argdef)+1)
	for k, v := range argdef {
		binary[k] = v
	}
	binary["type"] = "string"
	binary["format"] = "binary"
	return binary
}

func resolveArgExample(argdef map[string]any, schema map[string]any) (any, bool) {
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

	if v, has := schema["example"]; has && v != nil {
		return v, true
	}
	if v, has := schema["default"]; has && v != nil {
		return v, true
	}

	return nil, false
}

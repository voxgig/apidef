/* Copyright (c) 2024-2025 Voxgig, MIT License */

package apidef

import "sort"

// SelectTransform selects response fields from OpenAPI definitions.
func SelectTransform(ctx *ApiDefContext) (*TransformResult, error) {
	kit := getKit(ctx)
	guide := ctx.Guide
	entityMap := kit["entity"].(map[string]any)

	msg := "select "
	guideEntity, _ := guide["entity"].(map[string]any)

	for entname, ment := range entityMap {
		mentMap, _ := ment.(map[string]any)
		if mentMap == nil {
			continue
		}
		opMap, _ := mentMap["op"].(map[string]any)
		for _, mop := range opMap {
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
				resolveSelect(guideEntity, entname, mtarget)
			}

			if len(points) > 0 {
				sortPoints(mopMap)
			}
		}
		msg += entname + " "
	}

	return &TransformResult{OK: true, Msg: msg}, nil
}

func resolveSelect(guideEntity map[string]any, entname string, mtarget map[string]any) {
	selectMap, _ := mtarget["select"].(map[string]any)
	if selectMap == nil {
		selectMap = map[string]any{"exist": []any{}}
		mtarget["select"] = selectMap
	}

	margs, _ := mtarget["args"].(map[string]any)
	argKinds := []string{"params", "query", "header", "cookie"}

	exist, _ := selectMap["exist"].([]any)
	existSet := map[string]bool{}
	for _, e := range exist {
		if s, ok := e.(string); ok {
			existSet[s] = true
		}
	}

	for _, kind := range argKinds {
		kindArgs, _ := margs[kind].([]any)
		for _, arg := range kindArgs {
			argMap, _ := arg.(map[string]any)
			if argMap == nil {
				continue
			}
			name, _ := argMap["name"].(string)
			if !existSet[name] {
				exist = append(exist, name)
				existSet[name] = true
			}
		}
	}

	// Sort exist
	sort.Slice(exist, func(i, j int) bool {
		si, _ := exist[i].(string)
		sj, _ := exist[j].(string)
		return si < sj
	})
	selectMap["exist"] = exist

	// Check for actions
	gent, _ := guideEntity[entname].(map[string]any)
	if gent != nil {
		orig, _ := mtarget["orig"].(string)
		gpaths, _ := gent["path"].(map[string]any)
		if gpath, ok := gpaths[orig].(map[string]any); ok {
			if action, ok := gpath["action"].(map[string]any); ok {
				for actname := range action {
					selectMap["$action"] = actname
					break
				}
			}
		}
	}
}

func sortPoints(mop map[string]any) {
	points, _ := mop["points"].([]any)
	sort.SliceStable(points, func(i, j int) bool {
		ai, _ := points[i].(map[string]any)
		aj, _ := points[j].(map[string]any)
		si, _ := ai["select"].(map[string]any)
		sj, _ := aj["select"].(map[string]any)
		ei, _ := si["exist"].([]any)
		ej, _ := sj["exist"].([]any)

		order := len(ej) - len(ei)
		if order != 0 {
			return order < 0
		}

		aai, _ := si["$action"].(string)
		aaj, _ := sj["$action"].(string)
		if aai != "" && aaj != "" {
			if aai != aaj {
				return aai < aaj
			}
		}

		return existStr(ei) < existStr(ej)
	})
}

func existStr(exist []any) string {
	var parts []string
	for _, e := range exist {
		if s, ok := e.(string); ok {
			parts = append(parts, s)
		}
	}
	return joinStr(parts, "\t")
}

func joinStr(parts []string, sep string) string {
	result := ""
	for i, p := range parts {
		if i > 0 {
			result += sep
		}
		result += p
	}
	return result
}

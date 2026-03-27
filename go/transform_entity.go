/* Copyright (c) 2024-2025 Voxgig, MIT License */

package apidef

import "sort"

// EntityTransform creates entity definitions from the guide.
func EntityTransform(ctx *ApiDefContext) (*TransformResult, error) {
	kit := getKit(ctx)
	guide := ctx.Guide
	entityMap := kit["entity"].(map[string]any)

	guideEntity, _ := guide["entity"].(map[string]any)
	msg := ""

	for entname, gent := range guideEntity {
		gentMap, ok := gent.(map[string]any)
		if !ok {
			continue
		}

		pathsDesc := resolvePathList(gentMap, ctx.Def)
		relations := BuildRelations(gentMap, pathsDesc)

		modelent := map[string]any{
			"name":      entname,
			"op":        map[string]any{},
			"fields":    []any{},
			"id":        map[string]any{"name": "id", "field": "id"},
			"relations": relations,
			"alias":     map[string]any{"field": map[string]any{}},
			"active":    true,
			"paths$":    pathsDesc,
		}

		entityMap[entname] = modelent
		msg += entname + " "
	}

	return &TransformResult{OK: true, Msg: msg}, nil
}

func resolvePathList(guideEntity map[string]any, def map[string]any) []map[string]any {
	var pathsDesc []map[string]any

	paths, _ := guideEntity["path"].(map[string]any)
	defPaths, _ := def["paths"].(map[string]any)

	for orig, gpath := range paths {
		gpathMap, _ := gpath.(map[string]any)
		if gpathMap == nil {
			continue
		}

		parts := splitPath(orig)
		rename := map[string]any{}
		if r, ok := gpathMap["rename"].(map[string]any); ok {
			rename = r
			if paramRename, ok := r["param"].(map[string]any); ok {
				for oldName, newName := range paramRename {
					newStr, _ := newName.(string)
					if newStr == "" {
						if rp, ok := newName.(map[string]any); ok {
							newStr, _ = rp["target"].(string)
						}
					}
					for i, p := range parts {
						if p == "{"+oldName+"}" {
							parts[i] = "{" + newStr + "}"
						}
					}
				}
			}
		}

		op := map[string]any{}
		if o, ok := gpathMap["op"].(map[string]any); ok {
			op = o
		}

		pathDef := map[string]any{}
		if defPaths != nil {
			if pd, ok := defPaths[orig].(map[string]any); ok {
				pathDef = pd
			}
		}

		pathdesc := map[string]any{
			"orig":   orig,
			"parts":  parts,
			"rename": rename,
			"method": "",
			"op":     op,
			"def":    pathDef,
		}

		pathsDesc = append(pathsDesc, pathdesc)
	}

	return pathsDesc
}

// BuildRelations determines entity relationships from path structure.
func BuildRelations(guideEntity any, pathsDesc []map[string]any) map[string]any {
	var allAncestors [][]string

	for _, pli := range pathsDesc {
		parts, _ := pli["parts"].([]string)
		if parts == nil {
			continue
		}
		var ancestors []string
		for i, p := range parts {
			if i+1 < len(parts) {
				next := parts[i+1]
				if len(next) > 0 && next[0] == '{' && next != "{id}" {
					ancestors = append(ancestors, p)
				}
			}
		}
		if len(ancestors) > 0 {
			allAncestors = append(allAncestors, ancestors)
		}
	}

	// Sort by length
	sort.Slice(allAncestors, func(i, j int) bool {
		return len(allAncestors[i]) < len(allAncestors[j])
	})

	// Remove suffixes
	var filtered [][]string
	for j, n := range allAncestors {
		isSuffix := false
		for _, p := range allAncestors[j+1:] {
			if arraySuffix(p, n) {
				isSuffix = true
				break
			}
		}
		if !isSuffix {
			filtered = append(filtered, n)
		}
	}

	return map[string]any{
		"ancestors": filtered,
	}
}

func arraySuffix(p, c []string) bool {
	if len(c) > len(p) {
		return false
	}
	for i := range c {
		if c[len(c)-1-i] != p[len(p)-1-i] {
			return false
		}
	}
	return true
}

func splitPath(path string) []string {
	var parts []string
	for _, p := range splitAndFilter(path, "/") {
		parts = append(parts, p)
	}
	return parts
}

func splitAndFilter(s, sep string) []string {
	var result []string
	for _, p := range splitStr(s, sep) {
		if p != "" {
			result = append(result, p)
		}
	}
	return result
}

func splitStr(s, sep string) []string {
	return filterEmpty(split(s, sep))
}

func split(s, sep string) []string {
	parts := make([]string, 0)
	idx := 0
	for {
		i := indexOf(s[idx:], sep)
		if i < 0 {
			parts = append(parts, s[idx:])
			break
		}
		parts = append(parts, s[idx:idx+i])
		idx += i + len(sep)
	}
	return parts
}

func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}

func filterEmpty(ss []string) []string {
	var out []string
	for _, s := range ss {
		if s != "" {
			out = append(out, s)
		}
	}
	return out
}

/* Copyright (c) 2024-2025 Voxgig, MIT License */

package apidef

import (
	"regexp"
	"sort"
	"strings"
)

// EntityTransform creates entity definitions from the guide.
func EntityTransform(ctx *ApiDefContext) (*TransformResult, error) {
	kit := getKit(ctx)
	guide := ctx.Guide
	entityMap := kit["entity"].(map[string]any)

	guideEntity, _ := guide["entity"].(map[string]any)
	msg := ""

	// Mirrors src/transform/entity.ts: the heuristic can leave the plain
	// collection path "/X" on a different entity than the per-instance
	// "/X/{id}" paths, which leaves the owning entity with no list endpoint.
	mergeCollectionPaths(guide)

	for _, entname := range sortedKeys(guideEntity) {
		gent := guideEntity[entname]
		gentMap, ok := gent.(map[string]any)
		if !ok {
			continue
		}

		// `active: false` in guide.aon drops the entity.
		if !guideActive(gentMap) {
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

// instancePathRE matches "/A/{...}" or "/A/{...}/rest"; collectionPathRE
// matches exactly "/A" (one literal segment, no params).
// Mirrors the two regexes in src/transform/entity.ts:mergeCollectionPaths.
var (
	instancePathRE   = regexp.MustCompile(`^/([^/{}]+)/\{[^}]+\}(/.*)?$`)
	collectionPathRE = regexp.MustCompile(`^/([^/{}]+)$`)
)

type rootOwner struct {
	ename string
	depth int
}

// mergeCollectionPaths moves "/X" onto the entity that owns "/X/{id}" or
// "/X/{id}/sub". Only acts when "/X" sits on a different entity than the
// per-instance paths, so correctly-classified APIs are left alone.
// Mirrors src/transform/entity.ts:mergeCollectionPaths.
func mergeCollectionPaths(guide map[string]any) {
	entities, _ := guide["entity"].(map[string]any)
	if entities == nil {
		return
	}

	// First pass: collectionRoot -> owning entity. Prefer the owner whose
	// direct-load path is "/X/{id}" with nothing after it, so a nested
	// sub-resource entity doesn't claim the root.
	rootOwners := map[string]rootOwner{}
	for _, ename := range sortedKeys(entities) {
		entity, _ := entities[ename].(map[string]any)
		if entity == nil {
			continue
		}
		paths, _ := entity["path"].(map[string]any)
		for _, pathStr := range sortedKeys(paths) {
			m := instancePathRE.FindStringSubmatch(pathStr)
			if m == nil {
				continue
			}
			root := m[1]
			depth := 0
			if m[2] != "" {
				for _, seg := range strings.Split(m[2], "/") {
					if seg != "" {
						depth++
					}
				}
			}
			if cur, ok := rootOwners[root]; !ok || depth < cur.depth {
				rootOwners[root] = rootOwner{ename: ename, depth: depth}
			}
		}
	}

	// Second pass: move each "/X" whose root is owned elsewhere.
	for _, ename := range sortedKeys(entities) {
		entity, _ := entities[ename].(map[string]any)
		if entity == nil {
			continue
		}
		paths, _ := entity["path"].(map[string]any)
		if paths == nil {
			continue
		}

		var toMove []string
		for _, pathStr := range sortedKeys(paths) {
			m := collectionPathRE.FindStringSubmatch(pathStr)
			if m == nil {
				continue
			}
			if owner, ok := rootOwners[m[1]]; ok && owner.ename != ename {
				toMove = append(toMove, pathStr)
			}
		}

		for _, pathStr := range toMove {
			owner := rootOwners[strings.TrimPrefix(pathStr, "/")]
			target, _ := entities[owner.ename].(map[string]any)
			if target == nil {
				continue
			}
			tgtPaths, _ := target["path"].(map[string]any)
			if tgtPaths == nil {
				tgtPaths = map[string]any{}
				target["path"] = tgtPaths
			}

			srcPath := paths[pathStr]
			tgtPath, _ := tgtPaths[pathStr].(map[string]any)
			if tgtPath == nil {
				tgtPaths[pathStr] = srcPath
			} else if srcMap, ok := srcPath.(map[string]any); ok {
				// Target already owns this path via a different
				// heuristic-discovered entity (e.g. `/gists` GET on
				// `base_gist`, POST on `gist`). Merge the op/action/rename
				// sets so the second source's methods aren't dropped.
				mergeSubMap(srcMap, tgtPath, "op")
				mergeSubMap(srcMap, tgtPath, "action")
				if srcRename, ok := srcMap["rename"].(map[string]any); ok {
					if srcParam, ok := srcRename["param"].(map[string]any); ok {
						tgtRename, _ := tgtPath["rename"].(map[string]any)
						if tgtRename == nil {
							tgtRename = map[string]any{}
							tgtPath["rename"] = tgtRename
						}
						tgtParam, _ := tgtRename["param"].(map[string]any)
						if tgtParam == nil {
							tgtParam = map[string]any{}
							tgtRename["param"] = tgtParam
						}
						for _, p := range sortedKeys(srcParam) {
							if _, exists := tgtParam[p]; !exists {
								tgtParam[p] = srcParam[p]
							}
						}
					}
				}
			}
			delete(paths, pathStr)
		}
	}
}

// mergeSubMap copies missing keys of src[key] into tgt[key], creating the
// target sub-map when absent.
func mergeSubMap(src map[string]any, tgt map[string]any, key string) {
	srcSub, ok := src[key].(map[string]any)
	if !ok {
		return
	}
	tgtSub, _ := tgt[key].(map[string]any)
	if tgtSub == nil {
		tgtSub = map[string]any{}
		tgt[key] = tgtSub
	}
	for _, name := range sortedKeys(srcSub) {
		if _, exists := tgtSub[name]; !exists {
			tgtSub[name] = srcSub[name]
		}
	}
}

func resolvePathList(guideEntity map[string]any, def map[string]any) []map[string]any {
	var pathsDesc []map[string]any

	paths, _ := guideEntity["path"].(map[string]any)
	defPaths, _ := def["paths"].(map[string]any)

	for _, orig := range sortedKeys(paths) {
		gpath := paths[orig]
		gpathMap, _ := gpath.(map[string]any)
		if gpathMap == nil {
			continue
		}

		// Path-level opt-out (see the entity-level note above).
		if !guideActive(gpathMap) {
			continue
		}

		// THE path construction site (ADR-003), mirroring
		// src/transform/entity.ts. A segment is a literal or a variable;
		// renames apply to the NAME, looked up once from the ORIGINAL spec
		// name, so they cannot chain the way a braced-string rewrite could.
		rename := map[string]any{}
		paramRename := map[string]any{}
		if r, ok := gpathMap["rename"].(map[string]any); ok {
			rename = r
			if pr, ok := r["param"].(map[string]any); ok {
				paramRename = pr
			}
		}

		var segments []map[string]any
		for _, part := range splitPath(orig) {
			if len(part) < 2 || part[0] != '{' || part[len(part)-1] != '}' {
				segments = append(segments, map[string]any{"lit": part})
				continue
			}
			raw := part[1 : len(part)-1]
			// A WHOLE element is the placeholder, or it is a literal.
			// `{a}.{b}` is two parameters glued into one element with a
			// separator that belongs to neither; it is not one parameter
			// called `a}.{b`, and there is no honest var for it. `{}` names
			// nothing. Both stay literal — which is what the braced-string
			// form did with them, since the rename lookup was a whole-element
			// match too. Mirrors src/transform/entity.ts.
			if raw == "" || strings.ContainsAny(raw, "{}") {
				segments = append(segments, map[string]any{"lit": part})
				continue
			}
			name := raw
			if newName, ok := paramRename[raw]; ok {
				if newStr, ok := newName.(string); ok && newStr != "" {
					name = newStr
				} else if rp, ok := newName.(map[string]any); ok {
					if t, ok := rp["target"].(string); ok && t != "" {
						name = t
					}
				}
			}
			segments = append(segments, map[string]any{"var": name})
		}
		if segments == nil {
			segments = []map[string]any{}
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
			"orig":     orig,
			"segments": segments,
			"rename":   rename,
			"method":   "",
			"op":       op,
			"def":      pathDef,
		}

		pathsDesc = append(pathsDesc, pathdesc)
	}

	return pathsDesc
}

// BuildRelations determines entity relationships from path structure.
func BuildRelations(guideEntity any, pathsDesc []map[string]any) map[string]any {
	var allAncestors [][]string

	for _, pli := range pathsDesc {
		segments, _ := pli["segments"].([]map[string]any)
		if segments == nil {
			continue
		}
		var ancestors []string
		for i, s := range segments {
			if i+1 < len(segments) {
				lit, isLit := s["lit"].(string)
				nextVar, isVar := segments[i+1]["var"].(string)
				if isLit && isVar && nextVar != "id" {
					ancestors = append(ancestors, lit)
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

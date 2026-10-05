/* Copyright (c) 2024-2025 Voxgig, MIT License */

package apidef

import (
	"encoding/json"
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

	for _, entname := range sortedKeys(guideEntity) {
		gent := guideEntity[entname]
		gentMap, ok := gent.(map[string]any)
		if !ok {
			continue
		}

		// `active: false` in guide.aontu drops the entity.
		if !guideActive(gentMap) {
			continue
		}

		pathsDesc := resolvePathList(gentMap, ctx.Def)
		relations := BuildRelations(gentMap, pathsDesc)

		modelent := map[string]any{
			"name":      entname,
			"op":        map[string]any{},
			"fields":    map[string]any{},
			"relations": relations,
			"alias":     map[string]any{"field": map[string]any{}},
			"active":    true,
			"paths$":    pathsDesc,
		}

		entityMap[entname] = modelent
		msg += entname + " "
	}

	filterEntityAncestors(entityMap)
	return &TransformResult{OK: true, Msg: msg}, nil
}

func filterEntityAncestors(entities map[string]any) {
	for name, value := range entities {
		entity := value.(map[string]any)
		relations, ok := entity["relations"].(map[string]any)
		if !ok {
			continue
		}
		data, _ := json.Marshal(relations["ancestors"])
		var ancestors [][]string
		if json.Unmarshal(data, &ancestors) != nil {
			continue
		}
		filtered := [][]string{}
		for _, chain := range ancestors {
			kept := []string{}
			for _, ancestor := range chain {
				if _, exists := entities[ancestor]; exists && ancestor != name {
					kept = append(kept, ancestor)
				}
			}
			if len(kept) > 0 {
				filtered = append(filtered, kept)
			}
		}
		relations["ancestors"] = filtered
	}
}

var (
	instancePathRE   = regexp.MustCompile(`^((?:/[^/{}]+)+)/\{[^}]+\}(/.*)?$`)
	collectionPathRE = regexp.MustCompile(`^(?:/[^/{}]+)+$`)
	paramSegmentRE   = regexp.MustCompile(`^\{[^}]+\}$`)
)

// rootOwner mirrors CollectionOwner in ts/src/transform/entity.ts.
type rootOwner struct {
	ename string
	depth int
	route string
	item  bool
}

// mergeCollectionPaths moves "/X" paths onto the entity that owns "/X/{id}",
// or a composite key such as "/X/{owner}/{repo}", and removes the entities
// the moves emptied, returning their names. Mirrors mergeCollectionPaths in
// ts/src/transform/entity.ts. Guide stage only: on the unified guide it would
// override guide.aontu.
func mergeCollectionPaths(guide map[string]any, recordRef func(pathStr string, methods []string, collection bool) string, distinct func(sharePath string, shareMethods []string, itemPath string, itemMethods []string) bool) []string {
	emptied := []string{}
	entities, _ := guide["entity"].(map[string]any)
	if entities == nil {
		return emptied
	}

	// First pass: every route beneath a collection's literals, nearest first.
	owners := map[string][]rootOwner{}
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
			depth := 0
			item := true
			for _, seg := range strings.Split(m[2], "/") {
				if seg == "" {
					continue
				}
				depth++
				if !paramSegmentRE.MatchString(seg) {
					item = false
				}
			}
			owners[m[1]] = append(owners[m[1]], rootOwner{ename: ename, depth: depth, route: pathStr, item: item})
		}
	}
	for _, candidates := range owners {
		sort.SliceStable(candidates, func(i, j int) bool {
			a, b := candidates[i], candidates[j]
			if a.depth != b.depth {
				return a.depth < b.depth
			}
			if a.ename != b.ename {
				return a.ename < b.ename
			}
			return a.route < b.route
		})
	}

	methodsOf := func(pathDesc any) []string {
		pd, _ := pathDesc.(map[string]any)
		ops, _ := pd["op"].(map[string]any)
		methods := make([]string, 0, len(ops))
		for _, k := range sortedKeys(ops) {
			op, _ := ops[k].(map[string]any)
			method, _ := op["method"].(string)
			methods = append(methods, strings.ToUpper(method))
		}
		return methods
	}
	answers := func(pathStr string, methods []string, collection bool) string {
		if recordRef == nil {
			return ""
		}
		return recordRef(pathStr, methods, collection)
	}

	// Mirrors ownerOf in ts/src/transform/entity.ts: the nearest item route,
	// one that answers with the collection's own record first, or with no
	// item route, a deeper route that answers with the same record.
	ownerOf := func(pathStr string, methods []string, candidates []rootOwner) (rootOwner, bool) {
		mine := answers(pathStr, methods, true)
		same := func(c rootOwner) bool {
			if mine == "" {
				return false
			}
			ownerEntity, _ := entities[c.ename].(map[string]any)
			ownerPaths, _ := ownerEntity["path"].(map[string]any)
			return mine == answers(c.route, methodsOf(ownerPaths[c.route]), false)
		}
		var first *rootOwner
		for i := range candidates {
			if !candidates[i].item {
				continue
			}
			if same(candidates[i]) {
				return candidates[i], true
			}
			if first == nil {
				first = &candidates[i]
			}
		}
		if first != nil {
			return *first, true
		}
		for _, c := range candidates {
			if same(c) {
				return c, true
			}
		}
		return rootOwner{}, false
	}

	// Mirrors ts/src/transform/entity.ts: one owner for every entity's share
	// of a collection path.
	shares := map[string][]string{}
	for _, ename := range sortedKeys(entities) {
		entity, _ := entities[ename].(map[string]any)
		paths, _ := entity["path"].(map[string]any)
		for _, pathStr := range sortedKeys(paths) {
			if _, ok := collectionRoot(pathStr); ok {
				shares[pathStr] = append(shares[pathStr], ename)
			}
		}
	}
	owned := map[string]rootOwner{}
	sharedPaths := make([]string, 0, len(shares))
	for pathStr := range shares {
		sharedPaths = append(sharedPaths, pathStr)
	}
	sort.Strings(sharedPaths)
	for _, pathStr := range sharedPaths {
		root, _ := collectionRoot(pathStr)
		candidates, ok := owners[root]
		if !ok {
			continue
		}
		var methods []string
		for _, ename := range shares[pathStr] {
			entity, _ := entities[ename].(map[string]any)
			paths, _ := entity["path"].(map[string]any)
			methods = append(methods, methodsOf(paths[pathStr])...)
		}
		if owner, ok := ownerOf(pathStr, methods, candidates); ok {
			owned[pathStr] = owner
		}
	}

	// Mirrors ts/src/transform/entity.ts: a share answering with a record of
	// its own, unlike the record its owner's item answers with, stays apart.
	apart := func(ename string, pathStr string, owner rootOwner) bool {
		if distinct == nil {
			return false
		}
		entity, _ := entities[ename].(map[string]any)
		paths, _ := entity["path"].(map[string]any)
		ownerEntity, _ := entities[owner.ename].(map[string]any)
		ownerPaths, _ := ownerEntity["path"].(map[string]any)
		return distinct(pathStr, methodsOf(paths[pathStr]), owner.route, methodsOf(ownerPaths[owner.route]))
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
		moveTo := map[string]rootOwner{}
		for _, pathStr := range sortedKeys(paths) {
			if owner, ok := owned[pathStr]; ok && owner.ename != ename && !apart(ename, pathStr, owner) {
				toMove = append(toMove, pathStr)
				moveTo[pathStr] = owner
			}
		}

		for _, pathStr := range toMove {
			owner := moveTo[pathStr]
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

		if 0 < len(toMove) && 0 == len(paths) {
			emptied = append(emptied, ename)
		}
	}

	// With no path left it names nothing guide.aontu could switch back on.
	for _, ename := range emptied {
		delete(entities, ename)
	}

	return emptied
}

// collectionRoot mirrors ts/src/transform/entity.ts: a path of literals
// only, less any trailing slash, is a collection path.
func collectionRoot(pathStr string) (string, bool) {
	key := strings.TrimRight(pathStr, "/")
	if !collectionPathRE.MatchString(key) {
		return "", false
	}
	return key, true
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
				segments = append(segments, map[string]any{"lit": nameLitParams(part, paramRename)})
				continue
			}
			raw := part[1 : len(part)-1]
			if raw == "" || strings.ContainsAny(raw, "{}") {
				segments = append(segments, map[string]any{"lit": nameLitParams(part, paramRename)})
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
			"action":   gpathMap["action"],
			"def":      pathDef,
		}

		pathsDesc = append(pathsDesc, pathdesc)
	}

	return pathsDesc
}

var litParamRE = regexp.MustCompile(`\{([^{}]+)\}`)

// The runtimes fill a literal's placeholders by their parameters' model names.
func nameLitParams(lit string, renames map[string]any) string {
	return litParamRE.ReplaceAllStringFunc(lit, func(placeholder string) string {
		name := ParamName(placeholder[1:len(placeholder)-1], renames)
		if name == "" {
			return placeholder
		}
		return "{" + name + "}"
	})
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
					ancestors = append(ancestors, Depluralize(Snakify(lit)))
				}
			}
		}
		if len(ancestors) > 0 {
			allAncestors = append(allAncestors, ancestors)
		}
	}

	// Stable, as the TS port's Array.sort is.
	sort.SliceStable(allAncestors, func(i, j int) bool {
		return len(allAncestors[i]) < len(allAncestors[j])
	})

	// Remove suffixes
	filtered := [][]string{}
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

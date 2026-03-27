/* Copyright (c) 2024-2025 Voxgig, MIT License */

package apidef

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

// Schema components that occur less than this rate (over total method count) qualify
// as unique entities, not shared schemas.
const IS_ENTCMP_METHOD_RATE = 0.21
const IS_ENTCMP_PATH_RATE = 0.41

var METHOD_IDOP = map[string]string{
	"GET":     "load",
	"POST":    "create",
	"PUT":     "update",
	"DELETE":  "remove",
	"PATCH":   "patch",
	"HEAD":    "head",
	"OPTIONS": "OPTIONS",
}

var METHOD_CONSIDER_ORDER = map[string]int{
	"GET":     100,
	"POST":    200,
	"PUT":     300,
	"PATCH":   400,
	"DELETE":  500,
	"HEAD":    600,
	"OPTIONS": 700,
}

// xrefRE matches component schema references.
var xrefRE = regexp.MustCompile(`/(components/schemas|definitions)/(.+)$`)

// BuildGuide constructs the guide that maps an OpenAPI spec to SDK entities.
func BuildGuide(ctx *ApiDefContext) (map[string]any, error) {
	folder := ctx.Opts.Folder
	if folder == "" {
		folder = "."
	}
	folder, _ = filepath.Abs(folder)

	// Build the base guide using heuristic analysis
	baseguide, err := heuristic01(ctx)
	if err != nil {
		return nil, err
	}

	// Generate guide JSONIC source
	guideSrc := buildGuideSource(ctx, baseguide)

	// Write base guide file
	guideDir := filepath.Join(folder, "guide")
	os.MkdirAll(guideDir, 0755)
	prefix := ctx.Opts.OutPrefix
	baseGuideFile := filepath.Join(guideDir, prefix+"base-guide.jsonic")
	os.WriteFile(baseGuideFile, []byte(guideSrc), 0644)

	// Write guide file
	guideFile := filepath.Join(guideDir, prefix+"guide.jsonic")
	os.WriteFile(guideFile, []byte(guideSrc), 0644)

	// Parse guide back into model
	var guideModel map[string]any
	if err := json.Unmarshal([]byte(guideToJSON(baseguide)), &guideModel); err != nil {
		return nil, fmt.Errorf("failed to parse guide model: %w", err)
	}

	return map[string]any{"guide": guideModel}, nil
}

func guideToJSON(guide map[string]any) string {
	b, _ := json.Marshal(guide)
	return string(b)
}

func buildGuideSource(ctx *ApiDefContext, baseguide map[string]any) string {
	var blocks []string
	blocks = append(blocks, "# Guide", "", "guide: {")

	entity, _ := baseguide["entity"].(map[string]any)
	metrics, _ := baseguide["metrics"].(map[string]any)
	count, _ := metrics["count"].(map[string]any)

	entityCount := toInt(count["entity"])
	pathCount := toInt(count["path"])
	methodCount := toInt(count["method"])

	blocks = append(blocks, fmt.Sprintf("  metrics: count: entity: %d", entityCount))
	blocks = append(blocks, fmt.Sprintf("  metrics: count: path: %d", pathCount))
	blocks = append(blocks, fmt.Sprintf("  metrics: count: method: %d", methodCount))

	// Sort entity names for deterministic output
	entnames := sortedKeys(entity)
	for _, entname := range entnames {
		ent, _ := entity[entname].(map[string]any)
		if ent == nil {
			continue
		}
		blocks = append(blocks, fmt.Sprintf("\n  entity: %s: {", entname))

		paths, _ := ent["path"].(map[string]any)
		pathnames := sortedKeys(paths)
		for _, pathstr := range pathnames {
			path, _ := paths[pathstr].(map[string]any)
			if path == nil {
				continue
			}
			blocks = append(blocks, fmt.Sprintf("    path: %q: {", pathstr))

			// Actions
			if action, ok := path["action"].(map[string]any); ok && len(action) > 0 {
				actionNames := sortedKeys(action)
				for _, actname := range actionNames {
					blocks = append(blocks, fmt.Sprintf("      action: %q: {}", actname))
				}
			}

			// Renames
			if rename, ok := path["rename"].(map[string]any); ok {
				if param, ok := rename["param"].(map[string]any); ok {
					paramNames := sortedKeys(param)
					for _, psrc := range paramNames {
						rp := param[psrc]
						target := ""
						switch v := rp.(type) {
						case string:
							target = v
						case map[string]any:
							target, _ = v["target"].(string)
						}
						blocks = append(blocks, fmt.Sprintf("      rename: param: %q: *%q", psrc, target))
					}
				}
			}

			// Operations
			if op, ok := path["op"].(map[string]any); ok {
				opnames := sortedKeys(op)
				for _, opname := range opnames {
					opdef, _ := op[opname].(map[string]any)
					if opdef == nil {
						continue
					}
					method, _ := opdef["method"].(string)
					blocks = append(blocks, fmt.Sprintf("      op: %s: method: *%s", opname, method))

					if transform, ok := opdef["transform"].(map[string]any); ok {
						if req := transform["req"]; req != nil {
							qt, _ := json.Marshal(req)
							blocks = append(blocks, fmt.Sprintf("      op: %s: transform: res: *(%s)|top", opname, string(qt)))
						}
						if res := transform["res"]; res != nil {
							qt, _ := json.Marshal(res)
							blocks = append(blocks, fmt.Sprintf("      op: %s: transform: res: *(%s)|top", opname, string(qt)))
						}
					}
				}
			}

			blocks = append(blocks, "    }")
		}
		blocks = append(blocks, "  }")
	}

	blocks = append(blocks, "", "}")
	return strings.Join(blocks, "\n")
}

// heuristic01 is the primary heuristic for extracting entities from OpenAPI paths.
func heuristic01(ctx *ApiDefContext) (map[string]any, error) {
	def := ctx.Def
	paths, _ := def["paths"].(map[string]any)

	guide := map[string]any{
		"control": map[string]any{},
		"entity":  map[string]any{},
		"metrics": map[string]any{
			"count": map[string]any{
				"path":        0,
				"method":      0,
				"tag":         0,
				"cmp":         0,
				"entity":      0,
				"origcmprefs": map[string]int{},
			},
			"found": map[string]any{
				"tag": map[string]any{},
				"cmp": map[string]any{},
			},
		},
	}

	data := map[string]any{
		"def":   def,
		"guide": guide,
		"work": map[string]any{
			"pathmap": map[string]any{},
			"entmap":  map[string]any{},
			"entity": map[string]any{
				"count": map[string]any{
					"seen":       0,
					"unresolved": 0,
				},
			},
		},
	}

	metricsMap := guide["metrics"].(map[string]any)
	countMap := metricsMap["count"].(map[string]any)
	foundMap := metricsMap["found"].(map[string]any)
	tagMap := foundMap["tag"].(map[string]any)

	work := data["work"].(map[string]any)
	pathmap := work["pathmap"].(map[string]any)

	// Phase 1: MeasurePath + MeasureMethod + PreparePath
	for pathstr, pathdef := range paths {
		pathdefMap, _ := pathdef.(map[string]any)
		if pathdefMap == nil {
			continue
		}

		// MeasurePath
		countMap["path"] = toInt(countMap["path"]) + 1

		methodCount := 0
		httpMethods := []string{"get", "post", "put", "patch", "delete", "head", "options"}
		for _, m := range httpMethods {
			if _, ok := pathdefMap[m]; ok {
				methodCount++
			}
		}
		countMap["method"] = toInt(countMap["method"]) + methodCount

		// MeasureMethod - collect tags from each method
		for _, m := range httpMethods {
			mdef, ok := pathdefMap[m].(map[string]any)
			if !ok {
				continue
			}
			pathtags, _ := mdef["tags"].([]any)
			if pathtags != nil {
				for _, tag := range pathtags {
					tagStr, ok := tag.(string)
					if ok && tagStr != "" {
						if _, exists := tagMap[tagStr]; !exists {
							countMap["tag"] = toInt(countMap["tag"]) + 1
							tagMap[tagStr] = map[string]any{
								"name":  tagStr,
								"canon": Canonize(tagStr),
							}
						}
					}
				}
			}
		}

		// PreparePath
		parts := splitAndFilter(pathstr, "/")
		pathmap[pathstr] = map[string]any{
			"path":  pathstr,
			"def":   pathdefMap,
			"parts": parts,
			"op":    map[string]any{},
		}
	}

	// Phase 2: MeasureRef - count component schema references
	cmpXrefs := selectCmpXrefs(def)
	origcmprefs, _ := countMap["origcmprefs"].(map[string]int)
	cmpMap := foundMap["cmp"].(map[string]any)
	for _, xref := range cmpXrefs {
		xrefVal, _ := xref["val"].(string)
		m := xrefRE.FindStringSubmatch(xrefVal)
		if m != nil {
			name := Canonize(m[2])
			if _, exists := origcmprefs[name]; !exists {
				countMap["cmp"] = toInt(countMap["cmp"]) + 1
				origcmprefs[name] = 0
			}
			origcmprefs[name]++

			if _, exists := cmpMap[name]; !exists {
				cmpMap[name] = map[string]any{"orig": m[2]}
			}
		}
	}

	// Phase 3: selectAllMethods + process each method
	allMethods := selectAllMethods(ctx, data)

	for _, mdesc := range allMethods {
		resolveEntityComponent(data, mdesc)
		resolveEntityName(ctx, data, mdesc)
		renameParams(ctx, data, mdesc)
		findActions(data, mdesc)
		resolveOperation(data, mdesc)
		resolveTransform(data, mdesc)
	}

	// Phase 4: BuildEntity
	entmap := work["entmap"].(map[string]any)
	for _, entval := range entmap {
		buildEntity(data, entval)
	}

	return guide, nil
}

// selectCmpXrefs finds all x-ref values that match components/schemas or definitions.
func selectCmpXrefs(def map[string]any) []map[string]any {
	xrefs := Find(def, "x-ref")
	var out []map[string]any
	for _, xref := range xrefs {
		val, _ := xref["val"].(string)
		if strings.Contains(val, "components/schemas") || strings.Contains(val, "definitions") {
			out = append(out, xref)
		}
	}
	return out
}

// selectAllMethods collects all path+method combinations, sorted by path then method order.
func selectAllMethods(ctx *ApiDefContext, data map[string]any) []map[string]any {
	def := ctx.Def
	paths, _ := def["paths"].(map[string]any)

	var methods []map[string]any

	for pathstr, pathdef := range paths {
		pdef, _ := pathdef.(map[string]any)
		if pdef == nil {
			continue
		}
		for mkey, mval := range pdef {
			method := strings.ToUpper(mkey)
			if _, ok := METHOD_CONSIDER_ORDER[method]; !ok {
				continue
			}
			mdef, _ := mval.(map[string]any)
			if mdef == nil {
				continue
			}

			var tags []any
			if t, ok := mdef["tags"].([]any); ok {
				tags = t
			}

			mdesc := map[string]any{
				"path":        pathstr,
				"method":      method,
				"summary":     mdef["summary"],
				"operationId": mdef["operationId"],
				"tags":        tags,
				"parameters":  mdef["parameters"],
				"responses":   mdef["responses"],
				"requestBody": mdef["requestBody"],
			}
			methods = append(methods, mdesc)
		}
	}

	sort.Slice(methods, func(i, j int) bool {
		pi, _ := methods[i]["path"].(string)
		pj, _ := methods[j]["path"].(string)
		if pi != pj {
			return pi < pj
		}
		mi, _ := methods[i]["method"].(string)
		mj, _ := methods[j]["method"].(string)
		return METHOD_CONSIDER_ORDER[mi] < METHOD_CONSIDER_ORDER[mj]
	})

	return methods
}

// resolveEntityComponent finds potential schema refs and determines entity component.
func resolveEntityComponent(data map[string]any, mdesc map[string]any) {
	guide := data["guide"].(map[string]any)
	metricsMap := guide["metrics"].(map[string]any)
	countMap := metricsMap["count"].(map[string]any)
	foundMap := metricsMap["found"].(map[string]any)
	origcmprefs, _ := countMap["origcmprefs"].(map[string]int)

	work := data["work"].(map[string]any)

	methodName, _ := mdesc["method"].(string)
	pathStr, _ := mdesc["path"].(string)

	pathmapEntry, _ := work["pathmap"].(map[string]any)
	pathEntry, _ := pathmapEntry[pathStr].(map[string]any)
	parts, _ := pathEntry["parts"].([]string)

	var whyCmp []string

	responses, _ := mdesc["responses"].(map[string]any)

	origxrefs := findPotentialSchemaRefs(pathStr, methodName, responses)
	var origxrefMaps []map[string]any
	for _, val := range origxrefs {
		origxrefMaps = append(origxrefMaps, map[string]any{"val": val})
	}

	// Filter to component/schema refs, canonize names
	var cmpxrefs []map[string]any
	for _, xref := range origxrefMaps {
		val, _ := xref["val"].(string)
		if !strings.Contains(val, "schema") && !strings.Contains(val, "definitions") {
			continue
		}
		m := regexp.MustCompile(`/components/schemas/(.+)$`).FindStringSubmatch(val)
		if m == nil {
			m = regexp.MustCompile(`/definitions/(.+)$`).FindStringSubmatch(val)
		}
		if m != nil {
			cmp := Canonize(m[1])
			xref["cmp"] = cmp
			xref["origcmp"] = m[1]
			xref["origcmpref"] = cmp

			// Filter non-ent schemas
			if strings.Contains(val, "Meta") {
				continue
			}
			cmpxrefs = append(cmpxrefs, xref)
		}
	}

	// Clean component names
	for _, xref := range cmpxrefs {
		cmp, _ := xref["cmp"].(string)
		xref["cmp"] = CleanComponentName(cmp)
	}

	// Filter by path occurrence and frequency
	var goodxrefs []map[string]any
	for _, xref := range cmpxrefs {
		cmp, _ := xref["cmp"].(string)
		origcmpref, _ := xref["origcmpref"].(string)

		if len(cmpxrefs) <= 1 ||
			strings.Contains(strings.ToLower(pathStr), "/"+cmp+"/") ||
			entityOccursInPath(parts, cmp) {
			goodxrefs = append(goodxrefs, xref)
			continue
		}

		cmprefs := 0
		if v, ok := origcmprefs[origcmpref]; ok {
			cmprefs = v
		}
		mcount := toInt(countMap["method"])
		pcount := toInt(countMap["path"])
		methodRate := float64(-1)
		if mcount > 0 {
			methodRate = float64(cmprefs) / float64(mcount)
		}
		pathRate := float64(-1)
		if pcount > 0 {
			pathRate = float64(cmprefs) / float64(pcount)
		}

		infrequent := methodRate < IS_ENTCMP_METHOD_RATE || pathRate < IS_ENTCMP_PATH_RATE

		if !infrequent {
			DebugPath(pathStr, methodName, "CMP-INFREQ",
				xref["val"], "method:", methodRate, IS_ENTCMP_METHOD_RATE,
				"path:", pathRate, IS_ENTCMP_PATH_RATE)
		}

		if infrequent {
			goodxrefs = append(goodxrefs, xref)
		}
	}

	var out map[string]any

	if len(goodxrefs) > 0 {
		fcmp := goodxrefs[0]
		out = makeMethodEntityDesc(map[string]any{
			"ref":        fcmp["val"],
			"cmp":        fcmp["cmp"],
			"origcmp":    fcmp["origcmp"],
			"origcmpref": fcmp["origcmpref"],
			"entname":    fcmp["cmp"],
		})
	}

	// Check tags against components
	var tags []any
	if t, ok := mdesc["tags"].([]any); ok {
		tags = t
	}

	tagFoundMap := foundMap["tag"].(map[string]any)
	cmpFoundMap := foundMap["cmp"].(map[string]any)

	var goodtags []any
	for _, tag := range tags {
		tagStr, ok := tag.(string)
		if !ok {
			continue
		}
		tagdesc, _ := tagFoundMap[tagStr].(map[string]any)
		if tagdesc == nil {
			continue
		}
		ctag, _ := tagdesc["canon"].(string)
		_, cmpExists := cmpFoundMap[ctag]
		if cmpExists || out == nil {
			goodtags = append(goodtags, tag)
		}
	}

	DebugPath(pathStr, methodName, "TAGS", tags, goodtags, out, mdesc)

	if len(goodtags) > 0 {
		ftag, _ := goodtags[0].(string)
		tagdesc, _ := tagFoundMap[ftag].(map[string]any)
		if tagdesc != nil {
			tagcanon, _ := tagdesc["canon"].(string)
			_, tagcmpExists := cmpFoundMap[tagcanon]

			if tagcmpExists || out == nil {
				if out == nil {
					out = makeMethodEntityDesc(map[string]any{
						"ref":     "tag",
						"cmp":     tagcanon,
						"origcmp": ftag,
						"why_cmp": whyCmp,
						"entname": tagcanon,
					})
					whyCmp = append(whyCmp, "tag="+safeStr(out["cmp"]))
				} else if (strings.Contains(pathStr, "/"+ftag+"/") ||
					strings.Contains(pathStr, "/"+tagcanon+"/")) &&
					safeStr(out["cmp"]) != tagcanon {
					out = makeMethodEntityDesc(map[string]any{
						"ref":     "tag",
						"cmp":     tagcanon,
						"origcmp": ftag,
						"why_cmp": whyCmp,
						"entname": tagcanon,
					})
					whyCmp = append(whyCmp, "tag/path="+safeStr(out["cmp"]))
				}
			}
		}
	}

	if out != nil {
		whyCmp = append(whyCmp, "cmp/resolve="+safeStr(out["cmp"]))
		out["why_cmp"] = whyCmp

		origcmpref := safeStr(out["origcmpref"])
		cmpoccur := 0
		if v, ok := origcmprefs[origcmpref]; ok {
			cmpoccur = v
		}
		out["cmpoccur"] = cmpoccur

		pcount := toInt(countMap["path"])
		mcount := toInt(countMap["method"])
		if pcount == 0 {
			out["path_rate"] = float64(-1)
		} else {
			out["path_rate"] = float64(cmpoccur) / float64(pcount)
		}
		if mcount == 0 {
			out["method_rate"] = float64(-1)
		} else {
			out["method_rate"] = float64(cmpoccur) / float64(mcount)
		}

		mdesc["MethodEntity"] = out
	}

	DebugPath(pathStr, methodName, "CMP-NAME", out, origxrefMaps, cmpxrefs, goodxrefs, goodtags)
}

// resolveEntityName uses path matchers to determine entity names.
func resolveEntityName(ctx *ApiDefContext, data map[string]any, mdesc map[string]any) {
	work := data["work"].(map[string]any)

	methodName, _ := mdesc["method"].(string)
	pathStr, _ := mdesc["path"].(string)

	pathmapEntry := work["pathmap"].(map[string]any)
	pathDesc, _ := pathmapEntry[pathStr].(map[string]any)
	parts, _ := pathDesc["parts"].([]string)

	entityWork := work["entity"].(map[string]any)
	entityCount := entityWork["count"].(map[string]any)
	entityCount["seen"] = toInt(entityCount["seen"]) + 1

	var ment map[string]any
	if me, ok := mdesc["MethodEntity"].(map[string]any); ok {
		ment = me
	}

	whyPath := []string{}

	if ment == nil {
		whyPath = append(whyPath, "no-desc")
		ment = makeMethodEntityDesc(map[string]any{})
		mdesc["MethodEntity"] = ment
	}

	if wc, ok := ment["why_cmp"].([]string); ok {
		whyPath = append(whyPath, wc...)
	}

	var entname string
	var pm *PathMatchResult

	if pm = PathMatch(parts, "t/p/t/"); pm != nil {
		entname = entityPathMatch_tpte(data, pm, mdesc, &whyPath)
	} else if pm = PathMatch(parts, "t/p/"); pm != nil {
		entname = entityPathMatch_tpe(data, pm, mdesc, &whyPath)
	} else if pm = PathMatch(parts, "p/t/"); pm != nil {
		entname = entityPathMatch_pte(data, pm, mdesc, &whyPath)
	} else if pm = PathMatch(parts, "t/"); pm != nil {
		entname = entityPathMatch_te(data, pm, mdesc, &whyPath)
	} else if pm = PathMatch(parts, "t/p/p"); pm != nil {
		entname = entityPathMatch_tpp(data, pm, mdesc, &whyPath)
	} else {
		entname = inferEntityName(mdesc, parts, &whyPath)
		if entname == "" {
			entityCount["unresolved"] = toInt(entityCount["unresolved"]) + 1
			entname = fmt.Sprintf("entity%d", toInt(entityCount["unresolved"]))
		}
	}

	entmap := work["entmap"].(map[string]any)
	entname = EnsureMinEntityName(entname, entmap)

	// Get or create entity descriptor
	entdesc, _ := entmap[entname].(map[string]any)
	if entdesc == nil {
		entdesc = map[string]any{
			"name":    entname,
			"op":      map[string]any{},
			"why_path": whyPath,
		}
		// Copy ment fields into entdesc
		if cmp, ok := ment["cmp"]; ok {
			entdesc["cmp"] = cmp
		}
		if origcmp, ok := ment["origcmp"]; ok {
			entdesc["origcmp"] = origcmp
			entdesc["origname"] = origcmp
		}
		if origcmpref, ok := ment["origcmpref"]; ok {
			entdesc["origcmpref"] = origcmpref
		}
		entmap[entname] = entdesc
	}

	// Ensure path sub-map
	if entdesc["path"] == nil {
		entdesc["path"] = map[string]any{}
	}
	entPaths := entdesc["path"].(map[string]any)

	if entPaths[pathStr] == nil {
		entPaths[pathStr] = map[string]any{
			"rename":     map[string]any{"param": map[string]any{}},
			"why_rename": map[string]any{"why_param": map[string]any{}},
			"pm":         pm,
		}
	}
	pathEntry := entPaths[pathStr].(map[string]any)
	if pathEntry["op"] == nil {
		pathEntry["op"] = map[string]any{}
	}
	pathEntry["why_path"] = whyPath

	ment["entname"] = entname
	ment["pm"] = pm

	DebugPath(pathStr, methodName, "RESOLVE-ENTITY-NAME", entname)
}

// renameParams renames path parameters to follow ID conventions.
func renameParams(ctx *ApiDefContext, data map[string]any, mdesc map[string]any) {
	guide := data["guide"].(map[string]any)
	metricsMap := guide["metrics"].(map[string]any)
	countMap := metricsMap["count"].(map[string]any)
	_ = countMap

	ment, _ := mdesc["MethodEntity"].(map[string]any)
	if ment == nil {
		return
	}

	pathStr, _ := mdesc["path"].(string)
	work := data["work"].(map[string]any)

	entname := safeStr(ment["entname"])
	entmap := work["entmap"].(map[string]any)
	entdesc, _ := entmap[entname].(map[string]any)
	if entdesc == nil {
		return
	}

	pathmapEntry := work["pathmap"].(map[string]any)
	pathdescEntry, _ := pathmapEntry[pathStr].(map[string]any)
	if pathdescEntry == nil {
		return
	}

	methodName, _ := mdesc["method"].(string)

	// id needs to be t/p/
	multParamEndMatch := PathMatch(pathStr, "p/p/")
	if multParamEndMatch != nil {
		return
	}

	entPaths, _ := entdesc["path"].(map[string]any)
	pathDescEntry, _ := entPaths[pathStr].(map[string]any)
	if pathDescEntry == nil {
		return
	}

	// Ensure rename structure
	if pathDescEntry["rename"] == nil {
		pathDescEntry["rename"] = map[string]any{"param": map[string]any{}}
	}
	renameMap, _ := pathDescEntry["rename"].(map[string]any)
	if renameMap["param"] == nil {
		renameMap["param"] = map[string]any{}
	}

	if pathDescEntry["why_rename"] == nil {
		pathDescEntry["why_rename"] = map[string]any{"why_param": map[string]any{}}
	}
	whyRenameMap, _ := pathDescEntry["why_rename"].(map[string]any)
	if whyRenameMap["why_param"] == nil {
		whyRenameMap["why_param"] = map[string]any{}
	}

	if pathDescEntry["action"] == nil {
		pathDescEntry["action"] = map[string]any{}
	}
	if pathDescEntry["why_action"] == nil {
		pathDescEntry["why_action"] = map[string]any{}
	}

	paramRename := renameMap["param"].(map[string]any)
	whyParam := whyRenameMap["why_param"].(map[string]any)

	parts, _ := pathdescEntry["parts"].([]string)

	cmpname := safeStr(ment["cmp"])

	origcmprefs, _ := countMap["origcmprefs"].(map[string]int)
	uniqschema := len(origcmprefs)
	considerCmp := cmpname != "" && uniqschema > 0 &&
		safeFloat(ment["method_rate"]) < IS_ENTCMP_METHOD_RATE

	var origParams []string

	entdescName := safeStr(entdesc["name"])

	for partI := 0; partI < len(parts); partI++ {
		partStr := parts[partI]

		if !isParam(partStr) {
			continue
		}

		origParams = append(origParams, strings.Trim(partStr, "{}" + "*"))

		oldParam := partStr[1 : len(partStr)-1]

		if whyParam[oldParam] == nil {
			whyParam[oldParam] = []string{}
		}

		lastPart := partI == len(parts)-1
		secondLastPart := partI == len(parts)-2
		notLastPart := partI < len(parts)-1
		hasParent := partI > 0 && !isParam(parts[partI-1])
		parentName := ""
		if hasParent {
			parentName = Canonize(parts[partI-1])
		}
		notExactId := oldParam != "id"
		probablyAnId := strings.HasSuffix(oldParam, "id") ||
			strings.HasSuffix(oldParam, "Id") ||
			Canonize(oldParam) == parentName

		DebugPath(pathStr, methodName, "RENAME-PARAM-PART", parts, partI, partStr)

		// Id-like not at end, and after a possible entname.
		if probablyAnId && hasParent && notLastPart {

			// Actually an action
			if secondLastPart &&
				((parentName != entdescName && strings.HasPrefix(entdescName, parentName+"_")) ||
					parentName == cmpname) {
				updateParamRename(ctx, data, pathStr, methodName,
					paramRename, whyParam, oldParam,
					"id", "action-parent:"+entdescName)

				if partI+1 < len(parts) {
					updateAction(methodName, oldParam,
						parts[partI+1], entdesc, pathDescEntry, "action-not-parent")
				}
			} else if hasParent && parentName == cmpname {
				updateParamRename(ctx, data, pathStr, methodName,
					paramRename, whyParam, oldParam,
					"id", "id-parent-cmp")
			} else if hasParent && parentName == entdescName {
				updateParamRename(ctx, data, pathStr, methodName,
					paramRename, whyParam, oldParam,
					"id", "id-parent-ent")
			} else {
				updateParamRename(ctx, data, pathStr, methodName,
					paramRename, whyParam, oldParam,
					parentName+"_id", "parent:"+parentName)
			}
		} else if lastPart && notExactId &&
			(!hasParent ||
				parentName == entdescName ||
				strings.HasSuffix(entdescName, "_"+parentName)) &&
			(!considerCmp || cmpname == entdescName) {
			// At end, but not called id
			updateParamRename(ctx, data, pathStr, methodName,
				paramRename, whyParam, oldParam,
				"id", fmt.Sprintf("end-id;%s;parent=%v/%s;cmp=%v%s",
					methodName, hasParent, parentName,
					considerCmp, func() string {
						if cmpname == "" {
							return ""
						}
						return "/" + cmpname
					}()))
		} else if notLastPart && partI > 1 && hasParent {
			// Not at end, has preceding non-param part

			if secondLastPart {
				if oldParam != "id" && Canonize(partStr) == entdescName {
					updateParamRename(ctx, data, pathStr, methodName,
						paramRename, whyParam, oldParam,
						"id", "end-action")

					if partI+1 < len(parts) {
						updateAction(methodName, oldParam,
							parts[partI+1], entdesc, pathDescEntry, "end-action")
					}
				}
			} else if hasParent && parentName == cmpname {
				// Primary ent id not at end
				updateParamRename(ctx, data, pathStr, methodName,
					paramRename, whyParam, oldParam,
					"id", "id-not-last")
			} else {
				// Not primary ent
				newParamName := parentName + "_id"
				if newParamName != oldParam {
					updateParamRename(ctx, data, pathStr, methodName,
						paramRename, whyParam, oldParam,
						newParamName, "not-primary")
				}
			}
		}

		// Remove duplicate renames (rename to same name)
		if renamed, ok := paramRename[oldParam].(string); ok && renamed == oldParam {
			delete(paramRename, oldParam)
			delete(whyParam, oldParam)
		}

		DebugPath(pathStr, methodName, "RENAME-PARAM", pathStr, methodName, partStr,
			oldParam, lastPart, secondLastPart, notLastPart, hasParent, parentName,
			notExactId, probablyAnId, considerCmp, cmpname)
	}

	ment["rename"] = paramRename
	ment["why_rename"] = whyParam
	ment["rename_orig"] = origParams
}

// findActions detects action endpoints.
func findActions(data map[string]any, mdesc map[string]any) {
	ment, _ := mdesc["MethodEntity"].(map[string]any)
	if ment == nil {
		return
	}

	pathStr, _ := mdesc["path"].(string)
	work := data["work"].(map[string]any)

	entname := safeStr(ment["entname"])
	entmap := work["entmap"].(map[string]any)
	entdesc, _ := entmap[entname].(map[string]any)
	if entdesc == nil {
		return
	}

	entPaths, _ := entdesc["path"].(map[string]any)
	pathdesc, _ := entPaths[pathStr].(map[string]any)
	if pathdesc == nil {
		return
	}

	methodName, _ := mdesc["method"].(string)

	if pathdesc["action"] == nil {
		pathdesc["action"] = map[string]any{}
	}
	if pathdesc["why_action"] == nil {
		pathdesc["why_action"] = map[string]any{}
	}

	pathmapEntry := work["pathmap"].(map[string]any)
	pathEntry, _ := pathmapEntry[pathStr].(map[string]any)
	parts, _ := pathEntry["parts"].([]string)

	plen := len(parts)

	fourthLastPart := ""
	fourthLastPartCanon := ""
	thirdLastPart := ""
	thirdLastPartCanon := ""
	secondLastPart := ""
	secondLastPartCanon := ""
	lastPart := ""
	lastPartCanon := ""

	if plen >= 4 {
		fourthLastPart = parts[plen-4]
		fourthLastPartCanon = Canonize(fourthLastPart)
	}
	if plen >= 3 {
		thirdLastPart = parts[plen-3]
		thirdLastPartCanon = Canonize(thirdLastPart)
	}
	if plen >= 2 {
		secondLastPart = parts[plen-2]
		secondLastPartCanon = Canonize(secondLastPart)
	}
	if plen >= 1 {
		lastPart = parts[plen-1]
		lastPartCanon = Canonize(lastPart)
	}

	cmp := safeStr(ment["cmp"])
	origcmp := safeStr(ment["origcmp"])

	// /api/foo/bar where foo is the entity and bar is the action, no id param
	if secondLastPartCanon == cmp ||
		secondLastPartCanon == origcmp ||
		secondLastPartCanon == entname {
		if !isParam(lastPart) {
			updateAction(methodName, lastPart, lastPartCanon, entdesc, pathdesc, "no-param")
		}
	} else if thirdLastPartCanon == cmp ||
		thirdLastPartCanon == origcmp ||
		thirdLastPartCanon == entname {
		// /api/foo/{param}/action
		if isParam(secondLastPart) && !isParam(lastPart) {
			updateAction(methodName, lastPart, lastPartCanon, entdesc, pathdesc,
				"ent-param-2nd-last")
		}
	} else if fourthLastPartCanon == cmp ||
		fourthLastPartCanon == origcmp ||
		fourthLastPartCanon == entname {
		// /api/foo/{param}/action/subaction
		if isParam(thirdLastPart) && !isParam(secondLastPart) && !isParam(lastPart) {
			oldActionName := secondLastPart + "/" + lastPart
			actionName := secondLastPartCanon + "_" + lastPartCanon
			updateAction(methodName, oldActionName, actionName, entdesc, pathdesc,
				"ent-param-3rd-last")
		}
	}

	DebugPath(pathStr, methodName, "FIND-ACTIONS", cmp, parts, pathdesc["action"], pathdesc["why_action"])
}

// resolveOperation determines operation type from HTTP method.
func resolveOperation(data map[string]any, mdesc map[string]any) {
	ment, _ := mdesc["MethodEntity"].(map[string]any)
	if ment == nil {
		return
	}

	pathStr, _ := mdesc["path"].(string)
	work := data["work"].(map[string]any)

	pathmapEntry := work["pathmap"].(map[string]any)
	_ = pathmapEntry

	entname := safeStr(ment["entname"])
	entmap := work["entmap"].(map[string]any)
	entdesc, _ := entmap[entname].(map[string]any)
	if entdesc == nil {
		return
	}

	methodName, _ := mdesc["method"].(string)

	whyOp := []string{}
	ment["why_op"] = whyOp

	opname, ok := METHOD_IDOP[methodName]
	if !ok {
		whyOp = append(whyOp, "no-op:"+methodName)
		ment["why_op"] = whyOp
		return
	}
	standardOpname := opname

	if standardOpname == "load" {
		islist := isListResponse(mdesc, pathStr, &whyOp)
		if islist {
			opname = "list"
		}
	} else {
		whyOp = append(whyOp, "not-load")
	}

	ment["opname"] = opname
	ment["why_opname"] = whyOp
	ment["why_op"] = whyOp

	entPaths, _ := entdesc["path"].(map[string]any)
	pathEntry, _ := entPaths[pathStr].(map[string]any)
	if pathEntry == nil {
		return
	}
	op, _ := pathEntry["op"].(map[string]any)
	if op == nil {
		op = map[string]any{}
		pathEntry["op"] = op
	}

	opdef := map[string]any{
		"method": methodName,
		"why_op": strings.Join(whyOp, ";"),
	}

	if _, exists := op[opname]; !exists {
		op[opname] = opdef
	} else {
		// Conflicting methods for same operation - METHOD_CONSIDER_ORDER wins
		op[strings.ToLower(methodName)] = opdef
	}

	DebugPath(pathStr, methodName, "ResolveOperation", standardOpname, opname, whyOp, op)
}

// resolveTransform analyzes req/res schemas for transforms.
func resolveTransform(data map[string]any, mdesc map[string]any) {
	ment, _ := mdesc["MethodEntity"].(map[string]any)
	if ment == nil {
		return
	}

	pathStr, _ := mdesc["path"].(string)
	work := data["work"].(map[string]any)

	entname := safeStr(ment["entname"])
	entmap := work["entmap"].(map[string]any)
	entdesc, _ := entmap[entname].(map[string]any)
	if entdesc == nil {
		return
	}

	entPaths, _ := entdesc["path"].(map[string]any)
	pathdesc, _ := entPaths[pathStr].(map[string]any)
	if pathdesc == nil {
		return
	}

	methodName, _ := mdesc["method"].(string)
	opname := safeStr(ment["opname"])
	op, _ := pathdesc["op"].(map[string]any)

	transform := map[string]any{
		"req": nil,
		"res": nil,
	}

	// Check response schema
	responses, _ := mdesc["responses"].(map[string]any)
	var resokdef map[string]any
	if r200, ok := responses["200"].(map[string]any); ok {
		resokdef = r200
	} else if r201, ok := responses["201"].(map[string]any); ok {
		resokdef = r201
	}

	resprops := getResponseSchemaProps(resokdef)
	DebugPath(pathStr, methodName, "TRANSFORM-RES", resprops)

	origname := safeStr(entdesc["origname"])
	ename := safeStr(entdesc["name"])

	if resprops != nil {
		if _, ok := resprops[origname]; ok && origname != "" {
			transform["res"] = "`body." + origname + "`"
		} else if _, ok := resprops[ename]; ok && ename != "" {
			transform["res"] = "`body." + ename + "`"
		}
	}

	// Check request body schema
	reqBody, _ := mdesc["requestBody"].(map[string]any)
	reqprops := getRequestBodySchemaProps(reqBody)
	DebugPath(pathStr, methodName, "TRANSFORM-REQ", reqprops)

	if reqprops != nil {
		if _, ok := reqprops[origname]; ok && origname != "" {
			transform["req"] = map[string]any{origname: "`reqdata`"}
		} else if _, ok := reqprops[ename]; ok && ename != "" {
			transform["req"] = map[string]any{ename: "`reqdata`"}
		}
	}

	hasTransform := transform["req"] != nil || transform["res"] != nil
	if hasTransform && op != nil && op[opname] != nil {
		opEntry, _ := op[opname].(map[string]any)
		if opEntry != nil {
			opEntry["transform"] = transform
		}
	}
}

// buildEntity constructs final guide entity entries.
func buildEntity(data map[string]any, entval any) {
	entdesc, _ := entval.(map[string]any)
	if entdesc == nil {
		return
	}

	guide := data["guide"].(map[string]any)
	metricsMap := guide["metrics"].(map[string]any)
	countMap := metricsMap["count"].(map[string]any)
	countMap["entity"] = toInt(countMap["entity"]) + 1

	entityMap := guide["entity"].(map[string]any)

	path := map[string]any{}

	entPaths, _ := entdesc["path"].(map[string]any)
	for pathstr, pd := range entPaths {
		pathdesc, _ := pd.(map[string]any)
		if pathdesc == nil {
			continue
		}

		renameParam := map[string]any{}
		if renameMap, ok := pathdesc["rename"].(map[string]any); ok {
			if paramMap, ok := renameMap["param"].(map[string]any); ok {
				whyRenameMap, _ := pathdesc["why_rename"].(map[string]any)
				whyParamMap, _ := whyRenameMap["why_param"].(map[string]any)

				for key, val := range paramMap {
					valStr, _ := val.(string)
					var whyRename []string
					if wp, ok := whyParamMap[key].([]string); ok {
						whyRename = wp
					}
					renameParam[key] = map[string]any{
						"target":     valStr,
						"why_rename": whyRename,
					}
				}
			}
		}

		guidepath := map[string]any{
			"why_path": pathdesc["why_path"],
			"action":   pathdesc["action"],
			"rename": map[string]any{
				"param": renameParam,
			},
			"op": pathdesc["op"],
		}
		path[pathstr] = guidepath
	}

	entname := safeStr(entdesc["name"])
	origcmp := safeStr(entdesc["origcmp"])

	entityMap[entname] = map[string]any{
		"name": entname,
		"orig": origcmp,
		"path": path,
	}
}

// entityPathMatch_tpte handles the t/p/t/ path pattern.
func entityPathMatch_tpte(data map[string]any, pm *PathMatchResult, mdesc map[string]any, why *[]string) string {
	ment, _ := mdesc["MethodEntity"].(map[string]any)
	if ment == nil {
		ment = makeMethodEntityDesc(map[string]any{})
	}

	pathNameIndex := 2

	*why = append(*why, "path=t/p/t/")
	origPathName := ""
	if pathNameIndex < len(pm.Matches) {
		origPathName = pm.Matches[pathNameIndex]
	}
	entname := Canonize(origPathName)

	if safeStr(ment["cmp"]) != "" {
		ecm := entityCmpMatch(data, entname, mdesc, why)
		entname = safeStr(ecm["name"])
		*why = append(*why, "has-cmp="+safeStr(ecm["orig"]))
	} else if probableEntityMethod(data, mdesc, ment, pm, why) {
		ecm := entityCmpMatch(data, entname, mdesc, why)
		if safeBool(ecm["cmpish"]) {
			entname = safeStr(ecm["name"])
			*why = append(*why, "prob-ent="+safeStr(ecm["orig"]))
		} else if endsWithCmp(data, pm) {
			entname = Canonize(getMatchElem(pm, -1))
			*why = append(*why, "prob-ent-last="+safeStr(ecm["orig"]))
		} else if findPathsWithPrefixFromData(data, pm.Path, true) > 0 {
			entname = Canonize(getMatchElem(pm, -1))
			*why = append(*why, "prob-ent-prefix="+safeStr(ecm["orig"]))
		} else {
			entname = Canonize(getMatchElem(pm, -3)) + "_" + entname
			*why = append(*why, "prob-ent-part")
		}
	} else {
		// Probably an entity action suffix
		*why = append(*why, "prob-ent-act")
		entname = Canonize(getMatchElem(pm, -3))
	}

	return entname
}

// entityPathMatch_tpe handles the t/p/ path pattern.
func entityPathMatch_tpe(data map[string]any, pm *PathMatchResult, mdesc map[string]any, why *[]string) string {
	ment, _ := mdesc["MethodEntity"].(map[string]any)
	if ment == nil {
		ment = makeMethodEntityDesc(map[string]any{})
	}

	pathNameIndex := 0

	*why = append(*why, "path=t/p/")
	origPathName := ""
	if pathNameIndex < len(pm.Matches) {
		origPathName = pm.Matches[pathNameIndex]
	}
	entname := Canonize(origPathName)

	if safeStr(ment["cmp"]) != "" || probableEntityMethod(data, mdesc, ment, pm, why) {
		ecm := entityCmpMatch(data, entname, mdesc, why)
		entname = safeStr(ecm["name"])
	} else {
		*why = append(*why, "ent-act")
	}

	return entname
}

// entityPathMatch_pte handles the p/t/ path pattern.
func entityPathMatch_pte(data map[string]any, pm *PathMatchResult, mdesc map[string]any, why *[]string) string {
	ment, _ := mdesc["MethodEntity"].(map[string]any)
	if ment == nil {
		ment = makeMethodEntityDesc(map[string]any{})
	}

	pathNameIndex := 1

	*why = append(*why, "path=p/t/")
	origPathName := ""
	if pathNameIndex < len(pm.Matches) {
		origPathName = pm.Matches[pathNameIndex]
	}
	entname := Canonize(origPathName)

	if safeStr(ment["cmp"]) != "" || probableEntityMethod(data, mdesc, ment, pm, why) {
		ecm := entityCmpMatch(data, entname, mdesc, why)
		entname = safeStr(ecm["name"])
	} else {
		*why = append(*why, "ent-act")
	}

	return entname
}

// entityPathMatch_te handles the t/ path pattern.
func entityPathMatch_te(data map[string]any, pm *PathMatchResult, mdesc map[string]any, why *[]string) string {
	ment, _ := mdesc["MethodEntity"].(map[string]any)
	if ment == nil {
		ment = makeMethodEntityDesc(map[string]any{})
	}

	pathNameIndex := 0

	*why = append(*why, "path=t/")
	origPathName := ""
	if pathNameIndex < len(pm.Matches) {
		origPathName = pm.Matches[pathNameIndex]
	}
	entname := Canonize(origPathName)

	if safeStr(ment["cmp"]) != "" || probableEntityMethod(data, mdesc, ment, pm, why) {
		ecm := entityCmpMatch(data, entname, mdesc, why)
		entname = safeStr(ecm["name"])
	} else {
		*why = append(*why, "ent-act")
	}

	return entname
}

// entityPathMatch_tpp handles the t/p/p path pattern.
func entityPathMatch_tpp(data map[string]any, pm *PathMatchResult, mdesc map[string]any, why *[]string) string {
	ment, _ := mdesc["MethodEntity"].(map[string]any)
	if ment == nil {
		ment = makeMethodEntityDesc(map[string]any{})
	}

	pathNameIndex := 0

	*why = append(*why, "path=t/p/p")
	origPathName := ""
	if pathNameIndex < len(pm.Matches) {
		origPathName = pm.Matches[pathNameIndex]
	}
	entname := Canonize(origPathName)

	if safeStr(ment["cmp"]) != "" || probableEntityMethod(data, mdesc, ment, pm, why) {
		ecm := entityCmpMatch(data, entname, mdesc, why)
		entname = safeStr(ecm["name"])
	} else {
		*why = append(*why, "ent-act")
	}

	return entname
}

// entityOccursInPath checks if entity name appears in path parts.
func entityOccursInPath(parts []string, entname string) bool {
	for _, p := range parts {
		if len(p) == 0 || p[0] == '{' {
			continue
		}
		if Canonize(strings.ToLower(p)) == entname {
			return true
		}
	}
	return false
}

// entityCmpMatch compares path-derived name vs component-derived name.
func entityCmpMatch(data map[string]any, entname string, mdesc map[string]any, why *[]string) map[string]any {
	ment, _ := mdesc["MethodEntity"].(map[string]any)
	if ment == nil {
		ment = map[string]any{}
	}

	out := map[string]any{
		"name":    entname,
		"orig":    safeStrDefault(ment["origcmp"], entname),
		"cmpish":  false,
		"pathish": true,
	}

	mentMethodRate := safeFloat(ment["method_rate"])
	mentPathRate := safeFloat(ment["path_rate"])

	cmpInfrequent := mentMethodRate < IS_ENTCMP_METHOD_RATE ||
		mentPathRate < IS_ENTCMP_PATH_RATE

	mentCmp := safeStr(ment["cmp"])
	mentOrigCmp := safeStr(ment["origcmp"])

	if mentCmp != "" &&
		entname != mentCmp &&
		!strings.HasPrefix(mentCmp, entname) {

		if cmpInfrequent {
			*why = append(*why, "cmp-primary")
			out["name"] = mentCmp
			out["orig"] = mentOrigCmp
			out["cmpish"] = true
			out["pathish"] = false
			*why = append(*why, "cmp-infreq")
		} else if cmpOccursInPath(data, mentCmp) {
			*why = append(*why, "cmp-path")
			out["name"] = mentCmp
			out["orig"] = mentOrigCmp
			out["cmpish"] = true
			out["pathish"] = false
			*why = append(*why, "cmp-inpath")
		} else {
			*why = append(*why, "path-over-cmp")
		}
	} else if mdesc["method"] == "DELETE" && mentCmp == "" {
		pathStr, _ := mdesc["path"].(string)
		cmps := findcmps(data, pathStr, []string{"responses"}, true)

		if len(cmps) == 1 {
			out["name"] = cmps[0]["cmp"]
			out["orig"] = cmps[0]["origcmp"]
			out["cmpish"] = true
			out["pathish"] = false
			*why = append(*why, "cmp-found-delete")
		} else {
			*why = append(*why, "path-primary-delete")
		}
	} else {
		*why = append(*why, "path-primary")
	}

	pathStr, _ := mdesc["path"].(string)
	methodName, _ := mdesc["method"].(string)
	DebugPath(pathStr, methodName, "ENTITY-CMP-NAME",
		pathStr, methodName, entname+"->", out, *why, ment)

	return out
}

// probableEntityMethod determines if a method is probably an entity method.
func probableEntityMethod(data map[string]any, mdesc map[string]any, ment map[string]any, pm *PathMatchResult, why *[]string) bool {
	requestBody, _ := mdesc["requestBody"].(map[string]any)
	reqSchema := getRequestBodySchema(requestBody)

	responses, _ := mdesc["responses"].(map[string]any)
	var resSchema map[string]any
	if r201, ok := responses["201"].(map[string]any); ok {
		resSchema = getResponseSchema(r201)
	} else if r200, ok := responses["200"].(map[string]any); ok {
		resSchema = getResponseSchema(r200)
	}
	noResponse := resSchema == nil && responses["204"] != nil

	probWhy := ""
	probent := false

	method, _ := mdesc["method"].(string)

	if noResponse {
		probWhy = "nores"
		probent = true
	} else if reqSchema != nil {
		if method == "POST" && !strings.HasSuffix(pm.Expr, "/p/") {
			// A real entity would probably occur in at least one other t/p path
			def := data["def"].(map[string]any)
			defPaths, _ := def["paths"].(map[string]any)
			lastMatch := ""
			if len(pm.Matches) > 0 {
				lastMatch = pm.Matches[len(pm.Matches)-1]
			}
			matchCount := 0
			for p := range defPaths {
				if strings.Contains(p, "/"+lastMatch+"/") {
					matchCount++
				}
			}
			if matchCount > 1 {
				probWhy = "post"
				probent = true
			}
		} else if (method == "PUT" || method == "PATCH") &&
			strings.HasSuffix(pm.Expr, "/p/") {
			probWhy = "putish"
			probent = true
		}
	} else if method == "GET" {
		probWhy = "get"
		probent = true
	}

	var rescodes []string
	for k := range responses {
		rescodes = append(rescodes, k)
	}
	sort.Strings(rescodes)

	rescodesStr := strings.Join(rescodes, ",")

	DebugPath(safeStr(mdesc["path"]), method, "PROBABLE-ENTITY-RESPONSE",
		rescodes, probent, probWhy)

	whyEntry := "entres=" + fmt.Sprintf("%v", probent) + "/" + rescodesStr
	if probWhy != "" {
		whyEntry += "/" + probWhy
	}
	*why = append(*why, whyEntry)

	return probent
}

// cmpOccursInPath checks if a component name appears in any path part.
func cmpOccursInPath(data map[string]any, cmpname string) bool {
	work, _ := data["work"].(map[string]any)
	if work == nil {
		return false
	}

	// Build cache on first call
	potentialCmps, _ := work["potentialCmpsFromPaths"].(map[string]bool)
	if potentialCmps == nil {
		potentialCmps = map[string]bool{}
		def := data["def"].(map[string]any)
		defPaths, _ := def["paths"].(map[string]any)
		pathmap, _ := work["pathmap"].(map[string]any)

		for pathstr := range defPaths {
			entry, _ := pathmap[pathstr].(map[string]any)
			if entry == nil {
				continue
			}
			parts, _ := entry["parts"].([]string)
			for _, p := range parts {
				if len(p) > 0 && p[0] != '{' {
					potentialCmps[Canonize(p)] = true
				}
			}
		}
		work["potentialCmpsFromPaths"] = potentialCmps
	}

	return potentialCmps[cmpname]
}

// inferEntityName tries to infer entity name from operationId, response title, or path.
func inferEntityName(mdesc map[string]any, parts []string, why *[]string) string {
	// Try operationId
	if opId, ok := mdesc["operationId"].(string); ok && opId != "" {
		opid := Canonize(opId)
		if len(opid) >= 3 {
			*why = append(*why, "infer-opid")
			return opid
		}
	}

	// Try response schema title
	responses, _ := mdesc["responses"].(map[string]any)
	if responses != nil {
		var response map[string]any
		if r200, ok := responses["200"].(map[string]any); ok {
			response = r200
		} else if r201, ok := responses["201"].(map[string]any); ok {
			response = r201
		}
		if response != nil {
			resSchema := getResponseSchema(response)
			if resSchema != nil {
				if title, ok := resSchema["title"].(string); ok {
					titleCanon := Canonize(title)
					if len(titleCanon) >= 3 {
						*why = append(*why, "infer-res-title")
						return titleCanon
					}
				}
			}
		}
	}

	// Try last non-param path segment
	for i := len(parts) - 1; i >= 0; i-- {
		if !isParam(parts[i]) {
			seg := Canonize(parts[i])
			if len(seg) >= 3 {
				*why = append(*why, "infer-path-seg")
				return seg
			}
		}
	}

	return ""
}

// isListResponse checks if a GET response is a list.
func isListResponse(mdesc map[string]any, pathStr string, why *[]string) bool {
	ment, _ := mdesc["MethodEntity"].(map[string]any)
	pm := getPM(ment)

	islist := false

	if pm != nil && strings.HasSuffix(pm.Expr, "p/") {
		*why = append(*why, "end-param")
		return false
	}

	// Try to get schema from responses
	responses, _ := mdesc["responses"].(map[string]any)
	var schema map[string]any

	if responses != nil {
		// Try 200 then 201
		for _, code := range []string{"200", "201"} {
			resdef, ok := responses[code].(map[string]any)
			if !ok {
				continue
			}
			schema = getResponseSchema(resdef)
			if schema != nil {
				break
			}
		}
	}

	if schema == nil {
		*why = append(*why, "no-schema")
	} else {
		schemaType, _ := schema["type"].(string)
		if schemaType == "array" {
			*why = append(*why, "array")
			islist = true
		}

		if !islist {
			properties := resolveSchemaProperties(schema)
			for propName, propVal := range properties {
				propMap, ok := propVal.(map[string]any)
				if !ok {
					continue
				}
				propType, _ := propMap["type"].(string)
				if propType == "array" {
					*why = append(*why, "array-prop:"+propName)
					islist = true
					break
				}
			}
		}

		if !islist {
			*why = append(*why, "not-list")
		}
	}

	methodName, _ := mdesc["method"].(string)
	DebugPath(pathStr, methodName, "IS-LIST", islist, *why, schema)

	return islist
}

// resolveSchemaProperties merges allOf properties with direct properties.
func resolveSchemaProperties(schema map[string]any) map[string]any {
	properties := map[string]any{}

	if allOf, ok := schema["allOf"].([]any); ok {
		for i := len(allOf) - 1; i >= 0; i-- {
			item, _ := allOf[i].(map[string]any)
			if item == nil {
				continue
			}
			props, _ := item["properties"].(map[string]any)
			if props == nil {
				continue
			}
			for k, v := range props {
				properties[k] = v
			}
		}
	}

	if props, ok := schema["properties"].(map[string]any); ok {
		for k, v := range props {
			properties[k] = v
		}
	}

	return properties
}

// getRequestBodySchema extracts schema from request body.
func getRequestBodySchema(requestBody map[string]any) map[string]any {
	if requestBody == nil {
		return nil
	}
	if content, ok := requestBody["content"].(map[string]any); ok {
		if appJSON, ok := content["application/json"].(map[string]any); ok {
			if schema, ok := appJSON["schema"].(map[string]any); ok {
				return schema
			}
		}
	}
	if schema, ok := requestBody["schema"].(map[string]any); ok {
		return schema
	}
	return nil
}

// getResponseSchema extracts schema from a response definition.
func getResponseSchema(response map[string]any) map[string]any {
	if response == nil {
		return nil
	}
	if content, ok := response["content"].(map[string]any); ok {
		if appJSON, ok := content["application/json"].(map[string]any); ok {
			if schema, ok := appJSON["schema"].(map[string]any); ok {
				return schema
			}
		}
	}
	if schema, ok := response["schema"].(map[string]any); ok {
		return schema
	}
	return nil
}

// getResponseSchemaProps gets properties from a response schema.
func getResponseSchemaProps(response map[string]any) map[string]any {
	schema := getResponseSchema(response)
	if schema == nil {
		return nil
	}
	props, _ := schema["properties"].(map[string]any)
	return props
}

// getRequestBodySchemaProps gets properties from a request body schema.
func getRequestBodySchemaProps(requestBody map[string]any) map[string]any {
	schema := getRequestBodySchema(requestBody)
	if schema == nil {
		return nil
	}
	props, _ := schema["properties"].(map[string]any)
	return props
}

// updateAction adds an action to an entity path descriptor.
func updateAction(
	methodName string,
	oldParam string,
	actionName string,
	entityDesc map[string]any,
	pathdesc map[string]any,
	why string,
) {
	entName := safeStr(entityDesc["name"])

	// Entity not already encoding action
	if strings.HasSuffix(entName, Canonize(actionName)) {
		return
	}

	action, _ := pathdesc["action"].(map[string]any)
	if action == nil {
		action = map[string]any{}
		pathdesc["action"] = action
	}

	if action[actionName] != nil {
		return
	}

	action[actionName] = map[string]any{
		"why_action": []string{"ent", entName, why, oldParam, methodName},
	}
}

// updateParamRename updates parameter rename mapping.
func updateParamRename(
	ctx *ApiDefContext,
	data map[string]any,
	path string,
	method string,
	paramRename map[string]any,
	whyParam map[string]any,
	oldParamName string,
	newParamName string,
	why string,
) {
	existingNewName, _ := paramRename[oldParamName].(string)
	existingWhy, _ := whyParam[oldParamName].([]string)

	DebugPath(path, method, "UPDATE-PARAM-RENAME", path, oldParamName, newParamName, existingNewName)

	if existingNewName == "" {
		paramRename[oldParamName] = newParamName
		if existingWhy != nil {
			found := false
			for _, w := range existingWhy {
				if w == why {
					found = true
					break
				}
			}
			if !found {
				whyParam[oldParamName] = append(existingWhy, why)
			}
		} else {
			whyParam[oldParamName] = []string{why}
		}
	} else if newParamName == existingNewName {
		// Same rename - no action needed
	} else {
		if ctx.Warn != nil {
			ctx.Warn.Warn(map[string]any{
				"note": fmt.Sprintf("Param rename mismatch: existing: %s -> %s (why: %s)  proposed: %s (why: %s) for path: %s. method: %s",
					oldParamName, existingNewName, existingNewName,
					newParamName, why, path, method),
			})
		}
	}
}

// findcmps finds component refs under a path.
func findcmps(data map[string]any, pathStr string, underprops []string, uniq bool) []map[string]string {
	var cmplist []string
	cmpset := map[string]bool{}

	def := data["def"].(map[string]any)
	defPaths, _ := def["paths"].(map[string]any)
	pathDef, _ := defPaths[pathStr].(map[string]any)
	if pathDef == nil {
		return nil
	}

	for _, mval := range pathDef {
		mdef, ok := mval.(map[string]any)
		if !ok {
			continue
		}
		for _, up := range underprops {
			upVal, ok := mdef[up]
			if !ok {
				continue
			}
			found := Find(upVal, "x-ref")
			for _, xref := range found {
				val, _ := xref["val"].(string)
				m := xrefRE.FindStringSubmatch(val)
				if m != nil {
					cmplist = append(cmplist, m[2])
					cmpset[m[2]] = true
				}
			}
		}
	}

	var names []string
	if uniq {
		for n := range cmpset {
			names = append(names, n)
		}
		sort.Strings(names)
	} else {
		names = cmplist
	}

	var result []map[string]string
	for _, n := range names {
		result = append(result, map[string]string{
			"cmp":     Canonize(n),
			"origcmp": n,
		})
	}
	return result
}

// makeMethodEntityDesc creates a MethodEntityDesc-like map with defaults.
func makeMethodEntityDesc(desc map[string]any) map[string]any {
	ment := map[string]any{
		"cmp":         nilOrStr(desc["cmp"]),
		"origcmp":     nilOrStr(desc["origcmp"]),
		"origcmpref":  nilOrStr(desc["origcmpref"]),
		"ref":         safeStr(desc["ref"]),
		"why_cmp":     safeStrSlice(desc["why_cmp"]),
		"cmpoccur":    safeIntVal(desc["cmpoccur"]),
		"path_rate":   safeFloat(desc["path_rate"]),
		"method_rate": safeFloat(desc["method_rate"]),
		"entname":     safeStr(desc["entname"]),
		"why_op":      safeStrSlice(desc["why_op"]),
		"rename":      map[string]any{"param": map[string]any{}},
		"why_rename":  map[string]any{"why_param": map[string]any{}},
		"rename_orig": safeStrSlice(desc["rename_orig"]),
		"opname":      safeStr(desc["opname"]),
		"why_opname":  safeStrSlice(desc["why_opname"]),
	}

	if r, ok := desc["rename"].(map[string]any); ok {
		ment["rename"] = r
	}
	if wr, ok := desc["why_rename"].(map[string]any); ok {
		ment["why_rename"] = wr
	}

	return ment
}

// findPotentialSchemaRefs finds x-ref values in responses.
func findPotentialSchemaRefs(pathStr string, methodName string, responses map[string]any) []string {
	var xrefs []string
	if responses == nil {
		return xrefs
	}
	rescodes := []string{"200", "201"}
	for _, rescode := range rescodes {
		resdef, ok := responses[rescode].(map[string]any)
		if !ok {
			continue
		}
		schema := getResponseSchema(resdef)
		if schema == nil {
			continue
		}
		if xref, ok := schema["x-ref"].(string); ok {
			xrefs = append(xrefs, xref)
		} else if schemaType, _ := schema["type"].(string); schemaType == "array" {
			if items, ok := schema["items"].(map[string]any); ok {
				if xref, ok := items["x-ref"].(string); ok {
					xrefs = append(xrefs, xref)
				}
			}
		}
	}

	DebugPath(pathStr, methodName, "POTENTIAL-SCHEMA-REFS", xrefs)
	return xrefs
}

// hasMethod checks if a path has a specific HTTP method.
func hasMethod(def map[string]any, pathStr string, methodName string) bool {
	paths, _ := def["paths"].(map[string]any)
	if paths == nil {
		return false
	}
	pathDef, _ := paths[pathStr].(map[string]any)
	if pathDef == nil {
		return false
	}
	_, hasLower := pathDef[strings.ToLower(methodName)]
	_, hasUpper := pathDef[strings.ToUpper(methodName)]
	return hasLower || hasUpper
}

// endsWithCmp checks if the last match element is an original component.
func endsWithCmp(data map[string]any, pm *PathMatchResult) bool {
	last := Canonize(getMatchElem(pm, -1))
	return isOrigCmp(data, last)
}

// isOrigCmp checks if a name is an original component reference.
func isOrigCmp(data map[string]any, name string) bool {
	guide, _ := data["guide"].(map[string]any)
	if guide == nil {
		return false
	}
	metricsMap, _ := guide["metrics"].(map[string]any)
	if metricsMap == nil {
		return false
	}
	countMap, _ := metricsMap["count"].(map[string]any)
	if countMap == nil {
		return false
	}
	origcmprefs, _ := countMap["origcmprefs"].(map[string]int)
	if origcmprefs == nil {
		return false
	}
	_, ok := origcmprefs[name]
	return ok
}

// findPathsWithPrefixFromData counts paths with a given prefix using data map.
func findPathsWithPrefixFromData(data map[string]any, pathStr string, strict bool) int {
	paramRE := regexp.MustCompile(`\{[^}]+\}`)
	pathStr = paramRE.ReplaceAllString(pathStr, "{}")

	count := 0
	def := data["def"].(map[string]any)
	defPaths, _ := def["paths"].(map[string]any)
	for p := range defPaths {
		path := paramRE.ReplaceAllString(p, "{}")
		if strict {
			if strings.HasPrefix(path, pathStr) && len(path) > len(pathStr) {
				count++
			}
		} else {
			if strings.HasPrefix(path, pathStr) {
				count++
			}
		}
	}
	return count
}

// getPM extracts PathMatchResult from a ment map.
func getPM(ment map[string]any) *PathMatchResult {
	if ment == nil {
		return nil
	}
	pm, _ := ment["pm"].(*PathMatchResult)
	return pm
}

// getMatchElem gets an element from pm.Matches by index, supporting negative indices.
func getMatchElem(pm *PathMatchResult, idx int) string {
	if pm == nil || len(pm.Matches) == 0 {
		return ""
	}
	if idx < 0 {
		idx = len(pm.Matches) + idx
	}
	if idx < 0 || idx >= len(pm.Matches) {
		return ""
	}
	return pm.Matches[idx]
}

// Helper functions

func sortedKeys(m map[string]any) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

func toInt(v any) int {
	switch val := v.(type) {
	case int:
		return val
	case float64:
		return int(val)
	case int64:
		return int(val)
	default:
		return 0
	}
}

func safeStr(v any) string {
	if v == nil {
		return ""
	}
	s, ok := v.(string)
	if !ok {
		return ""
	}
	return s
}

func safeStrDefault(v any, def string) string {
	s := safeStr(v)
	if s == "" {
		return def
	}
	return s
}

func safeFloat(v any) float64 {
	if v == nil {
		return 0
	}
	switch val := v.(type) {
	case float64:
		return val
	case int:
		return float64(val)
	default:
		return 0
	}
}

func safeBool(v any) bool {
	if v == nil {
		return false
	}
	b, ok := v.(bool)
	if !ok {
		return false
	}
	return b
}

func safeIntVal(v any) int {
	if v == nil {
		return 0
	}
	return toInt(v)
}

func safeStrSlice(v any) []string {
	if v == nil {
		return []string{}
	}
	if s, ok := v.([]string); ok {
		return s
	}
	return []string{}
}

func nilOrStr(v any) string {
	if v == nil {
		return ""
	}
	s, ok := v.(string)
	if !ok {
		return ""
	}
	return s
}

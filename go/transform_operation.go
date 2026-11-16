/* Copyright (c) 2024-2025 Voxgig, MIT License */

package apidef

import (
	"fmt"
	"sort"
	"strings"
)

var resolvedOps = map[string]bool{
	"load": true, "list": true, "create": true, "update": true, "remove": true, "patch": true,
}

// Emitted by the heuristic for HEAD and OPTIONS methods; no SDK operation
// exists for them yet, so they are skipped without a warning.
var ignoredOps = map[string]bool{"head": true, "options": true, "OPTIONS": true}

// OperationTransform maps HTTP operations to entity operations.
func OperationTransform(ctx *ApiDefContext) (*TransformResult, error) {
	kit := getKit(ctx)
	guide := ctx.Guide
	entityMap := kit["entity"].(map[string]any)

	guideEntity, _ := guide["entity"].(map[string]any)
	msg := "operation "

	methodIDOp := map[string]string{
		"GET": "load", "QUERY": "load", "POST": "create", "PUT": "update",
		"DELETE": "remove", "PATCH": "patch", "HEAD": "head", "OPTIONS": "options",
	}

	for _, entname := range sortedKeys(guideEntity) {
		gent := guideEntity[entname]
		gentMap, _ := gent.(map[string]any)
		if gentMap == nil {
			continue
		}

		ment, _ := entityMap[entname].(map[string]any)
		if ment == nil {
			continue
		}

		pathsDesc, _ := ment["paths$"].([]map[string]any)
		opm, _ := collectOps(ctx, entname, gentMap, pathsDesc, methodIDOp)

		ment["op"] = opm
		msg += entname + " "
	}

	return &TransformResult{OK: true, Msg: msg}, nil
}

func onlyActionPaths(paths []map[string]any) bool {
	if len(paths) == 0 {
		return false
	}
	for _, p := range paths {
		action, _ := p["action"].(map[string]any)
		if len(action) == 0 {
			return false
		}
	}
	return true
}

// A create made only of actions on the record creates nothing: its points ride
// along into the entity's own update, as update's do when a PATCH is promoted.
func resolveActionCreate(ctx *ApiDefContext, entname string, opm map[string]any, opmWork map[string][]map[string]any) {
	create, hasCreate := opm["create"].(map[string]any)
	if !hasCreate || !onlyActionPaths(opmWork["create"]) {
		return
	}

	updatePaths := append([]map[string]any{}, opmWork["update"]...)
	if _, patchLeft := opm["patch"]; !patchLeft {
		updatePaths = append(updatePaths, opmWork["patch"]...)
	}

	update, hasUpdate := opm["update"].(map[string]any)
	if hasUpdate && anyPlainPath(updatePaths) && allAddressRecord(opmWork["create"]) {
		upts, _ := update["points"].([]any)
		cpts, _ := create["points"].([]any)
		update["points"] = append(upts, cpts...)
		delete(opm, "create")
		return
	}

	if ctx != nil && ctx.Warn != nil {
		ctx.Warn.Warn(map[string]any{
			"note": fmt.Sprintf("Create on entity=%s has no route of its own, only the action %s, so a plain create sends it. Set the route's op in the guide if it should not.",
				entname, strings.Join(actionVerbs(opmWork["create"]), ", ")),
			"entity": entname,
			"op":     "create",
		})
	}
}

func anyPlainPath(paths []map[string]any) bool {
	for _, p := range paths {
		action, _ := p["action"].(map[string]any)
		if len(action) == 0 {
			return true
		}
	}
	return false
}

func allAddressRecord(paths []map[string]any) bool {
	for _, p := range paths {
		if !addressesRecord(p) {
			return false
		}
	}
	return true
}

// A custom method's `{id}:verb` keeps its placeholder in a literal, so the
// rename is what names the record there.
func addressesRecord(p map[string]any) bool {
	rename, _ := p["rename"].(map[string]any)
	param, _ := rename["param"].(map[string]any)
	for _, to := range param {
		switch v := to.(type) {
		case string:
			if v == "id" {
				return true
			}
		case map[string]any:
			if target, _ := v["target"].(string); target == "id" {
				return true
			}
		}
	}
	segments, _ := p["segments"].([]map[string]any)
	for _, seg := range segments {
		if name, _ := seg["var"].(string); name == "id" {
			return true
		}
	}
	return false
}

func actionVerbs(paths []map[string]any) []string {
	seen := map[string]bool{}
	verbs := []string{}
	for _, p := range paths {
		action, _ := p["action"].(map[string]any)
		for _, verb := range sortedKeys(action) {
			if !seen[verb] {
				seen[verb] = true
				verbs = append(verbs, verb)
			}
		}
	}
	sort.Strings(verbs)
	return verbs
}

func collectOps(ctx *ApiDefContext, entname string, gent map[string]any, pathsDesc []map[string]any, methodIDOp map[string]string) (map[string]any, map[string][]map[string]any) {
	opmWork := map[string][]map[string]any{}

	for _, pathdesc := range pathsDesc {
		op, _ := pathdesc["op"].(map[string]any)
		for _, opname := range sortedKeys(op) {
			gop := op[opname]
			gopMap, _ := gop.(map[string]any)
			if gopMap == nil {
				continue
			}
			// Op-level opt-out; see the entity-level note in transform_entity.go.
			if !guideActive(gopMap) {
				continue
			}

			if !resolvedOps[opname] {
				if !ignoredOps[opname] && ctx != nil && ctx.Warn != nil {
					ctx.Warn.Warn(map[string]any{
						"note": fmt.Sprintf("Unknown op %q on entity=%s path=%s is dropped: only load/list/create/update/remove/patch are resolved. Declare a verb as `action: %s: {}` beside a CRUD op on that path.",
							opname, entname, safeStr(pathdesc["orig"]), opname),
						"entity": entname,
						"path":   pathdesc["orig"],
						"op":     opname,
					})
				}
				continue
			}

			method, _ := gopMap["method"].(string)

			opPathDesc := map[string]any{
				"orig":     pathdesc["orig"],
				"segments": pathdesc["segments"],
				"rename":   pathdesc["rename"],
				"method":   method,
				"op":       gop,
				"action":   pathdesc["action"],
				"def":      pathdesc["def"],
			}
			opmWork[opname] = append(opmWork[opname], opPathDesc)
		}
	}

	opm := map[string]any{}

	for _, opname := range sortedKeysOpmWork(opmWork) {
		paths := opmWork[opname]
		points := make([]any, 0)
		for _, p := range paths {
			segments, _ := p["segments"].([]map[string]any)
			if segments == nil {
				segments = []map[string]any{}
			}
			transform := map[string]any{}
			if gop, ok := p["op"].(map[string]any); ok {
				if t, ok := gop["transform"].(map[string]any); ok {
					for k, v := range t {
						transform[k] = v
					}
				}
			}
			mtarget := map[string]any{
				"o": p["orig"],
				"s": segments,
				"r": p["rename"],
				"m": p["method"],
				"g": map[string]any{},
				"t": transform,
				"q": map[string]any{"exist": []any{}},
				"a": true,
			}
			points = append(points, mtarget)
		}

		opm[opname] = map[string]any{
			"name":   opname,
			"points": points,
		}
	}

	if patch, ok := opm["patch"].(map[string]any); ok {
		update, hasUpdate := opm["update"].(map[string]any)
		if !hasUpdate || onlyActionPaths(opmWork["update"]) {
			if hasUpdate {
				pts, _ := patch["points"].([]any)
				upts, _ := update["points"].([]any)
				patch["points"] = append(pts, upts...)
			}
			patch["name"] = "update"
			opm["update"] = patch
			delete(opm, "patch")
		}
	}

	resolveActionCreate(ctx, entname, opm, opmWork)

	// After patch has joined update, so each operation's routes are final.
	for _, opname := range sortedKeys(opm) {
		mop, _ := opm[opname].(map[string]any)
		name, _ := mop["name"].(string)
		points, _ := mop["points"].([]any)
		for i, pt := range points {
			mpoint, _ := pt.(map[string]any)
			transform, _ := mpoint["t"].(map[string]any)
			if transform["req"] == nil {
				transform["req"] = requestDefault(ctx, entname, opm, name, points, i)
			}
			if transform["res"] == nil {
				transform["res"] = "`body`"
			}
		}
	}

	return opm, opmWork
}

// requestDefault mirrors ts/src/transform/operation.ts: the request transform
// of a point whose guide sets none, read from the body the guide names. An
// object wraps the record under the entity's name or sends a closed body's own
// properties; an array is sent from a field named for its records, clear of
// the names its operation and entity already use.
func requestDefault(ctx *ApiDefContext, entname string, opm map[string]any, opname string, points []any, at int) any {
	if ctx == nil {
		return "`reqdata`"
	}
	media := func(name string, q map[string]any) string {
		method, _ := q["m"].(string)
		path, _ := q["o"].(string)
		body, _ := guideBodyMedia(ctx.Guide, entname, name, method, path)
		return body
	}
	mpoint, _ := points[at].(map[string]any)
	method, _ := mpoint["m"].(string)
	path, _ := mpoint["o"].(string)
	chosen := media(opname, mpoint)
	list := arrayRequestSchema(ctx.Def, method, path, chosen)
	if list == nil {
		if req := bodyRequestTransform(objectSchema(ctx.Def, method, path, chosen), entname); req != nil {
			return req
		}
		return "`reqdata`"
	}
	taken := []string{}
	for _, pt := range points {
		if q, _ := pt.(map[string]any); q != nil {
			taken = append(taken, routeArgNames(ctx.Def, q)...)
		}
	}
	for _, key := range sortedKeys(opm) {
		mop, _ := opm[key].(map[string]any)
		name, _ := mop["name"].(string)
		routes, _ := mop["points"].([]any)
		for _, pt := range routes {
			if q, _ := pt.(map[string]any); q != nil && !samePoint(q, mpoint) {
				taken = append(taken, routeFieldNames(q, ctx.Def, name, entname, media(name, q))...)
			}
		}
	}
	required := requestDecl(ctx.Def, method, path)["required"] == true
	for j, pt := range points {
		if q, _ := pt.(map[string]any); j != at && q != nil {
			c := arrayCarrier(ctx.Def, q, media(opname, q))
			if c != nil && !(sameType(c.typ, nullableType(list)) && c.required == required) {
				taken = append(taken, c.name)
			}
		}
	}
	return "`reqdata." + arrayBodyField(list, entname, taken) + "`"
}

// objectSchema mirrors ts/src/transform/operation.ts: the object body a point
// sends, under the media type the guide names, else the preferred one, else a
// schema declared on the request body itself.
func objectSchema(def map[string]any, method string, path string, chosen string) any {
	if schema := requestSchema(def, method, path, chosen); schema != nil {
		return schema
	}
	if chosen != "" {
		return nil
	}
	paths, _ := def["paths"].(map[string]any)
	pathdef, _ := paths[path].(map[string]any)
	opdef, _ := pathdef[strings.ToLower(method)].(map[string]any)
	requestBody, _ := opdef["requestBody"].(map[string]any)
	if schema, ok := requestBody["schema"].(map[string]any); ok {
		return schema
	}
	return nil
}

// samePoint reports whether a and b are one map, as the TypeScript port
// compares points by reference.
func samePoint(a map[string]any, b map[string]any) bool {
	return fmt.Sprintf("%p", a) == fmt.Sprintf("%p", b)
}

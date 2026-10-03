/* Copyright (c) 2024-2025 Voxgig, MIT License */

package apidef

import "fmt"

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

	// After patch has joined update, so each operation's routes are final.
	for _, opname := range sortedKeys(opm) {
		mop, _ := opm[opname].(map[string]any)
		name, _ := mop["name"].(string)
		points, _ := mop["points"].([]any)
		for i, pt := range points {
			transform, _ := pt.(map[string]any)["t"].(map[string]any)
			if transform["req"] == nil {
				transform["req"] = requestDefault(ctx, entname, name, points, i)
			}
			if transform["res"] == nil {
				transform["res"] = "`body`"
			}
		}
	}

	return opm, opmWork
}

// requestDefault mirrors ts/src/transform/operation.ts: an array body is sent
// from one field of the request data, named for its records, and never for a
// field another route of the operation has.
func requestDefault(ctx *ApiDefContext, entname string, opname string, points []any, at int) string {
	if ctx == nil {
		return "`reqdata`"
	}
	media := func(q map[string]any) string {
		method, _ := q["m"].(string)
		path, _ := q["o"].(string)
		body, _ := guideBodyMedia(ctx.Guide, entname, opname, method, path)
		return body
	}
	mpoint, _ := points[at].(map[string]any)
	method, _ := mpoint["m"].(string)
	path, _ := mpoint["o"].(string)
	list := arrayRequestSchema(ctx.Def, method, path, media(mpoint))
	if list == nil {
		return "`reqdata`"
	}
	taken := []string{}
	for j, pt := range points {
		if q, _ := pt.(map[string]any); j != at && q != nil {
			taken = append(taken, routeFieldNames(q, ctx.Def, opname, entname, media(q))...)
		}
	}
	return "`reqdata." + arrayBodyField(list, entname, taken) + "`"
}

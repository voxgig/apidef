/* Copyright (c) 2024-2025 Voxgig, MIT License */

package apidef

import (
	"fmt"
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
			mpoint, _ := pt.(map[string]any)
			transform, _ := mpoint["t"].(map[string]any)
			if heuristicRequest(ctx, entname, name, mpoint, transform["req"]) {
				delete(transform, "req")
			}
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

// requestDefault mirrors ts/src/transform/operation.ts: an array body is sent
// from one field of the request data, named for its records, and never for an
// argument of its operation, a field another route of its entity has, as
// fields span operations, or a carrier already named for an array of another
// type.
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
		if "" != chosen {
			if req := bodyRequestTransform(requestSchema(ctx.Def, method, path, chosen), entname); req != nil {
				return req
			}
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
	for j, pt := range points {
		if q, _ := pt.(map[string]any); j != at && q != nil {
			if c := arrayCarrier(ctx.Def, q, media(opname, q)); c != nil && !sameType(c.typ, nullableType(list)) {
				taken = append(taken, c.name)
			}
		}
	}
	return "`reqdata." + arrayBodyField(list, entname, taken) + "`"
}

// heuristicRequest mirrors ts/src/transform/operation.ts: the request
// transform the heuristic took from the default body, still in place where
// the guide selects another media type for the point.
func heuristicRequest(ctx *ApiDefContext, entname string, opname string, mpoint map[string]any, req any) bool {
	if ctx == nil || req == nil {
		return false
	}
	method, _ := mpoint["m"].(string)
	path, _ := mpoint["o"].(string)
	if chosen, _ := guideBodyMedia(ctx.Guide, entname, opname, method, path); "" == chosen {
		return false
	}
	generated := bodyRequestTransform(requestSchema(ctx.Def, method, path, ""), entname)
	return generated != nil && transformKey(req) == transformKey(generated)
}

// transformKey compares a transform map by its entries, in any order.
func transformKey(t any) string {
	if text, isText := t.(string); isText {
		return text
	}
	m, _ := t.(map[string]any)
	parts := []string{}
	for _, key := range sortedKeys(m) {
		parts = append(parts, key+"="+fmt.Sprint(m[key]))
	}
	return "{" + strings.Join(parts, ",") + "}"
}

// samePoint reports whether a and b are one map, as the TypeScript port
// compares points by reference.
func samePoint(a map[string]any, b map[string]any) bool {
	return fmt.Sprintf("%p", a) == fmt.Sprintf("%p", b)
}

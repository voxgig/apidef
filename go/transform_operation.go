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
		opm, opmWork := collectOps(ctx, entname, gentMap, pathsDesc, methodIDOp)

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
		for i, p := range paths {
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
			if transform["req"] == nil {
				transform["req"] = requestDefault(ctx, entname, paths, i)
			}
			if transform["res"] == nil {
				transform["res"] = "`body`"
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

	return opm, opmWork
}

// requestDefault mirrors ts/src/transform/operation.ts: an array body is sent
// from one field of the request data, named for its records, and never for a
// field another route of the operation is sent with.
func requestDefault(ctx *ApiDefContext, entname string, paths []map[string]any, at int) string {
	if ctx == nil {
		return "`reqdata`"
	}
	body := func(q map[string]any) any {
		gop, _ := q["op"].(map[string]any)
		gbody, _ := gop["body"].(map[string]any)
		method, _ := q["method"].(string)
		path, _ := q["orig"].(string)
		return requestSchema(ctx.Def, method, path, textOf(gbody["media"]))
	}
	list := arrayShape(body(paths[at]), map[string]bool{})
	if list == nil {
		return "`reqdata`"
	}
	taken := []string{}
	for j, q := range paths {
		if j != at {
			for key := range mergedProperties(body(q)) {
				taken = append(taken, key)
			}
		}
	}
	return "`reqdata." + arrayBodyField(list, entname, taken) + "`"
}

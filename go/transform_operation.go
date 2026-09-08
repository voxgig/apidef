/* Copyright (c) 2024-2025 Voxgig, MIT License */

package apidef

import "fmt"

// The op names the transform resolves. Anything else under a guide path's
// `op` map is dropped, and an unknown name (a verb such as `merge`, or a
// typo) is dropped WITH A WARNING: guide.aon is the only correction surface
// (ADR-002), so a correction that vanishes silently defeats it. Mirrors
// src/transform/operation.ts RESOLVED_OPS / IGNORED_OPS.
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

		// If patch is actually update, make it update. That holds when there
		// is no PUT update at all, and equally when every PUT update point is
		// an ACTION: a verb such as GitHub's `merge` borrows the update slot
		// but is not the entity's update. The action points join the promoted
		// PATCH, selected at call time by `$action`. Mirrors
		// src/transform/operation.ts resolvePatch.
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

// onlyActionPaths is true when every path collected under an op carries a
// guide action. Mirrors src/transform/operation.ts onlyActionPaths.
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
			// Renames are already applied by resolvePathList in
			// transform_entity.go — THE construction site (ADR-003). A second
			// pass here re-read names it had just written: gitlab's
			// /groups/{id}/badges/{badge_id} with rename
			// {badge_id: 'id', id: 'project_id'} became
			// /groups/{project_id}/badges/{project_id}, silently dropping an
			// argument. Mirrors src/transform/operation.ts.
			segments, _ := p["segments"].([]map[string]any)
			if segments == nil {
				segments = []map[string]any{}
			}
			// Carry the per-path op transform (res `body.<entname>`, req
			// `{<entname>: reqdata}`) computed by the guide step
			// (resolveTransform) onto the model point, then fall back to the
			// generic defaults. It lives on the path's op, not on the op-map
			// entry, so read p["op"].transform. Mirrors
			// src/transform/operation.ts.
			transform := map[string]any{}
			if gop, ok := p["op"].(map[string]any); ok {
				if t, ok := gop["transform"].(map[string]any); ok {
					for k, v := range t {
						transform[k] = v
					}
				}
			}
			if transform["req"] == nil {
				transform["req"] = "`reqdata`"
			}
			if transform["res"] == nil {
				transform["res"] = "`body`"
			}

			mtarget := map[string]any{
				"orig":      p["orig"],
				"segments":  segments,
				"rename":    p["rename"],
				"method":    p["method"],
				"args":      map[string]any{},
				"transform": transform,
				"select":    map[string]any{"exist": []any{}},
				"active":    true,
				"relations": []any{},
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

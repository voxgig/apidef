/* Copyright (c) 2024-2025 Voxgig, MIT License */

package apidef

// OperationTransform maps HTTP operations to entity operations.
func OperationTransform(ctx *ApiDefContext) (*TransformResult, error) {
	kit := getKit(ctx)
	guide := ctx.Guide
	entityMap := kit["entity"].(map[string]any)

	guideEntity, _ := guide["entity"].(map[string]any)
	msg := "operation "

	methodIDOp := map[string]string{
		"GET": "load", "POST": "create", "PUT": "update",
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
		opm := collectOps(gentMap, pathsDesc, methodIDOp)

		// If patch is actually update, make it update
		if patch, ok := opm["patch"].(map[string]any); ok {
			if _, hasUpdate := opm["update"]; !hasUpdate {
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

func collectOps(gent map[string]any, pathsDesc []map[string]any, methodIDOp map[string]string) map[string]any {
	opmWork := map[string][]map[string]any{}

	for _, pathdesc := range pathsDesc {
		op, _ := pathdesc["op"].(map[string]any)
		for _, opname := range sortedKeys(op) {
			gop := op[opname]
			gopMap, _ := gop.(map[string]any)
			if gopMap == nil {
				continue
			}
			method, _ := gopMap["method"].(string)

			opPathDesc := map[string]any{
				"orig":   pathdesc["orig"],
				"parts":  pathdesc["parts"],
				"rename": pathdesc["rename"],
				"method": method,
				"op":     gop,
				"def":    pathdesc["def"],
			}
			opmWork[opname] = append(opmWork[opname], opPathDesc)
		}
	}

	opm := map[string]any{}

	for _, opname := range sortedKeysOpmWork(opmWork) {
		paths := opmWork[opname]
		points := make([]any, 0)
		for _, p := range paths {
			parts := applyRename(p)
			transform := map[string]any{}
			if gopMap, ok := p["op"].(map[string]any); ok {
				if t, ok := gopMap["transform"].(map[string]any); ok {
					transform = t
				}
			}
			if _, ok := transform["req"]; !ok {
				transform["req"] = "`reqdata`"
			}
			if _, ok := transform["res"]; !ok {
				transform["res"] = "`body`"
			}

			mtarget := map[string]any{
				"orig":      p["orig"],
				"parts":     parts,
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

	return opm
}

func applyRename(pathdesc map[string]any) []string {
	parts, _ := pathdesc["parts"].([]string)
	rename, _ := pathdesc["rename"].(map[string]any)
	paramRename := map[string]string{}
	if rename != nil {
		if pr, ok := rename["param"].(map[string]any); ok {
			for _, k := range sortedKeys(pr) {
				v := pr[k]
				switch vt := v.(type) {
				case string:
					paramRename[k] = vt
				case map[string]any:
					if target, ok := vt["target"].(string); ok {
						paramRename[k] = target
					}
				}
			}
		}
	}

	result := make([]string, len(parts))
	for i, p := range parts {
		if len(p) > 0 && p[0] == '{' {
			name := p[1 : len(p)-1]
			if newName, ok := paramRename[name]; ok {
				result[i] = "{" + newName + "}"
			} else {
				result[i] = p
			}
		} else {
			result[i] = p
		}
	}
	return result
}

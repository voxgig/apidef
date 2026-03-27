/* Copyright (c) 2024-2025 Voxgig, MIT License */

package apidef

import "strings"

// FlowTransform creates basic flow definitions for entities.
func FlowTransform(ctx *ApiDefContext) (*TransformResult, error) {
	kit := getKit(ctx)
	guide := ctx.Guide
	entityMap := kit["entity"].(map[string]any)
	flowMap := kit["flow"].(map[string]any)

	guideEntity, _ := guide["entity"].(map[string]any)
	msg := ""

	for entname := range guideEntity {
		modelent, _ := entityMap[entname].(map[string]any)
		if modelent == nil {
			continue
		}
		entNameMap := map[string]any{"name": entname}
		flowName := "Basic" + Nom(entNameMap, "Name") + "Flow"

		basicflow := map[string]any{
			"name":     flowName,
			"entity":   entname,
			"kind":     "basic",
			"step":     []any{},
			"key$":     flowName,
			"active":   true,
			"param":    map[string]any{},
		}

		flowMap[flowName] = basicflow
		msg += flowName + " "
	}

	return &TransformResult{OK: true, Msg: msg}, nil
}

// FlowstepTransform creates individual flow steps within entity flows.
func FlowstepTransform(ctx *ApiDefContext) (*TransformResult, error) {
	kit := getKit(ctx)
	entityMap := kit["entity"].(map[string]any)
	flowMap := kit["flow"].(map[string]any)

	msg := ""

	for flowname, flow := range flowMap {
		flowData, _ := flow.(map[string]any)
		if flowData == nil {
			continue
		}

		entname, _ := flowData["entity"].(string)
		ent, _ := entityMap[entname].(map[string]any)
		if ent == nil {
			continue
		}

		opmap, _ := ent["op"].(map[string]any)
		ref01 := entname + "_n01"

		var steps []any

		// Create step - uses update's last point for params
		if updateOp, ok := opmap["update"].(map[string]any); ok {
			point := getLastPoint(updateOp)
			step := map[string]any{
				"op":     "create",
				"data":   map[string]any{"id": ref01},
				"input":  map[string]any{"id": ref01},
				"match":  map[string]any{},
				"active": true,
			}
			fillMatchFromParams(step, point, entname)
			steps = append(steps, step)
		}

		// List step
		if listOp, ok := opmap["list"].(map[string]any); ok {
			point := getLastPoint(listOp)
			step := map[string]any{
				"op":     "list",
				"valid":  []any{map[string]any{"apply": "ItemExists", "spec": map[string]any{"id": ref01}}},
				"match":  map[string]any{},
				"data":   map[string]any{},
				"active": true,
			}
			fillMatchFromParams(step, point, entname)
			steps = append(steps, step)
		}

		// Update step
		if updateOp, ok := opmap["update"].(map[string]any); ok {
			point := getLastPoint(updateOp)
			mark01 := "Mark01-" + ref01
			step := map[string]any{
				"op":     "update",
				"data":   map[string]any{"id": ref01},
				"input":  map[string]any{"id": ref01},
				"spec":   []any{map[string]any{"apply": "TextFieldMark", "def": map[string]any{"mark": mark01}}},
				"match":  map[string]any{},
				"active": true,
			}
			fillDataFromParams(step, point, entname)
			steps = append(steps, step)
		}

		// Load step
		if loadOp, ok := opmap["load"].(map[string]any); ok {
			point := getLastPoint(loadOp)
			mark01 := "Mark01-" + ref01
			step := map[string]any{
				"op":     "load",
				"input":  map[string]any{"id": ref01},
				"match":  map[string]any{},
				"data":   map[string]any{},
				"valid":  []any{map[string]any{"apply": "TextFieldMark", "def": map[string]any{"mark": mark01}}},
				"active": true,
			}
			fillMatchFromParams(step, point, entname)
			steps = append(steps, step)
		}

		// Remove step
		if removeOp, ok := opmap["remove"].(map[string]any); ok {
			point := getLastPoint(removeOp)
			step := map[string]any{
				"op":     "remove",
				"input":  map[string]any{"id": ref01},
				"match":  map[string]any{},
				"data":   map[string]any{},
				"active": true,
			}
			fillMatchFromParams(step, point, entname)
			steps = append(steps, step)

			// Final list after remove
			if listOp, ok := opmap["list"].(map[string]any); ok {
				listPoint := getLastPoint(listOp)
				listStep := map[string]any{
					"op":     "list",
					"valid":  []any{map[string]any{"apply": "ItemNotExists", "def": map[string]any{"id": ref01}}},
					"match":  map[string]any{},
					"data":   map[string]any{},
					"active": true,
				}
				fillMatchFromParams(listStep, listPoint, entname)
				steps = append(steps, listStep)
			}
		}

		flowData["step"] = steps
		msg += flowname + " "
	}

	return &TransformResult{OK: true, Msg: msg}, nil
}

func getLastPoint(mop map[string]any) map[string]any {
	points, _ := mop["points"].([]any)
	if len(points) == 0 {
		return nil
	}
	last, _ := points[len(points)-1].(map[string]any)
	return last
}

func fillMatchFromParams(step, point map[string]any, entname string) {
	if point == nil {
		return
	}
	args, _ := point["args"].(map[string]any)
	if args == nil {
		return
	}
	params, _ := args["params"].([]any)
	match := step["match"].(map[string]any)
	for _, p := range params {
		pm, _ := p.(map[string]any)
		if pm == nil {
			continue
		}
		name, _ := pm["name"].(string)
		if name == "id" {
			match["id"] = entname + "01"
		} else {
			match[name] = strings.Replace(name, "_id", "", 1) + "01"
		}
	}
}

func fillDataFromParams(step, point map[string]any, entname string) {
	if point == nil {
		return
	}
	args, _ := point["args"].(map[string]any)
	if args == nil {
		return
	}
	params, _ := args["params"].([]any)
	data := step["data"].(map[string]any)
	for _, p := range params {
		pm, _ := p.(map[string]any)
		if pm == nil {
			continue
		}
		name, _ := pm["name"].(string)
		if name == "id" {
			data["id"] = entname + "01"
		} else {
			data[name] = strings.Replace(name, "_id", "", 1) + "01"
		}
	}
}

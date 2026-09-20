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

	for _, entname := range sortedKeys(guideEntity) {
		modelent, _ := entityMap[entname].(map[string]any)
		if modelent == nil {
			continue
		}
		entNameMap := map[string]any{"name": entname}
		flowName := "Basic" + Nom(entNameMap, "Name") + "Flow"

		basicflow := map[string]any{
			"name":   flowName,
			"entity": entname,
			"kind":   "basic",
			"step":   []any{},
		}

		flowMap[flowName] = basicflow
		msg += flowName + " "
	}

	return &TransformResult{OK: true, Msg: msg}, nil
}

func FlowstepTransform(ctx *ApiDefContext) (*TransformResult, error) {
	kit := getKit(ctx)
	entityMap := kit["entity"].(map[string]any)
	flowMap := kit["flow"].(map[string]any)

	msg := ""

	for _, flowname := range sortedKeys(flowMap) {
		flow := flowMap[flowname]
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
		ref01 := entname + "_ref01"
		mark01 := "Mark01-" + ref01

		var steps []any

		// createStep — gated on create op
		if createOp, ok := opmap["create"].(map[string]any); ok {
			point := getLastPoint(createOp)
			step := newFlowStep("create", map[string]any{
				"input": map[string]any{"ref": ref01},
			})
			fillStepMatchFromParams(step, point, map[string]any{"ref": ref01}, true, entname)
			steps = append(steps, step)
		}

		// listStep — gated on list op
		if listOp, ok := opmap["list"].(map[string]any); ok {
			point := getLastPoint(listOp)
			step := newFlowStep("list", map[string]any{
				"valid": []any{map[string]any{
					"apply": "ItemExists",
					"def":   map[string]any{"ref": ref01},
				}},
			})
			fillStepMatchFromParams(step, point, nil, false, entname)
			steps = append(steps, step)
		}

		// updateStep — gated on update op. Iterates params and writes to step.data
		// (id → ent.name + "01"; other → input fallback or name without _id + "01").
		firstTF := firstTextField(ent)
		if updateOp, ok := opmap["update"].(map[string]any); ok {
			point := getLastPoint(updateOp)
			input := map[string]any{
				"ref":        ref01,
				"suffix":     "_up0",
				"srcdatavar": ref01 + "_data",
			}
			if firstTF != "" {
				input["textfield"] = firstTF
			}
			step := newFlowStep("update", map[string]any{
				"input": input,
				"spec": []any{map[string]any{
					"apply": "TextFieldMark",
					"def":   map[string]any{"mark": mark01},
				}},
			})
			fillStepDataFromParams(step, point, input, entname)
			steps = append(steps, step)
		}

		// loadStep — gated on load op
		if loadOp, ok := opmap["load"].(map[string]any); ok {
			point := getLastPoint(loadOp)
			input := map[string]any{
				"ref":        ref01,
				"suffix":     "_dt0",
				"srcdatavar": ref01 + "_data",
			}
			step := newFlowStep("load", map[string]any{
				"input": input,
				"valid": []any{map[string]any{
					"apply": "TextFieldMark",
					"def":   map[string]any{"mark": mark01},
				}},
			})
			fillStepMatchFromParams(step, point, input, true, entname)
			steps = append(steps, step)
		}

		// removeStep — gated on remove op
		if removeOp, ok := opmap["remove"].(map[string]any); ok {
			point := getLastPoint(removeOp)
			input := map[string]any{
				"ref":    ref01,
				"suffix": "_rm0",
			}
			step := newFlowStep("remove", map[string]any{
				"input": input,
			})
			fillStepMatchFromParams(step, point, input, true, entname)
			steps = append(steps, step)

			// Final post-remove listStep (only when remove exists)
			if listOp, ok := opmap["list"].(map[string]any); ok {
				listPoint := getLastPoint(listOp)
				listInput := map[string]any{"suffix": "_rt0"}
				listStep := newFlowStep("list", map[string]any{
					"input": listInput,
					"valid": []any{map[string]any{
						"apply": "ItemNotExists",
						"def":   map[string]any{"ref": ref01},
					}},
				})
				fillStepMatchFromParams(listStep, listPoint, listInput, false, entname)
				steps = append(steps, listStep)
			}
		}

		flowData["step"] = steps
		msg += flowname + " "
	}

	return &TransformResult{OK: true, Msg: msg}, nil
}

func newFlowStep(opname string, args map[string]any) map[string]any {
	get := func(k string, def any) any {
		if v, ok := args[k]; ok && v != nil {
			return v
		}
		return def
	}
	return map[string]any{
		"op":    opname,
		"input": get("input", map[string]any{}),
		"match": get("match", map[string]any{}),
		"data":  get("data", map[string]any{}),
		"spec":  get("spec", []any{}),
		"valid": get("valid", []any{}),
	}
}

func getLastPoint(mop map[string]any) map[string]any {
	points, _ := mop["points"].([]any)
	if len(points) == 0 {
		return nil
	}
	last, _ := points[len(points)-1].(map[string]any)
	return last
}

func fillStepMatchFromParams(step, point, input map[string]any, useEntNameForId bool, entname string) {
	if point == nil {
		return
	}
	args, _ := point["args"].(map[string]any)
	if args == nil {
		return
	}
	params, _ := args["params"].([]any)
	match, _ := step["match"].(map[string]any)
	if match == nil {
		match = map[string]any{}
		step["match"] = match
	}
	for _, p := range params {
		pm, _ := p.(map[string]any)
		if pm == nil {
			continue
		}
		name, _ := pm["name"].(string)
		if step["op"] == "create" && name == "id" {
			continue
		}
		if name == "id" && useEntNameForId {
			if v, ok := lookupInput(input, "id"); ok {
				match["id"] = v
			} else {
				match["id"] = entname + "01"
			}
			continue
		}
		match[name] = flowParamValue(name, input)
	}
}

// fillStepDataFromParams writes step.data[param.name] (used by updateStep).
// For id param, uses input.id ?? ent.name + "01".
func fillStepDataFromParams(step, point, input map[string]any, entname string) {
	if point == nil {
		return
	}
	args, _ := point["args"].(map[string]any)
	if args == nil {
		return
	}
	params, _ := args["params"].([]any)
	data, _ := step["data"].(map[string]any)
	if data == nil {
		data = map[string]any{}
		step["data"] = data
	}
	for _, p := range params {
		pm, _ := p.(map[string]any)
		if pm == nil {
			continue
		}
		name, _ := pm["name"].(string)
		if name == "id" {
			if v, ok := lookupInput(input, "id"); ok {
				data["id"] = v
			} else {
				data["id"] = entname + "01"
			}
			continue
		}
		data[name] = flowParamValue(name, input)
	}
}

// flowParamValue returns input[name] if present, else name with `_id`
// removed plus `01` (mirrors TS: param.name.replace(/_id/, ”) + '01').
func flowParamValue(name string, input map[string]any) any {
	if v, ok := lookupInput(input, name); ok {
		return v
	}
	return strings.Replace(name, "_id", "", 1) + "01"
}

func lookupInput(input map[string]any, name string) (any, bool) {
	if input == nil {
		return nil, false
	}
	v, ok := input[name]
	return v, ok
}

// firstTextField mirrors TS firstTextField — returns the name of the
// first $STRING field on the entity that is not the id and is not
// readOnly. The flow writes this field and then asserts the mark comes
// back, so a field the client may not send fails the step it was chosen
// for.
func firstTextField(ent map[string]any) string {
	fields, _ := ent["fields"].(map[string]any)
	for _, name := range sortedKeys(fields) {
		f := fields[name]
		fm, _ := f.(map[string]any)
		if fm == nil {
			continue
		}
		ftype, _ := fm["t"].(string)
		fname, _ := fm["n"].(string)
		if ro, _ := fm["ro"].(bool); ro {
			continue
		}
		if ftype == "`$STRING`" && fname != "id" {
			return fname
		}
	}
	return ""
}

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
		createOp, hasCreate := opmap["create"].(map[string]any)
		if hasCreate {
			point := getLastPoint(createOp)
			input := map[string]any{"ref": ref01}
			step := newFlowStep("create", map[string]any{"input": input})
			fillCollectionMatch(step, point, input)
			seedRelatedOpParams(opmap, step)
			steps = append(steps, step)
		}

		// listStep — gated on list op
		listOp, hasList := opmap["list"].(map[string]any)
		if hasList {
			step := newFlowStep("list", map[string]any{
				"valid": []any{map[string]any{
					"apply": "ItemExists",
					"def":   map[string]any{"ref": ref01},
				}},
			})
			fillCollectionMatch(step, getLastPoint(listOp), nil)
			steps = append(steps, step)
		}

		// updateStep — gated on update op
		if updateOp, ok := opmap["update"].(map[string]any); ok {
			point := getLastPoint(updateOp)
			input := map[string]any{
				"ref":        ref01,
				"suffix":     "_up0",
				"srcdatavar": ref01 + "_data",
			}
			if firstTF := firstTextField(ent, updateOp); firstTF != "" {
				input["textfield"] = firstTF
			}
			step := newFlowStep("update", map[string]any{
				"input": input,
				"spec": []any{map[string]any{
					"apply": "TextFieldMark",
					"def":   map[string]any{"mark": mark01},
				}},
			})
			fillStepDataFromParams(step, point, input)
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
			fillItemMatch(step, point, input, "load", entname)
			steps = append(steps, step)
		}

		// removeStep and the post-remove listStep — gated on remove and
		// create, since a flow removes only what it created
		if removeOp, ok := opmap["remove"].(map[string]any); ok && hasCreate {
			point := getLastPoint(removeOp)
			input := map[string]any{
				"ref":    ref01,
				"suffix": "_rm0",
			}
			step := newFlowStep("remove", map[string]any{
				"input": input,
			})
			fillItemMatch(step, point, input, "remove", entname)
			steps = append(steps, step)

			if hasList {
				listInput := map[string]any{"suffix": "_rt0"}
				listStep := newFlowStep("list", map[string]any{
					"input": listInput,
					"valid": []any{map[string]any{
						"apply": "ItemNotExists",
						"def":   map[string]any{"ref": ref01},
					}},
				})
				fillCollectionMatch(listStep, getLastPoint(listOp), listInput)
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
		"o": opname,
		"i": get("input", map[string]any{}),
		"m": get("match", map[string]any{}),
		"d": get("data", map[string]any{}),
		"s": get("spec", []any{}),
		"v": get("valid", []any{}),
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

func pointParams(point map[string]any) []map[string]any {
	args, _ := point["g"].(map[string]any)
	return argsParamList(args["params"])
}

// fillCollectionMatch fills a create or list step's match. An `id` param is
// the entity's own id, unknown here, unless a rename made it so.
func fillCollectionMatch(step, point, input map[string]any) {
	match := step["m"].(map[string]any)
	for _, pm := range pointParams(point) {
		name, _ := pm["n"].(string)
		if name == "id" {
			if orig := renamedIdOrigName(point); orig != "" {
				match[orig] = flowParamValue(orig, input)
			}
			continue
		}
		match[name] = flowParamValue(name, input)
	}
}

// fillItemMatch fills a load or remove step's match, where the param naming
// the entity itself is matched as `id`.
func fillItemMatch(step, point, input map[string]any, opname, entname string) {
	match := step["m"].(map[string]any)
	for _, pm := range pointParams(point) {
		if isEntityIdParam(point, pm, opname) {
			if v, ok := lookupInput(input, "id"); ok {
				match["id"] = v
			} else {
				match["id"] = entname + "01"
			}
			continue
		}
		name, _ := pm["n"].(string)
		match[name] = flowParamValue(name, input)
	}
}

// fillStepDataFromParams fills an update step's data. The entity's own id is
// left out: the test takes it from the entity the flow created.
func fillStepDataFromParams(step, point, input map[string]any) {
	data := step["d"].(map[string]any)
	for _, pm := range pointParams(point) {
		if isEntityIdParam(point, pm, "update") {
			continue
		}
		name, _ := pm["n"].(string)
		data[name] = flowParamValue(name, input)
	}
}

// seedRelatedOpParams gives the create step every parent param the other
// operations take, so they reach the entity it creates.
func seedRelatedOpParams(opmap, step map[string]any) {
	match := step["m"].(map[string]any)
	for _, opname := range []string{"list", "load", "update", "remove"} {
		op, _ := opmap[opname].(map[string]any)
		points, _ := op["points"].([]any)
		for _, pt := range points {
			point, _ := pt.(map[string]any)
			for _, pm := range pointParams(point) {
				name, _ := pm["n"].(string)
				if name == "" || isEntityIdParam(point, pm, opname) {
					continue
				}
				if _, ok := match[name]; !ok {
					match[name] = strings.Replace(name, "_id", "", 1) + "01"
				}
			}
		}
	}
}

// isEntityIdParam reports whether a param names the entity itself: `id`, a
// param renamed to `id`, or on one entity's operation the last placeholder.
func isEntityIdParam(point, param map[string]any, opname string) bool {
	name, _ := param["n"].(string)
	if name == "id" {
		return true
	}
	rename, _ := point["r"].(map[string]any)
	renameParam, _ := rename["param"].(map[string]any)
	if name != "" {
		if to, _ := renameParam[jsLowerFirst(Camelify(name))].(string); to == "id" {
			return true
		}
	}
	if opname == "update" || opname == "load" || opname == "remove" {
		last := ""
		for _, seg := range pointSegmentMaps(point) {
			if v, ok := seg["var"].(string); ok {
				last = v
			}
		}
		return last != "" && last == name
	}
	return false
}

// renamedIdOrigName is the snake_case name of the param a rename turned into
// `id`, or "" when none was. A route has at most one such param.
func renamedIdOrigName(point map[string]any) string {
	rename, _ := point["r"].(map[string]any)
	renameParam, _ := rename["param"].(map[string]any)
	for _, src := range sortedKeys(renameParam) {
		if to, _ := renameParam[src].(string); to != "id" {
			continue
		}
		if strings.Contains(src, "_") {
			return src
		}
		var snake strings.Builder
		for _, r := range src {
			if 'A' <= r && r <= 'Z' {
				snake.WriteByte('_')
				r += 'a' - 'A'
			}
			snake.WriteRune(r)
		}
		return strings.TrimPrefix(snake.String(), "_")
	}
	return ""
}

// flowParamValue returns input[name] if present, else name with `_id`
// removed plus `01` (mirrors TS: param.n.replace(/_id/, ”) + '01').
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
// first $STRING field on the entity that is not the id, not readOnly and
// not a param of the update. The flow writes this field and then asserts
// the mark comes back, so a field the client may not send fails the step.
func firstTextField(ent, updateOp map[string]any) string {
	paramNames := map[string]bool{}
	points, _ := updateOp["points"].([]any)
	for _, pt := range points {
		point, _ := pt.(map[string]any)
		for _, pm := range pointParams(point) {
			if name, ok := pm["n"].(string); ok {
				paramNames[name] = true
			}
		}
	}

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
		if ftype == "`$STRING`" && fname != "id" && !paramNames[fname] {
			return fname
		}
	}
	return ""
}

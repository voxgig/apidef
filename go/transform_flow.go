/* Copyright (c) 2024-2025 Voxgig, MIT License */

package apidef

import (
	"fmt"
	"strings"
)

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

		if hasFileSteps(modelent) {
			fileName := "File" + Nom(entNameMap, "Name") + "Flow"
			flowMap[fileName] = map[string]any{
				"name":   fileName,
				"entity": entname,
				"kind":   "file",
				"step":   []any{},
			}
			msg += fileName + " "
		}
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

		if flowData["kind"] == "file" {
			flowData["step"] = fileSteps(opmap, entname, ent, ref01)
			msg += flowname + " "
			continue
		}

		var steps []any

		// createStep — gated on create op
		createOp, hasCreate := opmap["create"].(map[string]any)
		if hasCreate {
			point := plainPoint(createOp)
			input := map[string]any{"ref": ref01}
			step := newFlowStep("create", map[string]any{"input": input}, point)
			fillCollectionMatch(step, point, input)
			seedRelatedOpParams(opmap, step)
			steps = append(steps, step)
		}

		// listStep — gated on list op
		listOp, hasList := opmap["list"].(map[string]any)
		if hasList {
			point := plainPoint(listOp)
			step := newFlowStep("list", map[string]any{
				"valid": []any{map[string]any{
					"apply": "ItemExists",
					"def":   map[string]any{"ref": ref01},
				}},
			}, point)
			fillCollectionMatch(step, point, nil)
			steps = append(steps, step)
		}

		// The patch writes the update's mark, so the load reads back one mark.
		if updateOp, ok := opmap["update"].(map[string]any); ok {
			steps = append(steps, changeStep("update", updateOp, ent, ref01, "_up0", mark01))
		}
		if patchOp, ok := opmap["patch"].(map[string]any); ok {
			steps = append(steps, changeStep("patch", patchOp, ent, ref01, "_pt0", mark01))
		}

		// loadStep — gated on load op
		if loadOp, ok := opmap["load"].(map[string]any); ok {
			point := plainPoint(loadOp)
			input := map[string]any{
				"ref":        ref01,
				"suffix":     "_dt0",
				"srcdatavar": ref01 + "_data",
			}
			valid := []any{}
			if !markOff(steps) {
				valid = append(valid, map[string]any{
					"apply": "TextFieldMark",
					"def":   map[string]any{"mark": mark01},
				})
			}
			step := newFlowStep("load", map[string]any{
				"input": input,
				"valid": valid,
			}, point)
			fillItemMatch(step, point, input, "load", entname)
			steps = append(steps, step)
		}

		// removeStep and the post-remove listStep — gated on remove and
		// create, since a flow removes only what it created
		if removeOp, ok := opmap["remove"].(map[string]any); ok && hasCreate {
			created := stepOn(steps, "create")
			point := plainPoint(removeOp)
			input := map[string]any{
				"ref":    ref01,
				"suffix": "_rm0",
			}
			step := newFlowStep("remove", map[string]any{
				"input":  input,
				"active": created,
			}, point)
			fillItemMatch(step, point, input, "remove", entname)
			steps = append(steps, step)

			if hasList {
				listInput := map[string]any{"suffix": "_rt0"}
				listPoint := plainPoint(listOp)
				listStep := newFlowStep("list", map[string]any{
					"input": listInput,
					"valid": []any{map[string]any{
						"apply": "ItemNotExists",
						"def":   map[string]any{"ref": ref01},
					}},
					"active": stepOn(steps, "remove"),
				}, listPoint)
				fillCollectionMatch(listStep, listPoint, listInput)
				steps = append(steps, listStep)
			}
		}

		flowData["step"] = steps
		msg += flowname + " "
	}

	return &TransformResult{OK: true, Msg: msg}, nil
}

// newFlowStep mirrors ts/src/transform/flowstep.ts: a basic step moves a JSON
// record; a point whose request or response body is anything else waits,
// switched off, for steps that move files.
func newFlowStep(opname string, args map[string]any, point map[string]any) map[string]any {
	get := func(k string, def any) any {
		if v, ok := args[k]; ok && v != nil {
			return v
		}
		return def
	}
	step := map[string]any{
		"o": opname,
		"i": get("input", map[string]any{}),
		"m": get("match", map[string]any{}),
		"d": get("data", map[string]any{}),
		"s": get("spec", []any{}),
		"v": get("valid", []any{}),
	}
	if false == args["active"] || !recordPoint(point) {
		step["a"] = false
	}
	return step
}

func recordPoint(point map[string]any) bool {
	for _, key := range []string{"rb", "rs"} {
		if body, ok := point[key].(map[string]any); ok && body["kind"] != "json" {
			return false
		}
	}
	return true
}

func flowStepOf(steps []any, opname string) map[string]any {
	for _, s := range steps {
		if step, _ := s.(map[string]any); step["o"] == opname {
			return step
		}
	}
	return nil
}

func stepOn(steps []any, opname string) bool {
	step := flowStepOf(steps, opname)
	return step != nil && step["a"] != false
}

func stepOff(steps []any, opname string) bool {
	step := flowStepOf(steps, opname)
	return step != nil && step["a"] == false
}

// markOff mirrors ts/src/transform/flowstep.ts: the load checks no mark when
// the update or patch step is off and neither is on.
func markOff(steps []any) bool {
	return (stepOff(steps, "update") || stepOff(steps, "patch")) &&
		!stepOn(steps, "update") && !stepOn(steps, "patch")
}

// plainPoint mirrors ts/src/transform/flowstep.ts.
func plainPoint(mop map[string]any) map[string]any {
	points, _ := mop["points"].([]any)
	for i := len(points) - 1; 0 <= i; i-- {
		point, _ := points[i].(map[string]any)
		q, _ := point["q"].(map[string]any)
		if _, action := q["$action"]; !action {
			return point
		}
	}
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

// changeStep mirrors the update and patch steps of
// ts/src/transform/flowstep.ts: the step marks its text field.
func changeStep(opname string, op, ent map[string]any, ref, suffix, mark string) map[string]any {
	input := map[string]any{
		"ref":        ref,
		"suffix":     suffix,
		"srcdatavar": ref + "_data",
	}
	if firstTF := firstTextField(ent, op); firstTF != "" {
		input["textfield"] = firstTF
	}
	point := plainPoint(op)
	step := newFlowStep(opname, map[string]any{
		"input": input,
		"spec": []any{map[string]any{
			"apply": "TextFieldMark",
			"def":   map[string]any{"mark": mark},
		}},
	}, point)
	fillStepDataFromParams(step, point, input, opname)
	return step
}

// fillStepDataFromParams fills an update or patch step's data. The entity's
// own id is left out: the test takes it from the entity the flow created.
func fillStepDataFromParams(step, point, input map[string]any, opname string) {
	data := step["d"].(map[string]any)
	for _, pm := range pointParams(point) {
		if isEntityIdParam(point, pm, opname) {
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
	for _, opname := range []string{"list", "load", "update", "patch", "remove"} {
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
	if opname == "update" || opname == "patch" || opname == "load" || opname == "remove" {
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
// first string field, nullable or not, on the entity that is not the id, not
// readOnly and not a param of the operation. The flow writes this field and then
// asserts the mark comes back, so a field the client may not send fails the step.
func firstTextField(ent, op map[string]any) string {
	paramNames := map[string]bool{}
	points, _ := op["points"].([]any)
	for _, pt := range points {
		point, _ := pt.(map[string]any)
		for _, pm := range pointParams(point) {
			if name, ok := pm["n"].(string); ok {
				paramNames[name] = true
			}
		}
	}

	identity := identityFields(ent)

	fields, _ := ent["fields"].(map[string]any)
	for _, name := range sortedKeys(fields) {
		f := fields[name]
		fm, _ := f.(map[string]any)
		if fm == nil {
			continue
		}
		ftype, _ := nonNullType(fm["t"])
		fname, _ := fm["n"].(string)
		if ro, _ := fm["ro"].(bool); ro || fm["fo"] == "binary" {
			continue
		}
		if ftype == "`$STRING`" && !identity[fname] && !paramNames[fname] {
			return fname
		}
	}
	return ""
}

// identityFields mirrors ts/src/transform/flowstep.ts: the fields holding the
// record's identity, which a mark would overwrite.
func identityFields(ent map[string]any) map[string]bool {
	out := map[string]bool{"id": true}
	id, _ := ent["id"].(map[string]any)
	if field, ok := id["field"].(string); ok {
		out[field] = true
	}
	switch parts := id["parts"].(type) {
	case []any:
		for _, p := range parts {
			out[fmt.Sprint(p)] = true
		}
	case []string:
		for _, p := range parts {
			out[p] = true
		}
	}
	switch from := id["from"].(type) {
	case map[string]any:
		for _, w := range from {
			if where := fmt.Sprint(w); !strings.Contains(where, ".") {
				out[where] = true
			}
		}
	case map[string]string:
		for _, where := range from {
			if !strings.Contains(where, ".") {
				out[where] = true
			}
		}
	}
	return out
}

// The content rule is stated with the flow model in docs/reference/model.md.
const (
	fileBytes = 512
	fileText  = 192
)

// slotWriters mirrors ts/src/transform/flowstep.ts.
var slotWriters = []string{"update", "patch", "create"}

type fileWay struct {
	via     string
	action  string
	content string
	read    map[string]any
	write   map[string]any
	writeop string
}

// FileContent generates the content a file flow step describes.
func FileContent(content string, size, seed int) []byte {
	n := 256
	if content == "text" {
		n = 96
	}
	out := make([]byte, size)
	for i := range out {
		k := (seed + 7*(i/2)) % n
		switch {
		case content != "text":
			out[i] = byte(k)
		case k == 95:
			out[i] = '\n'
		default:
			out[i] = byte(32 + k)
		}
	}
	return out
}

func livePoints(opmap map[string]any, opname string) []map[string]any {
	op, _ := opmap[opname].(map[string]any)
	points, _ := op["points"].([]any)
	out := []map[string]any{}
	for _, p := range points {
		if point, _ := p.(map[string]any); point != nil && point["a"] != false {
			out = append(out, point)
		}
	}
	return out
}

func actionOf(point map[string]any) string {
	q, _ := point["q"].(map[string]any)
	if action, ok := q["$action"]; ok && action != nil {
		return fmt.Sprint(action)
	}
	return ""
}

func rawBody(point map[string]any, side string) (map[string]any, bool) {
	body, _ := point[side].(map[string]any)
	return body, body != nil && body["kind"] == "raw"
}

// fileWays mirrors ts/src/transform/flowstep.ts.
func fileWays(ent map[string]any) []*fileWay {
	opmap, _ := ent["op"].(map[string]any)
	slots := map[string]any{}
	bodies := map[string]any{}
	way := func(into map[string]any, via, action, content string) *fileWay {
		if found, ok := into[action].(*fileWay); ok {
			return found
		}
		found := &fileWay{via: via, action: action, content: content}
		into[action] = found
		return found
	}

	for _, point := range livePoints(opmap, "load") {
		body, raw := rawBody(point, "rs")
		if !raw {
			continue
		}
		action := actionOf(point)
		var found *fileWay
		if body["binary"] == true {
			found = way(slots, "slot", action, "bytes")
		} else {
			found = way(bodies, "body", action, "text")
		}
		if found.read == nil {
			found.read = point
		}
	}

	for _, opname := range slotWriters {
		for _, point := range livePoints(opmap, opname) {
			body, raw := rawBody(point, "rb")
			if !raw {
				continue
			}
			action := actionOf(point)
			binary := body["binary"] == true
			var found *fileWay
			if _, unnamed := slots[""]; binary && (action != "" || unnamed) {
				found = way(slots, "slot", action, "bytes")
			} else if binary {
				found = way(bodies, "body", action, "bytes")
			} else {
				found = way(bodies, "body", action, "text")
			}
			if found.write == nil {
				found.write = point
				found.writeop = opname
				if binary {
					found.content = "bytes"
				}
			}
		}
	}

	out := []*fileWay{}
	for _, action := range sortedKeys(slots) {
		out = append(out, slots[action].(*fileWay))
	}
	for _, action := range sortedKeys(bodies) {
		out = append(out, bodies[action].(*fileWay))
	}
	return out
}

func binaryFields(point map[string]any) []string {
	body, _ := point["rb"].(map[string]any)
	if body == nil || (body["kind"] != "multipart" && body["kind"] != "form") {
		return nil
	}
	fields, _ := body["fields"].([]any)
	out := []string{}
	for _, f := range fields {
		if field, _ := f.(map[string]any); field != nil && field["binary"] == true {
			out = append(out, fmt.Sprint(field["name"]))
		}
	}
	return out
}

type fieldPoint struct {
	opname string
	point  map[string]any
}

// fieldPoints mirrors ts/src/transform/flowstep.ts: the points other than
// the plain create whose multipart or form body carries a file.
func fieldPoints(opmap, create map[string]any) []fieldPoint {
	out := []fieldPoint{}
	for _, opname := range slotWriters {
		for _, point := range livePoints(opmap, opname) {
			if !samePoint(point, create) && len(binaryFields(point)) > 0 {
				out = append(out, fieldPoint{opname, point})
			}
		}
	}
	return out
}

func plainCreate(opmap map[string]any) map[string]any {
	if create, ok := opmap["create"].(map[string]any); ok {
		return plainPoint(create)
	}
	return nil
}

// hasFileSteps mirrors ts/src/transform/flowstep.ts: a session's append is
// its dialect's.
func hasFileSteps(ent map[string]any) bool {
	if ent["session"] != nil {
		return false
	}
	opmap, _ := ent["op"].(map[string]any)
	create := plainCreate(opmap)
	return len(fileWays(ent)) > 0 || len(fieldPoints(opmap, create)) > 0 ||
		(create != nil && create["a"] != false && len(binaryFields(create)) > 0)
}

// fileSteps mirrors ts/src/transform/flowstep.ts.
func fileSteps(opmap map[string]any, entname string, ent map[string]any, ref string) []any {
	ways := fileWays(ent)
	steps := []any{}
	seed := 0
	tf := 0

	transfer := func(opname string, point map[string]any, f []any, on bool) {
		step := map[string]any{
			"o": opname, "i": map[string]any{"ref": ref, "suffix": fmt.Sprintf("_tf%d", tf)},
			"m": map[string]any{}, "d": map[string]any{}, "s": []any{}, "v": []any{}, "f": f,
		}
		tf++
		fillItemMatch(step, point, nil, opname, entname)
		if !on {
			step["a"] = false
		}
		steps = append(steps, step)
	}

	put := func(via, action, content string, size int, field string) map[string]any {
		seed++
		file := map[string]any{"via": via, "action": action, "dir": "put", "content": content,
			"size": size, "seed": seed}
		if field != "" {
			file["field"] = field
		}
		return file
	}

	get := func(way *fileWay, written map[string]any) {
		content := "text"
		if way.via == "slot" {
			content = "bytes"
		}
		file := map[string]any{"via": way.via, "action": way.action, "dir": "get", "content": content}
		if written != nil && written["content"] == content {
			file["size"] = written["size"]
			file["seed"] = written["seed"]
		}
		transfer("load", way.read, []any{file}, true)
	}

	sizeOf := func(point map[string]any, content string) int {
		size := fileBytes
		if content == "text" {
			size = fileText
		}
		bn, _ := point["bn"].(map[string]any)
		if max, ok := boundOf(bn["max"]); ok && max < size {
			return max
		}
		return size
	}

	slotRead := func(name string) *fileWay {
		for _, way := range ways {
			if way.via == "slot" && way.action == name && way.read != nil {
				return way
			}
		}
		return nil
	}

	created := false
	create := plainCreate(opmap)
	var atCreate *fileWay
	for _, way := range ways {
		if create != nil && way.write != nil && samePoint(way.write, create) {
			atCreate = way
			break
		}
	}

	if create != nil {
		// An action is no plain create: the flow cannot make its record with one.
		action := actionOf(create)
		rs, _ := create["rs"].(map[string]any)
		created = action == "" && (rs == nil || rs["kind"] == "json")
		step := map[string]any{
			"o": "create", "i": map[string]any{"ref": ref},
			"m": map[string]any{}, "d": map[string]any{}, "s": []any{}, "v": []any{},
		}
		fillCollectionMatch(step, create, map[string]any{})
		seedRelatedOpParams(opmap, step)

		// The create's own raw body, whichever point its way prefers as writer.
		var own *fileWay
		rb, raw := rawBody(create, "rb")
		binary := rb["binary"] == true
		if raw {
			via := "body"
			if binary && (action != "" || slotRead("") != nil) {
				via = "slot"
			}
			for _, way := range ways {
				if way.action == action && way.via == via {
					own = way
					break
				}
			}
		}
		content := "text"
		if binary {
			content = "bytes"
		}
		f := []any{}
		if own != nil {
			f = append(f, put(own.via, action, content, sizeOf(create, content), ""))
		} else {
			for _, field := range binaryFields(create) {
				f = append(f, put("field", action, "bytes", fileBytes, field))
			}
		}
		if len(f) > 0 {
			step["f"] = f
		}
		for _, file := range f {
			if file.(map[string]any)["size"].(int) < 1 {
				created = false
			}
		}
		if !created {
			step["a"] = false
		}
		steps = append(steps, step)

		for _, file := range f {
			var way *fileWay
			if own != nil {
				if own.read != nil {
					way = own
				}
			} else {
				way = slotRead(fmt.Sprint(file.(map[string]any)["field"]))
			}
			if way != nil {
				get(way, writtenIf(created, file))
			}
		}
	}

	for _, fp := range fieldPoints(opmap, create) {
		f := []any{}
		for _, field := range binaryFields(fp.point) {
			f = append(f, put("field", actionOf(fp.point), "bytes", fileBytes, field))
		}
		transfer(fp.opname, fp.point, f, created)
		for _, file := range f {
			if way := slotRead(fmt.Sprint(file.(map[string]any)["field"])); way != nil {
				get(way, writtenIf(created, file))
			}
		}
	}

	for _, way := range ways {
		if way == atCreate {
			continue
		}
		var written map[string]any
		if way.write != nil {
			file := put(way.via, way.action, way.content, sizeOf(way.write, way.content), "")
			on := created && file["size"].(int) > 0
			transfer(way.writeop, way.write, []any{file}, on)
			written = writtenIf(on, file)
		}
		if way.read != nil {
			get(way, written)
		}
	}

	if removeOp, ok := opmap["remove"].(map[string]any); ok && create != nil {
		point := plainPoint(removeOp)
		input := map[string]any{"ref": ref, "suffix": "_rm0"}
		step := newFlowStep("remove", map[string]any{"input": input, "active": created}, point)
		fillItemMatch(step, point, input, "remove", entname)
		steps = append(steps, step)
	}

	return steps
}

func writtenIf(on bool, file any) map[string]any {
	if !on {
		return nil
	}
	written, _ := file.(map[string]any)
	return written
}

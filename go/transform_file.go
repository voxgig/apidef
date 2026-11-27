/* Copyright (c) 2026 Voxgig Ltd, MIT License */

package apidef

import (
	"sort"
	"strings"
)

// Methods that carry no body of their own.
var bodilessMethods = map[string]bool{"HEAD": true, "OPTIONS": true, "TRACE": true}

type sessionDialectDef struct {
	name    string
	media   string
	tell    string
	headers []string
}

// The tell is the header argument that, with the media type, marks the append.
var sessionDialects = []sessionDialectDef{
	{
		name:  "tus",
		media: "application/offset+octet-stream",
		tell:  "upload-offset",
		headers: []string{"tus-resumable", "upload-offset", "upload-length", "upload-defer-length",
			"upload-metadata", "upload-checksum", "upload-concat"},
	},
	{
		name:  "ietf",
		media: "application/partial-upload",
		tell:  "upload-complete",
		headers: []string{"upload-complete", "upload-incomplete", "upload-offset", "upload-length",
			"upload-limit", "upload-draft-interop-version"},
	},
}

func findDialect(name string) *sessionDialectDef {
	for i := range sessionDialects {
		if sessionDialects[i].name == name {
			return &sessionDialects[i]
		}
	}
	return nil
}

// sessionDialect mirrors ts/src/transform/file.ts.
func sessionDialect(method string, media []string, headers []string) map[string]any {
	if strings.ToUpper(method) != "PATCH" {
		return nil
	}
	types := []string{}
	for _, mt := range media {
		types = append(types, strings.ToLower(strings.TrimSpace(strings.Split(mt, ";")[0])))
	}
	var dialect *sessionDialectDef
	for i := range sessionDialects {
		if containsString(types, sessionDialects[i].media) {
			dialect = &sessionDialects[i]
			break
		}
	}
	if dialect == nil {
		return nil
	}
	names := []string{}
	own := []any{}
	for _, name := range headers {
		names = append(names, strings.ToLower(name))
		if containsString(dialect.headers, strings.ToLower(name)) {
			own = append(own, name)
		}
	}
	sort.SliceStable(own, func(i, j int) bool { return lessUTF16(own[i].(string), own[j].(string)) })
	return map[string]any{
		"dialect": dialect.name,
		"active":  containsString(names, dialect.tell),
		"own":     own,
	}
}

func sessionHeader(dialect string, name string) bool {
	d := findDialect(dialect)
	return d != nil && containsString(d.headers, strings.ReplaceAll(strings.ToLower(name), "_", "-"))
}

// binarySlot mirrors ts/src/transform/file.ts.
func binarySlot(def map[string]any, pathStr string, methods []string, record any, action string) map[string]any {
	sending := []string{}
	for _, method := range methods {
		if m := strings.ToUpper(method); !bodilessMethods[m] {
			sending = append(sending, m)
		}
	}
	chosen, alternative := false, false
	for _, method := range sending {
		for _, body := range []map[string]any{requestBody(def, method, pathStr, ""), responseBody(def, method, pathStr, "")} {
			if body == nil {
				continue
			}
			if body["binary"] == true {
				chosen = true
			}
			alts, _ := body["alternatives"].([]any)
			for _, alt := range alts {
				if am, _ := alt.(map[string]any); am["binary"] == true {
					alternative = true
				}
			}
		}
	}
	if !chosen && !alternative {
		return nil
	}

	slot := map[string]any{}
	if !chosen {
		slot["active"] = false
		slot["why_inactive"] = "binary-alternative"
	}

	props := mergedProperties(record)
	for _, name := range sortedKeys(props) {
		if fieldName(name) == action && !binarySchema(props[name]) {
			slot["field"] = fieldName(name)
			break
		}
	}

	for _, method := range methods {
		if strings.ToUpper(method) == "HEAD" {
			slot["head"] = true
		}
	}

	bounds := []int{}
	for _, method := range sending {
		bounds = append(bounds, binaryBounds(def, method, pathStr)...)
	}
	if 0 < len(bounds) {
		least := bounds[0]
		for _, bound := range bounds[1:] {
			if bound < least {
				least = bound
			}
		}
		slot["max"] = least
	}

	return slot
}

// pointBinary mirrors ts/src/transform/file.ts.
func pointBinary(method string, rb map[string]any, rs map[string]any, binary map[string]any) map[string]any {
	if binary == nil || !guideActive(binary) || !(rb["binary"] == true || rs["binary"] == true) {
		return nil
	}
	bn := map[string]any{}
	if field, ok := binary["field"].(string); ok && field != "" {
		bn["field"] = field
	}
	if binary["head"] == true && strings.ToUpper(method) == "GET" {
		bn["head"] = true
	}
	if bound, ok := boundOf(binary["max"]); ok {
		bn["max"] = bound
	}
	if len(bn) == 0 {
		return nil
	}
	return bn
}

// markFileSlots mirrors ts/src/transform/file.ts: guide stage, each action
// whose route moves bytes gets its binary entry.
func markFileSlots(guide map[string]any, def map[string]any, recordOf func(entity map[string]any) any) {
	entities, _ := guide["entity"].(map[string]any)
	for _, ename := range sortedKeys(entities) {
		entity, _ := entities[ename].(map[string]any)
		paths, _ := entity["path"].(map[string]any)
		for _, pathStr := range sortedKeys(paths) {
			gpath, _ := paths[pathStr].(map[string]any)
			ops, _ := gpath["op"].(map[string]any)
			methods := []string{}
			for _, opname := range sortedKeys(ops) {
				op, _ := ops[opname].(map[string]any)
				methods = append(methods, safeStr(op["method"]))
			}
			actions, _ := gpath["action"].(map[string]any)
			for _, actname := range sortedKeys(actions) {
				slot := binarySlot(def, pathStr, methods, recordOf(entity), actname)
				if slot == nil {
					continue
				}
				actdesc, _ := actions[actname].(map[string]any)
				if actdesc == nil {
					actdesc = map[string]any{}
					actions[actname] = actdesc
				}
				actdesc["binary"] = slot
			}
		}
	}
}

// markSessions mirrors ts/src/transform/file.ts: guide stage, an entity whose
// append speaks a dialect is a session, switched off on the media type alone.
func markSessions(guide map[string]any, def map[string]any) {
	entities, _ := guide["entity"].(map[string]any)
	defPaths, _ := def["paths"].(map[string]any)
	for _, ename := range sortedKeys(entities) {
		entity, _ := entities[ename].(map[string]any)
		var found map[string]any
		paths, _ := entity["path"].(map[string]any)
		for _, pathStr := range sortedKeys(paths) {
			gpath, _ := paths[pathStr].(map[string]any)
			pathdef, _ := defPaths[pathStr].(map[string]any)
			ops, _ := gpath["op"].(map[string]any)
			for _, opname := range sortedKeys(ops) {
				op, _ := ops[opname].(map[string]any)
				method := strings.ToUpper(safeStr(op["method"]))
				opdef, _ := pathdef[strings.ToLower(method)].(map[string]any)
				headers := []string{}
				for _, param := range routeParams(pathdef, opdef) {
					pm, _ := param.(map[string]any)
					if name, ok := pm["name"].(string); ok && pm["in"] == "header" {
						headers = append(headers, name)
					}
				}
				match := sessionDialect(method, requestMedia(def, method, pathStr), headers)
				if match == nil || (found != nil && (found["active"] != false || match["active"] != true)) {
					continue
				}
				found = map[string]any{}
				if match["active"] != true {
					found["active"] = false
					found["why_inactive"] = "no-" + findDialect(safeStr(match["dialect"])).tell
				}
				found["dialect"] = match["dialect"]
				found["path"] = pathStr
				found["append"] = opname
				for _, name := range sortedKeys(ops) {
					other, _ := ops[name].(map[string]any)
					if strings.ToUpper(safeStr(other["method"])) == "GET" {
						found["offset"] = name
						break
					}
				}
			}
		}
		if found != nil {
			entity["session"] = found
		}
	}
}

// modelOpOf is the model op that holds the guide op's point on the route.
func modelOpOf(ment map[string]any, gpath map[string]any, pathStr string, gopname any) string {
	name, ok := gopname.(string)
	if !ok {
		return ""
	}
	gops, _ := gpath["op"].(map[string]any)
	gop, _ := gops[name].(map[string]any)
	method := strings.ToUpper(safeStr(gop["method"]))
	ops, _ := ment["op"].(map[string]any)
	for _, opname := range sortedKeys(ops) {
		op, _ := ops[opname].(map[string]any)
		points, _ := op["points"].([]any)
		for _, pv := range points {
			point, _ := pv.(map[string]any)
			if point["o"] == pathStr && strings.ToUpper(safeStr(point["m"])) == method {
				return opname
			}
		}
	}
	return ""
}

// applySession mirrors ts/src/transform/file.ts: the session's own headers
// are its runtime's to send, so they leave the caller's arguments.
func applySession(guide map[string]any, entname string, ment map[string]any) {
	gents, _ := guide["entity"].(map[string]any)
	gent, _ := gents[entname].(map[string]any)
	gsession, _ := gent["session"].(map[string]any)
	dialect := safeStr(gsession["dialect"])
	if gsession == nil || !guideActive(gsession) || findDialect(dialect) == nil {
		return
	}
	pathStr := safeStr(gsession["path"])
	gpaths, _ := gent["path"].(map[string]any)
	gpath, _ := gpaths[pathStr].(map[string]any)
	appendOp := modelOpOf(ment, gpath, pathStr, gsession["append"])
	if appendOp == "" {
		return
	}
	offsetOp := modelOpOf(ment, gpath, pathStr, gsession["offset"])

	session := map[string]any{"dialect": dialect, "append": appendOp}
	if offsetOp != "" {
		session["offset"] = offsetOp
	}
	slot, _ := gsession["slot"].(map[string]any)
	slotEntity, eok := slot["entity"].(string)
	slotAction, aok := slot["action"].(string)
	if eok && aok {
		session["slot"] = map[string]any{"entity": slotEntity, "action": slotAction}
	}
	ment["session"] = session

	ops, _ := ment["op"].(map[string]any)
	for _, opname := range []string{appendOp, offsetOp} {
		op, _ := ops[opname].(map[string]any)
		points, _ := op["points"].([]any)
		for _, pv := range points {
			point, _ := pv.(map[string]any)
			if point["o"] != pathStr {
				continue
			}
			args, _ := point["g"].(map[string]any)
			headers, _ := args["header"].([]any)
			for _, av := range headers {
				arg, _ := av.(map[string]any)
				name, ok := arg["or"].(string)
				if !ok {
					name = safeStr(arg["n"])
				}
				if arg != nil && sessionHeader(dialect, name) {
					arg["a"] = false
				}
			}
		}
	}
}

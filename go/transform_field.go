/* Copyright (c) 2024-2025 Voxgig, MIT License */

package apidef

import (
	"fmt"
	"sort"
	"strings"
)

// FieldTransform extracts and infers entity fields from operations.
func FieldTransform(ctx *ApiDefContext) (*TransformResult, error) {
	kit := getKit(ctx)
	def := ctx.Def
	entityMap := kit["entity"].(map[string]any)

	msg := "field "
	opFieldPrecedence := []string{"load", "create", "update", "patch", "list"}

	for _, entname := range sortedKeys(entityMap) {
		ment := entityMap[entname]
		mentMap, _ := ment.(map[string]any)
		if mentMap == nil {
			continue
		}

		var fields []any
		seen := map[string]map[string]any{}
		opMap, _ := mentMap["op"].(map[string]any)

		for _, opname := range opFieldPrecedence {
			mop, ok := opMap[opname].(map[string]any)
			if !ok || mop == nil {
				continue
			}
			points, _ := mop["points"].([]any)
			for _, pt := range points {
				mtarget, _ := pt.(map[string]any)
				if mtarget == nil {
					continue
				}
				opfields := resolveOpFields(mtarget, def, opname)
				for _, opfield := range opfields {
					name, _ := opfield["name"].(string)
					if existing, exists := seen[name]; !exists {
						fields = append(fields, opfield)
						seen[name] = opfield
					} else {
						// Mirrors src/transform/field.ts mergeField: when the
						// same field appears under another op with a
						// different `req`, record the per-op override on the
						// merged field's `op` map.
						newReq, _ := opfield["req"].(bool)
						existReq, _ := existing["req"].(bool)
						if newReq != existReq {
							opOverrides, _ := existing["op"].(map[string]any)
							if opOverrides == nil {
								opOverrides = map[string]any{}
								existing["op"] = opOverrides
							}
							opOverrides[opname] = map[string]any{
								"req":  newReq,
								"type": opfield["type"],
							}
						}
						// Field identity is first-writer-wins, but a
						// DESCRIPTION is not part of identity: the op that
						// first names a field is often not the one that
						// documents it. First non-empty wins.
						if _, has := existing["short"]; !has {
							if short, ok := opfield["short"]; ok {
								existing["short"] = short
							}
						}
						// The spec facts merge the same way, and for the same
						// reason: one schema annotates the field and another
						// references it bare, so the first declaration in
						// precedence order is what finds the annotation.
						//
						// The order puts `load` first, which is the safe
						// direction: a field a response marks readOnly and a
						// request body also lists is a self-contradictory
						// spec, and this believes the restriction.
						// Mirrors src/transform/field.ts.
						for _, flag := range []string{
							"readOnly", "writeOnly", "deprecated", "format",
						} {
							if _, has := existing[flag]; !has {
								if v, ok := opfield[flag]; ok {
									existing[flag] = v
								}
							}
						}
					}
				}
			}
		}

		// Sort fields by name
		sort.Slice(fields, func(i, j int) bool {
			fi, _ := fields[i].(map[string]any)
			fj, _ := fields[j].(map[string]any)
			ni, _ := fi["name"].(string)
			nj, _ := fj["name"].(string)
			return ni < nj
		})

		mentMap["fields"] = fields

		// COMPOSITE IDENTITY. Mirrors src/transform/field.ts compositeId.
		//
		// Set here rather than in EntityTransform (where the rest of the id
		// descriptor is built) because this needs the entity's POINTS, and
		// those do not exist until OperationTransform has run. TS reaches the
		// same place for the same reason.
		{
			var gent map[string]any
			if guide, ok := ctx.Guide["entity"].(map[string]any); ok && guide != nil {
				gent, _ = guide[entname].(map[string]any)
			}

			parts, sep := compositeId(mentMap, gent)
			singleKey := compositeIdSingle(mentMap, gent)

			// THE DESCRIPTOR IS NOT UNCONDITIONAL. Mirrors the four
			// conditions at the end of src/transform/field.ts: an id field,
			// composite parts, a guide-corrected single key, or an entity
			// addressed by an `id` PARAMETER. An entity with none of those
			// gets no descriptor — petstore's `store` is one, and Go emitted
			// an `id: { field: id, name: id }` that TS does not, so every
			// downstream generator saw a key the API has no route for.
			//
			// EntityTransform used to initialise it here, which is why this
			// port never implemented the decision at all.
			fields, _ := mentMap["fields"].([]any)
			var idField map[string]any
			for _, fv := range fields {
				f, _ := fv.(map[string]any)
				if f == nil {
					continue
				}
				if n, _ := f["name"].(string); "id" == n {
					idField = f
					break
				}
			}

			sortFields := func(fs []any) []any {
				sort.Slice(fs, func(i, j int) bool {
					fi, _ := fs[i].(map[string]any)
					fj, _ := fs[j].(map[string]any)
					ni, _ := fi["name"].(string)
					nj, _ := fj["name"].(string)
					return ni < nj
				})
				return fs
			}

			syntheticId := func() {
				fields = append(fields, map[string]any{
					"name": "id",
					"type": "`$STRING`",
					"req":  false,
				})
				mentMap["fields"] = sortFields(fields)
			}

			descriptor := func() {
				id := map[string]any{"name": "id", "field": "id"}
				if 1 < len(parts) {
					partsAny := make([]any, len(parts))
					for i, p := range parts {
						partsAny[i] = p
					}
					id["parts"] = partsAny
					id["sep"] = sep
					if from := compositeIdFrom(mentMap, gent, parts, ctx.Def); 0 < len(from) {
						id["from"] = from
					}
				}
				mentMap["id"] = id
			}

			// A COMPOSITE ENTITY NEED NOT EXPOSE AN `id`, and the field
			// goes in as well as the descriptor: github's repo response
			// carries `owner` and `name`, never `id`, and a descriptor
			// without a field makes the generated type disagree with the
			// generated test.
			if 1 < len(parts) && idField == nil {
				syntheticId()
				fields, _ = mentMap["fields"].([]any)
			}

			// The guide disabled composite; the terminal parameter is the
			// key, and the entity needs the field to carry it for the same
			// reason the composite branch does.
			if idField == nil && "" != singleKey && 1 >= len(parts) {
				syntheticId()
				fields, _ = mentMap["fields"].([]any)
			}

			if idField != nil || 1 < len(parts) || "" != singleKey {
				descriptor()
			} else if addressedById(mentMap) {
				// ADDRESSABLE BY ID WITHOUT DECLARING ONE AS A FIELD — the
				// field as well as the descriptor, because an entity
				// addressed by id has one at runtime and a descriptor
				// without a field makes the generated type disagree with the
				// generated test.
				syntheticId()
				fields, _ = mentMap["fields"].([]any)
				descriptor()
			} else {
				delete(mentMap, "id")
			}

			if 1 < len(parts) {

				// THE FIELD THE DESCRIPTOR POINTS AT, mirroring the TS port.
				//
				// A composite entity need not expose an `id` of its own —
				// github's repo response carries `owner` and `name`, not
				// `id`. Attaching the metadata while leaving `fields` without
				// the field made the descriptor name something that does not
				// exist, so Go-generated types diverged from TS for the
				// primary {owner}/{repo} case.
				//
				// And where an `id` DOES exist it is typically the API's own
				// numeric id, while the composite identity is a joined
				// string, so the declaration is corrected — along with the
				// spec facts that described the old type, which would
				// otherwise contradict it.
				if idField == nil {
					// Already pushed above where the descriptor was decided.
				} else if !strings.Contains(
					strings.ToUpper(fmt.Sprint(idField["type"])), "STRING") {
					// THE API'S OWN id MOVES ASIDE, it is not rewritten —
					// mirroring the canonical TS branch. `id` must hold the
					// joined string, and the spec's numeric property must
					// survive with its type, format and per-op metadata, so
					// it is copied to `<api>_id` and the alias map records
					// where it went. Overwriting in place (what this did)
					// lost an API field outright and diverged from TS.
					apiname := "api"
					if model, ok := ctx.Model["name"].(string); ok && "" != model {
						apiname = model
					}
					keep := apiname + "_id"

					if !hasField(fields, keep) {
						// A DEEP COPY: the deletions below run on the
						// original, and a shallow one shares the `op` map, so
						// the preserved field would lose the very metadata it
						// exists to keep.
						moved := deepCopyMap(idField)
						moved["name"] = keep
						fields = append(fields, moved)

						alias, _ := mentMap["alias"].(map[string]any)
						if alias == nil {
							alias = map[string]any{}
							mentMap["alias"] = alias
						}
						aliasField, _ := alias["field"].(map[string]any)
						if aliasField == nil {
							aliasField = map[string]any{}
							alias["field"] = aliasField
						}
						aliasField[keep] = "id"

						sort.Slice(fields, func(i, j int) bool {
							fi, _ := fields[i].(map[string]any)
							fj, _ := fields[j].(map[string]any)
							ni, _ := fi["name"].(string)
							nj, _ := fj["name"].(string)
							return ni < nj
						})
						mentMap["fields"] = fields
					}

					idField["type"] = "`$STRING`"
					delete(idField, "format")
					if opOverrides, ok := idField["op"].(map[string]any); ok {
						for _, on := range sortedKeys(opOverrides) {
							if ov, ok := opOverrides[on].(map[string]any); ok {
								delete(ov, "type")
							}
						}
					}
				}
			}
		}

		msg += entname + " "
	}

	return &TransformResult{OK: true, Msg: msg}, nil
}

// hasField reports whether a field of that name is already present.
func hasField(fields []any, name string) bool {
	for _, fv := range fields {
		if f, _ := fv.(map[string]any); f != nil {
			if n, _ := f["name"].(string); n == name {
				return true
			}
		}
	}
	return false
}

// deepCopyMap copies a field map and its nested maps, so a later deletion on
// the original cannot reach the copy.
func deepCopyMap(in map[string]any) map[string]any {
	out := map[string]any{}
	for k, v := range in {
		if nested, ok := v.(map[string]any); ok {
			out[k] = deepCopyMap(nested)
		} else {
			out[k] = v
		}
	}
	return out
}

// IdSep joins a composite id into one string. A forward slash cannot occur
// inside a single path segment — a literal slash in a value arrives
// percent-encoded — so the join is never ambiguous and the split never
// over-splits. Mirrors ID_SEP in src/transform/field.ts.
const IdSep = "/"

// IdOps are the ops that address ONE record, most authoritative first. Only a
// tie-break: identityParams compares candidates from all of them.
var IdOps = []string{"load", "update", "patch", "remove"}

// compositeId returns the composite parts and separator for an entity, or an
// empty slice for the ordinary single-key case. An explicit `id: parts` in
// guide.aon wins over the inference, and an empty list turns it off —
// adjacency cannot tell a compound key from a trailing modifier such as
// github's `{artifact_id}/{archive_format}`. Mirrors src/transform/field.ts
// compositeId.
// WHAT `gent` CAN ACTUALLY CARRY IN THIS PORT. ctx.Guide is built from the
// heuristic base guide alone: BuildGuide calls checkGuideOverlay, which
// REFUSES the build outright when a project overlay is present, because
// there is no Go aontu to apply it and silently emitting a model that
// disagrees with the TS one is the worse failure. So an `id:` block stated in
// guide.aon does not reach here — the build stops before it could.
//
// The override is read anyway, and deliberately: it keeps the two ports'
// logic identical, so the day Go can apply an overlay this needs no change,
// and a caller that constructs ctx.Guide itself (as the tests do) gets the
// documented behaviour today.
// singleKeyOf picks WHICH of several adjacent parameters is the record's own
// key, by the same id-finding rules apidef uses elsewhere rather than by
// position. Taking the terminal one picked `archive_format` for
// `/artifacts/{artifact_id}/{archive_format}` — the modifier, precisely the
// false positive a `composite: false` correction exists to undo.
// Mirrors singleKeyOf in src/transform/field.ts.
func singleKeyOf(mentMap map[string]any, parts []string) string {
	if 0 == len(parts) {
		return ""
	}

	name, _ := mentMap["name"].(string)

	for _, p := range parts {
		if "id" == p {
			return p
		}
	}
	for _, p := range parts {
		if name+"_id" == p {
			return p
		}
	}
	for _, p := range parts {
		if strings.HasSuffix(p, "_id") {
			return p
		}
	}

	return parts[len(parts)-1]
}

// addressedById reports whether any of the entity's own points declares an
// `id` parameter — i.e. the API addresses this entity by id, whether or not
// its response schema declares an id field. Mirrors addressedById in
// src/transform/field.ts.
func addressedById(mentMap map[string]any) bool {
	opMap, _ := mentMap["op"].(map[string]any)

	for _, opname := range sortedKeys(opMap) {
		mop, _ := opMap[opname].(map[string]any)
		if mop == nil {
			continue
		}
		points, _ := mop["points"].([]any)
		for _, pt := range points {
			ptMap, _ := pt.(map[string]any)
			if ptMap == nil {
				continue
			}
			args, _ := ptMap["args"].(map[string]any)
			if args == nil {
				continue
			}
			for _, p := range argsParamList(args["params"]) {
				if n, _ := p["name"].(string); "id" == n {
					return true
				}
			}
		}
	}

	return false
}

// argsParamList reads a point's `args.params` in either shape the pipeline
// produces: a name-keyed map, or a list.
func argsParamList(raw any) []map[string]any {
	var out []map[string]any

	switch v := raw.(type) {
	case map[string]any:
		for _, k := range sortedKeys(v) {
			if p, ok := v[k].(map[string]any); ok {
				out = append(out, p)
			}
		}
	case []any:
		for _, e := range v {
			if p, ok := e.(map[string]any); ok {
				out = append(out, p)
			}
		}
	}

	return out
}

// compositeIdSingle is compositeId's other answer: the ONE key a
// `composite: false` correction leaves in place. TS returns it as
// `{ single }` from the same function; Go keeps the signatures separate
// because a Go caller cannot destructure.
func compositeIdSingle(mentMap map[string]any, gent map[string]any) string {
	var gid map[string]any
	if gent != nil {
		gid, _ = gent["id"].(map[string]any)
	}
	if gid == nil {
		return ""
	}
	if c, ok := gid["composite"].(bool); ok && !c {
		return singleKeyOf(mentMap, identityParams(mentMap))
	}

	return ""
}

func compositeId(mentMap map[string]any, gent map[string]any) ([]string, string) {
	var gid map[string]any
	if gent != nil {
		gid, _ = gent["id"].(map[string]any)
	}

	sep := IdSep
	if gid != nil {
		if s, ok := gid["sep"].(string); ok && "" != s {
			sep = s
		}
	}

	if gid != nil {
		// `composite: false` turns the inference off. A boolean rather than an
		// empty `parts`, because aontu resolves an empty list to nothing.
		if c, ok := gid["composite"].(bool); ok && !c {
			return nil, sep
		}
		if raw, has := gid["parts"]; has && raw != nil {
			given := []string{}
			if list, ok := raw.([]any); ok {
				for _, p := range list {
					if ps, ok := p.(string); ok && "" != ps {
						given = append(given, ps)
					}
				}
			}
			if 1 < len(given) {
				return given, sep
			}
			return nil, sep
		}
	}

	return identityParams(mentMap), sep
}

// compositeIdFrom answers where each part lives in a response, with any
// guide-stated mapping winning PER PART — so a spec can correct one without
// restating the others, which matters because the heuristic gets most of them
// right and the odd one wrong. Mirrors the `withFrom` closure in
// src/transform/field.ts compositeId.
func compositeIdFrom(
	mentMap map[string]any, gent map[string]any,
	parts []string, def map[string]any,
) map[string]any {
	derived := identityFrom(mentMap, parts, def)

	var stated map[string]any
	if gent != nil {
		if gid, ok := gent["id"].(map[string]any); ok && gid != nil {
			stated, _ = gid["from"].(map[string]any)
		}
	}

	out := map[string]any{}
	for _, part := range parts {
		if say, ok := stated[part].(string); ok && "" != say {
			out[part] = say
			continue
		}
		if use, ok := derived[part]; ok {
			out[part] = use
		}
	}

	return out
}

// pointSegmentMaps reads a point's path segments, accepting both shapes the
// pipeline produces: []map[string]any from OperationTransform, and []any from
// the guide-derived descriptors.
func pointSegmentMaps(point map[string]any) []map[string]any {
	if typed, ok := point["segments"].([]map[string]any); ok {
		return typed
	}

	loose, _ := point["segments"].([]any)
	out := make([]map[string]any, 0, len(loose))
	for _, seg := range loose {
		if segMap, _ := seg.(map[string]any); segMap != nil {
			out = append(out, segMap)
		}
	}
	return out
}

// scalarFieldType reports whether a model field's canon type can be a path
// segment. Mirrors scalarField in src/transform/field.ts.
func scalarFieldType(f map[string]any) bool {
	t := strings.ToUpper(fmt.Sprint(f["type"]))
	return !strings.Contains(t, "OBJECT") && !strings.Contains(t, "ARRAY") &&
		!strings.Contains(t, "MAP") && !strings.Contains(t, "LIST")
}

// identityParams returns the ordered path parameters that address ONE record
// of this entity, read from the op that names a single record and never from
// `list` (whose path params are the entity's parents, not its identity).
// Mirrors src/transform/field.ts identityParams.
func identityParams(mentMap map[string]any) []string {
	opMap, _ := mentMap["op"].(map[string]any)
	if opMap == nil {
		return nil
	}

	type cand struct {
		run   []string
		scope int
		// own: the run ends in the record's own key. This transform RENAMES
		// that parameter to `id`, so such a run is the port's own statement
		// of what identifies the record, and the composite inference must
		// not contradict it. Narrow on purpose: `id` or an unrenamed
		// `<entity>_id`, never any `*_id`.
		own   bool
		order int
	}

	entname, _ := mentMap["name"].(string)

	// EVERY ID-BEARING OP AT ONCE, not the first one that offers a candidate.
	//
	// These ops all address a single record, so all describe the same
	// identity — but they do not all carry the same routes. gitlab's
	// `project` has /api/v4/projects/{id} under `remove` alone, while its
	// `load` carries only sub-resources like
	// /api/v4/projects/{id}/uploads/{secret}/{filename}. Stopping at the
	// first op with any candidate therefore made a PROJECT identified by
	// `secret/filename`. The op order is now only a tie-break.
	var cands []cand

	for order, opname := range IdOps {
		mop, ok := opMap[opname].(map[string]any)
		if !ok || mop == nil {
			continue
		}

		allPoints, _ := mop["points"].([]any)

		for _, pt := range allPoints {
			ptMap, _ := pt.(map[string]any)
			if ptMap == nil {
				continue
			}
			// Action points are verbs dispatched by `$action`, not addresses.
			if sel, ok := ptMap["select"].(map[string]any); ok && sel != nil {
				if _, has := sel["$action"]; has {
					continue
				}
			}

			run := trailingVars(ptMap)
			if 0 == len(run) {
				continue
			}

			segs := pointSegmentMaps(ptMap)
			last := run[len(run)-1]

			cands = append(cands, cand{
				run: run,
				// Segments BEFORE the run: how much parent scope the route
				// needs.
				scope: len(segs) - len(run),
				own:   "id" == last || entname+"_id" == last,
				order: order,
			})
		}
	}

	// WHICH ROUTE IS THE RECORD'S OWN ADDRESS. Mirrors the canonical TS
	// comment in src/transform/field.ts, which records the three rules that
	// were measured against the validation corpus and why each is wrong.
	// What separates them is PARENT SCOPE: the record's own route is the
	// least-qualified one that names it, and among equally-qualified routes
	// the one carrying the fullest key.
	var best *cand
	for i := range cands {
		c := cands[i]
		if best == nil {
			best = &cands[i]
			continue
		}
		if c.scope != best.scope {
			if c.scope < best.scope {
				best = &cands[i]
			}
			continue
		}
		if c.own != best.own {
			if c.own {
				best = &cands[i]
			}
			continue
		}
		if len(c.run) != len(best.run) {
			if len(best.run) < len(c.run) {
				best = &cands[i]
			}
			continue
		}
		if c.order < best.order {
			best = &cands[i]
		}
	}

	if best == nil {
		return nil
	}

	return best.run
}

// trailingVars walks back from a point's end, collecting variables until a
// literal stops the run. That literal is the sub-collection boundary;
// anything before it scopes this record rather than naming it.
//
// SEGMENTS ARE []map[string]any HERE, which is what OperationTransform
// stores (transform_operation.go); pointSegmentMaps accepts the []any shape
// the guide-derived descriptors use too. Asserting one alone yielded nil for
// every route, so the walk found no parts and Go inferred no composite
// identity at all — silently, with every existing test still passing.
func trailingVars(ptMap map[string]any) []string {
	segs := pointSegmentMaps(ptMap)
	var run []string

	for i := len(segs) - 1; 0 <= i; i-- {
		v, has := segs[i]["var"]
		if !has || v == nil {
			break
		}
		run = append([]string{fmt.Sprint(v)}, run...)
	}

	return run
}

func resolveOpFields(mtarget map[string]any, def map[string]any, opname string) []map[string]any {
	var mfields []map[string]any
	fielddefs := findFieldDefs(mtarget, def, opname)

	for _, fielddef := range fielddefs {
		// Field names are WIRE identifiers — see CanonizeField. Using the
		// entity-name canonizer here renamed modelType -> model_type and
		// items -> item, so the SDK read keys the server never sends.
		name := CanonizeField(NormalizeFieldName(fielddef["key$"].(string)))
		// Pass the raw value: a 3.1 nullable field carries a type ARRAY, and
		// asserting to string here would drop it to "" and lose the union.
		ftype := fielddef["type"]
		mfield := map[string]any{
			"name":   name,
			"type":   InferFieldType(name, Validator(ftype)),
			"req":    toBool(fielddef["required"]),
			"active": true,
			"op":     map[string]any{},
		}
		// Carry the spec's own words for the field, when it has any.
		// Mirrors src/transform/field.ts. Trimmed, and only when it is a
		// non-empty string: a whitespace or non-string value would put a
		// meaningless cell where an empty one is honest.
		if fdesc, ok := fielddef["description"].(string); ok {
			// ONE LINE, not the whole description — see src/transform/field.ts.
			// Generated Readmes interpolate this into a markdown table cell.
			if trimmed := FirstSentence(fdesc); trimmed != "" {
				mfield["short"] = trimmed
			}
		}

		// SPEC FACTS ABOUT THE FIELD, carried through verbatim.
		// Mirrors src/transform/field.ts.
		//
		// ONLY WHEN THE SPEC SAYS SO, and for the booleans only when TRUE.
		// Each defaults to false in OpenAPI, so an absent key and an explicit
		// false carry the same information; emitting the false ones would add
		// a key to every field of every model and say nothing.
		for _, flag := range []string{"readOnly", "writeOnly", "deprecated"} {
			if b, ok := fielddef[flag].(bool); ok && b {
				mfield[flag] = true
			}
		}

		// `format` is an open vocabulary — OpenAPI defines a handful and lets
		// a spec coin its own — so it is carried as the string it is rather
		// than interpreted here.
		if ffmt, ok := fielddef["format"].(string); ok {
			if trimmed := strings.TrimSpace(ffmt); trimmed != "" {
				mfield["format"] = trimmed
			}
		}

		// Record an untagged union under this field. The field is already
		// typed openly because there is nothing to narrow it to; this says
		// WHY, so the generated docs can explain the open type instead of
		// leaving it looking like a modelling failure.
		if union := ScanUntaggedUnion(fielddef); union != nil {
			mfield["union"] = map[string]any{
				"count":    union.Count,
				"branches": union.Branches,
				"depth":    union.Depth,
			}
		}
		mfields = append(mfields, mfield)
	}
	return mfields
}

func findFieldDefs(mtarget map[string]any, def map[string]any, opname string) []map[string]any {
	var fielddefs []map[string]any
	defPaths, _ := def["paths"].(map[string]any)
	orig, _ := mtarget["orig"].(string)
	method, _ := mtarget["method"].(string)

	pathdef, _ := defPaths[orig].(map[string]any)
	if pathdef == nil {
		return fielddefs
	}

	methodLower := toLower(method)
	opdef, _ := pathdef[methodLower].(map[string]any)
	if opdef == nil {
		return fielddefs
	}

	responses, _ := opdef["responses"].(map[string]any)
	requestBody, _ := opdef["requestBody"].(map[string]any)

	var fieldSets any

	// Mirrors src/transform/field.ts:117-144. Key invariants:
	//   - Default lookup is the 200 schema; we do NOT fall back to 201 for
	//     arbitrary methods, otherwise create/post ops collect response
	//     fields that TS leaves out (TS only sees 200, which is missing here).
	//   - The list branch unwraps array wrappers, with a 201-items fallback
	//     when no unwrap is possible.
	//   - PUT (method override 'put') falls back to 201 if 200 is absent.
	if responses != nil {
		fieldSets = getFieldResponseSchema(responses, "200")
		if opname == "list" {
			if unwrapped := unwrapArrayWrapper(fieldSets); unwrapped != nil {
				fieldSets = unwrapped
			} else {
				if fromCreated := getFieldResponseSchemaItems(responses, "201"); fromCreated != nil {
					fieldSets = fromCreated
				}
			}
		} else if methodLower == "put" && fieldSets == nil {
			fieldSets = getFieldResponseSchema(responses, "201")
		}

		// Single-entity responses get the same treatment the list branch above
		// already gives collections: a body that is only an envelope around
		// the entity — `{item: {...}}` — describes the WRAPPER, not the
		// entity, so its sole property would otherwise be harvested as a
		// field. That is how an entity `todoitem` ended up with a required
		// `item` field of type object, which then appeared in the generated
		// create/update data types. envelopeProp applies the same two rules
		// used to pick the response transform, so the field list and the
		// transform agree. Mirrors src/transform/field.ts.
		if opname != "list" {
			if fsmap, ok := fieldSets.(map[string]any); ok {
				props, _ := fsmap["properties"].(map[string]any)
				if envelope := envelopeProp(props, opname); envelope != "" {
					fieldSets = props[envelope]
				}
			}
		}
	}

	// A QUERY (RFC 10008) request body is a filter/query schema, not the
	// entity shape, so it must not contribute entity fields. Fields for a
	// QUERY op come from its response only.
	if requestBody != nil && methodLower != "query" {
		// Mirrors src/transform/field.ts. TS unconditionally wraps
		// fieldSets in an array when requestBody is present, even if the
		// JSON schema lookup returns undefined. The wrapping is what stops
		// the subsequent reshape (.allOf / .properties) from descending into
		// a response wrapper like MessageResponse — once fieldSets is an
		// array, neither check fires, so each-iteration only sees per-item
		// `properties` (which an allOf-only schema doesn't have).
		reqSchema := getFieldRequestBodySchema(requestBody)
		fieldSets = []any{fieldSets, reqSchema}
	}

	// Mirrors src/transform/field.ts:155-173.
	// TS reshapes fieldSets, then `each(fieldSets, fieldSet => each(fieldSet?.properties, ...))`.
	//   - `each` over an array iterates elements.
	//   - `each` over an object iterates values (sorted by key).
	// So when fieldSets is e.g. `{type: "array", items: <schema>}` neither
	// allOf nor top-level properties trigger a reshape, but the object-each
	// still surfaces the inner `items` schema's properties — which is how
	// non-list ops with array responses still produce fields.
	if fieldSets != nil {
		extractFieldsTopLevel(fieldSets, &fielddefs)
	}

	// Fallback: infer from examples
	if len(fielddefs) == 0 {
		exampleFields := inferFieldsFromExamples(opdef)
		fielddefs = append(fielddefs, exampleFields...)
	}

	return fielddefs
}

// unwrapArrayWrapper inspects a list-response schema and, when it is an
// object with a single array-of-object-schema property (e.g.
// { boards: [Board] } or { items: [Foo], page, total, ... }), returns
// the inner item schema. Returns nil if the input is not unambiguously
// such a wrapper. Mirrors src/transform/field.ts unwrapArrayWrapper.
func unwrapArrayWrapper(schema any) any {
	m, ok := schema.(map[string]any)
	if !ok || m == nil {
		return nil
	}
	// Direct list shape — { type: array, items: ... }
	if t, _ := m["type"].(string); t == "array" {
		if items, ok := m["items"].(map[string]any); ok {
			if hasResolvableProperties(items) {
				return items
			}
		}
		return nil
	}
	props, ok := m["properties"].(map[string]any)
	if !ok || props == nil {
		return nil
	}
	var resolved any
	for _, key := range sortedKeys(props) {
		prop, ok := props[key].(map[string]any)
		if !ok || prop == nil {
			continue
		}
		if t, _ := prop["type"].(string); t != "array" {
			continue
		}
		items, ok := prop["items"].(map[string]any)
		if !ok || items == nil {
			continue
		}
		if !hasResolvableProperties(items) {
			continue
		}
		if resolved != nil {
			return nil // ambiguous: multiple array-of-object properties
		}
		resolved = items
	}
	return resolved
}

func hasResolvableProperties(schema map[string]any) bool {
	if _, ok := schema["properties"].(map[string]any); ok {
		return true
	}
	if allOf, ok := schema["allOf"].([]any); ok && len(allOf) > 0 {
		return true
	}
	return false
}

// getFieldResponseSchemaItems extracts the items array schema from a list response.
// For list endpoints, the response is typically { items: [...], page: N, total: N }.
// This navigates to the items schema to extract entity fields, not wrapper fields.
func getFieldResponseSchemaItems(responses map[string]any, code string) any {
	schema := getFieldResponseSchema(responses, code)
	if schema == nil {
		return nil
	}
	if schemaMap, ok := schema.(map[string]any); ok {
		// Check for properties.items or direct items
		if props, ok := schemaMap["properties"].(map[string]any); ok {
			if items, ok := props["items"].(map[string]any); ok {
				// items might have its own items (array schema)
				if innerItems, ok := items["items"]; ok {
					return innerItems
				}
				return items
			}
		}
		// Direct items field (array schema)
		if items, ok := schemaMap["items"]; ok {
			return items
		}
	}
	return nil
}

func getFieldResponseSchema(responses map[string]any, code string) any {
	resdef, _ := responses[code].(map[string]any)
	if resdef == nil {
		return nil
	}

	// OpenAPI 3.x
	if content, ok := resdef["content"].(map[string]any); ok {
		if appjson, ok := content["application/json"].(map[string]any); ok {
			if schema, ok := appjson["schema"]; ok {
				return schema
			}
		}
	}

	// Swagger 2.0
	if schema, ok := resdef["schema"]; ok {
		return schema
	}
	return nil
}

func getFieldRequestBodySchema(requestBody map[string]any) any {
	if content, ok := requestBody["content"].(map[string]any); ok {
		if appjson, ok := content["application/json"].(map[string]any); ok {
			if schema, ok := appjson["schema"]; ok {
				return schema
			}
		}
	}
	if schema, ok := requestBody["schema"]; ok {
		return schema
	}
	return nil
}

// extractFieldsTopLevel handles the TS reshape-then-each pattern:
//
//	if Array.isArray(fieldSets.allOf) → fieldSets = fieldSets.allOf
//	else if fieldSets.properties     → fieldSets = [fieldSets]
//	each(fieldSets, fieldSet => each(fieldSet?.properties, ...))
//
// The implicit "object → iterate values" behavior of `each` means that a
// schema like `{type: "array", items: <schema>}` still yields fields from
// the inner items.
//
// jostraca's each marks every iterated object value with a `key$` property,
// and inferFieldsFromExamples later iterates the same map — so a schema with
// no allOf/properties (e.g. {type: "object", additionalProperties: …,
// example: {…}}) ends up adding a synthetic "key$" entry to the example map.
// Mirror that mutation here so canonize("key$")="key" surfaces alongside the
// example fields, matching TS exactly.
func extractFieldsTopLevel(fieldSets any, fielddefs *[]map[string]any) {
	switch fs := fieldSets.(type) {
	case map[string]any:
		if _, ok := fs["allOf"].([]any); ok {
			extractFields(fs, fielddefs)
			return
		}
		if _, ok := fs["properties"].(map[string]any); ok {
			extractFields(fs, fielddefs)
			return
		}
		for _, k := range sortedKeys(fs) {
			val := fs[k]
			if vm, ok := val.(map[string]any); ok {
				vm["key$"] = k
			}
			extractPropertiesOnly(val, fielddefs)
		}
	case []any:
		for _, item := range fs {
			extractPropertiesOnly(item, fielddefs)
		}
	}
}

// extractPropertiesOnly mirrors the inner `each(fieldSet?.properties, ...)`:
// it pulls a single level of properties (and required[]) from the value, but
// does not descend further. Required[] from the property's own sub-schema is
// preserved as truthy so $ref-resolved properties keep their `req`.
func extractPropertiesOnly(fieldSet any, fielddefs *[]map[string]any) {
	fs, ok := fieldSet.(map[string]any)
	if !ok || fs == nil {
		return
	}
	props, ok := fs["properties"].(map[string]any)
	if !ok || props == nil {
		return
	}
	requiredNames := map[string]bool{}
	if req, ok := fs["required"].([]any); ok {
		for _, r := range req {
			if s, ok := r.(string); ok {
				requiredNames[s] = true
			}
		}
	}
	for _, name := range sortedKeys(props) {
		prop := props[name]
		fd := map[string]any{"key$": name}
		if pm, ok := prop.(map[string]any); ok {
			// Carry `type` through unasserted: OpenAPI 3.1 writes a nullable
			// field as a type ARRAY (`type: [string, "null"]`), and a string
			// assertion here silently dropped it so Validator only ever saw
			// nil and produced `$ANY`.
			if t, ok := pm["type"]; ok {
				fd["type"] = t
			}
			if r, ok := pm["required"]; ok {
				fd["required"] = r
			}
			// Carry `description` for the same reason extractFields does: this
			// map IS the field def downstream, so a key not copied here is
			// invisible. This is the route a non-QUERY op's request body takes
			// (findFieldDefs wraps the schemas in a slice), and omitting it
			// made Go silently drop descriptions TS kept.
			if d, ok := pm["description"]; ok {
				fd["description"] = d
			}
			// ...and the spec facts, for exactly the same reason. THIS MAP IS
			// THE FIELD DEF DOWNSTREAM, so a key not copied here is invisible
			// — which is how `description` came to reach TS and not Go on the
			// request-body route. Adding a key to ModelField means adding it
			// here as well, or the two ports disagree on the same spec and
			// only a request body shows it.
			for _, k := range []string{"readOnly", "writeOnly", "deprecated", "format"} {
				if v, ok := pm[k]; ok {
					fd[k] = v
				}
			}
		}
		if requiredNames[name] {
			fd["required"] = true
		}
		*fielddefs = append(*fielddefs, fd)
	}
}

func extractFields(fieldSets any, fielddefs *[]map[string]any) {
	switch fs := fieldSets.(type) {
	case map[string]any:
		if allOf, ok := fs["allOf"].([]any); ok {
			for _, item := range allOf {
				extractFields(item, fielddefs)
			}
			return
		}
		if props, ok := fs["properties"].(map[string]any); ok {
			requiredNames := map[string]bool{}
			if req, ok := fs["required"].([]any); ok {
				for _, r := range req {
					if s, ok := r.(string); ok {
						requiredNames[s] = true
					}
				}
			}
			for _, name := range sortedKeys(props) {
				prop := props[name]
				fd := map[string]any{"key$": name}
				if pm, ok := prop.(map[string]any); ok {
					// Unasserted: a 3.1 nullable field's type is an ARRAY.
					if t, ok := pm["type"]; ok {
						fd["type"] = t
					}
					// Preserve the property's own `required` so a $ref-
					// resolved sub-schema with its own required array
					// surfaces as a truthy `req` (TS treats `!!array` as
					// true). Mirrors src/transform/field.ts:fielddefs.push(property).
					if r, ok := pm["required"]; ok {
						fd["required"] = r
					}
					// Carry the property's own words through. TS passes the
					// raw property object to resolveOpFields, so its
					// `description` is simply there; this port builds a NEW
					// map with selected keys, so anything not copied here is
					// invisible downstream — which is exactly how the field
					// description was lost on this side.
					if d, ok := pm["description"]; ok {
						fd["description"] = d
					}
					// ...and the spec facts. SAME RULE, SECOND PLACE: this
					// port has TWO helpers that build a fresh field def from
					// selected keys (this one for the response route,
					// extractPropertiesOnly for the request-body route), and
					// a key added to ModelField has to be copied in BOTH or
					// the ports disagree on half the specs.
					for _, k := range []string{"readOnly", "writeOnly", "deprecated", "format"} {
						if v, ok := pm[k]; ok {
							fd[k] = v
						}
					}
				}
				if requiredNames[name] {
					fd["required"] = true
				}
				*fielddefs = append(*fielddefs, fd)
			}
		}
	case []any:
		for _, item := range fs {
			extractFields(item, fielddefs)
		}
	}
}

func inferFieldsFromExamples(opdef map[string]any) []map[string]any {
	example := findExampleObject(opdef)
	if example == nil {
		return nil
	}
	exMap, ok := example.(map[string]any)
	if !ok {
		return nil
	}

	var fielddefs []map[string]any
	for _, key := range sortedKeys(exMap) {
		value := exMap[key]
		fielddefs = append(fielddefs, map[string]any{
			"key$": key,
			"type": InferTypeFromValue(value),
		})
	}
	return fielddefs
}

func findExampleObject(opdef map[string]any) any {
	responses, _ := opdef["responses"].(map[string]any)
	if responses == nil {
		return nil
	}

	var resdef map[string]any
	for _, code := range []string{"200", "201"} {
		if rd, ok := responses[code].(map[string]any); ok {
			resdef = rd
			break
		}
	}
	if resdef == nil {
		return nil
	}

	// OpenAPI 3.x: content.application/json.example
	if content, ok := resdef["content"].(map[string]any); ok {
		if appjson, ok := content["application/json"].(map[string]any); ok {
			if example, ok := appjson["example"]; ok {
				return unwrapExample(example)
			}
			if examples, ok := appjson["examples"].(map[string]any); ok {
				// Mirrors TS Object.values(examples) iteration order: when
				// the parser annotated an `x-examples-order` slice via
				// annotateExamplesOrder we use it; otherwise fall back to
				// alphabetical (e.g. for YAML specs that didn't go through
				// the JSON token walker).
				order := exampleOrder(examples)
				for _, ek := range order {
					v := examples[ek]
					if vm, ok := v.(map[string]any); ok {
						if ex, ok := vm["value"]; ok {
							return unwrapExample(ex)
						}
					}
				}
			}
			// OpenAPI 3.x: content.application/json.schema.example.
			// Mirrors src/transform/field.ts:findExampleObject — TS probes
			// this path after content-level example/examples, so single-key
			// schemas with `example: { ... }` still surface fields.
			if schema, ok := appjson["schema"].(map[string]any); ok {
				if example, ok := schema["example"]; ok {
					return unwrapExample(example)
				}
			}
		}
	}

	// Swagger 2.0
	if example, ok := resdef["example"]; ok {
		return unwrapExample(example)
	}
	if examples, ok := resdef["examples"].(map[string]any); ok {
		if appjson, ok := examples["application/json"]; ok {
			return unwrapExample(appjson)
		}
	}
	if schema, ok := resdef["schema"].(map[string]any); ok {
		if example, ok := schema["example"]; ok {
			return unwrapExample(example)
		}
	}

	return nil
}

// exampleOrder returns the iteration order for an examples map, preferring
// the `x-examples-order` annotation set by annotateExamplesOrder during
// parse. The annotation key itself is filtered out so it never participates
// in iteration. When no annotation is present (e.g. YAML specs), falls back
// to alphabetical to keep behavior deterministic.
func exampleOrder(examples map[string]any) []string {
	if raw, ok := examples["x-examples-order"]; ok {
		switch o := raw.(type) {
		case []string:
			return o
		case []any:
			out := make([]string, 0, len(o))
			for _, v := range o {
				if s, ok := v.(string); ok {
					out = append(out, s)
				}
			}
			return out
		}
	}
	keys := sortedKeys(examples)
	out := make([]string, 0, len(keys))
	for _, k := range keys {
		if k == "x-examples-order" {
			continue
		}
		out = append(out, k)
	}
	return out
}

func unwrapExample(example any) any {
	if arr, ok := example.([]any); ok {
		if len(arr) > 0 {
			return arr[0]
		}
		return nil
	}
	return example
}

// NestedIdKeys are the subfields that conventionally carry the identifying
// value of a nested object, in preference order. github's repo `owner` is a
// user object whose identifier is `login`; other specs use `name`, `slug` or
// `key`. `id` is last: it is the most common name and the least likely to be
// the value a PATH parameter takes (a path that wanted an id would say so).
// Mirrors NESTED_ID_KEYS in src/transform/field.ts.
var NestedIdKeys = []string{"login", "slug", "name", "key", "id"}

// identityFrom answers WHERE EACH COMPOSITE PART'S VALUE LIVES IN A RESPONSE.
//
// The parts are PATH PARAMETER names; a response names its fields whatever it
// likes. Resolving one to the other is what lets an SDK put an id on a record
// the API returned, rather than only address a record whose id it was given.
//
// A part no rule resolves is left OUT: downstream then knows the id cannot be
// rebuilt for that entity and can say so, which is better than a confidently
// wrong id on a real record. Mirrors identityFrom in src/transform/field.ts.
func identityFrom(
	mentMap map[string]any, parts []string, def map[string]any,
) map[string]any {
	// THE RESPONSE SCHEMA IS THE AUTHORITY, not `fields`, which is merged
	// across load, create, update and list — so a part that exists only in a
	// REQUEST BODY appears there too, and recording it would claim a returned
	// record carries it.
	candidates := responseCandidates(mentMap, def)
	out := map[string]any{}

	for _, part := range parts {
		// THE WIRE NAME AS WELL AS THE MODEL NAME: identityParams reads the
		// RENAMED parameter off the path segments while a response keeps its
		// own casing.
		aliases := partAliases(mentMap, part)

		for _, props := range candidates {
			if found := resolvePart(mentMap, part, aliases, props, def); "" != found {
				out[part] = found
				break
			}
		}
	}

	return out
}

// partAliases lists every name a part might be carried under: the model's name
// for it, plus the original wire names of any path parameter renamed to it.
func partAliases(mentMap map[string]any, part string) []string {
	names := []string{part}
	seen := map[string]bool{part: true}

	add := func(n string) {
		if "" != n && !seen[n] {
			seen[n] = true
			names = append(names, n)
		}
	}

	opMap, _ := mentMap["op"].(map[string]any)
	for _, opname := range sortedKeys(opMap) {
		mop, _ := opMap[opname].(map[string]any)
		if mop == nil {
			continue
		}
		points, _ := mop["points"].([]any)
		for _, pt := range points {
			ptMap, _ := pt.(map[string]any)
			if ptMap == nil {
				continue
			}

			if rename, ok := ptMap["rename"].(map[string]any); ok {
				if param, ok := rename["param"].(map[string]any); ok {
					for _, orig := range sortedKeys(param) {
						if to, _ := param[orig].(string); to == part {
							add(orig)
						}
					}
				}
			}

			if args, ok := ptMap["args"].(map[string]any); ok {
				for _, p := range argsParamList(args["params"]) {
					if n, _ := p["name"].(string); n == part {
						if o, _ := p["orig"].(string); "" != o {
							add(o)
						}
					}
				}
			}
		}
	}

	return names
}

// resolvePart finds where one part is carried in a property map, or "".
//
// The four rules, in order, each a fact the spec states: a scalar property of
// that name; the part naming this entity, resolved to `name`; a scalar
// `<part>_name` / `_login` / `_slug`; or an object property's conventional
// identifying subfield.
func resolvePart(
	mentMap map[string]any, part string, aliases []string,
	props map[string]any, def map[string]any,
) string {
	if props == nil {
		return ""
	}

	prop := func(name string) map[string]any {
		return resolveRef(props[name], def)
	}

	scalar := func(p map[string]any) bool {
		if p == nil {
			return false
		}
		t := fmt.Sprint(p["type"])
		if "object" == t || "array" == t {
			return false
		}
		return p["properties"] == nil && p["items"] == nil
	}

	for _, name := range aliases {
		if scalar(prop(name)) {
			return name
		}
	}

	if entname, _ := mentMap["name"].(string); part == entname && scalar(prop("name")) {
		return "name"
	}

	for _, name := range aliases {
		for _, suffix := range []string{"_name", "_login", "_slug"} {
			if scalar(prop(name + suffix)) {
				return name + suffix
			}
		}
	}

	for _, name := range aliases {
		nested := prop(name)
		if nested == nil {
			continue
		}
		if nestedProps, ok := nested["properties"].(map[string]any); ok && nestedProps != nil {
			if sub := conventionalIdKey(nestedProps); "" != sub {
				return name + "." + sub
			}
		}
	}

	return ""
}

// conventionalIdKey returns the conventional identifying subfield of a
// property map, or "".
func conventionalIdKey(props map[string]any) string {
	for _, key := range NestedIdKeys {
		p, _ := props[key].(map[string]any)
		if p == nil {
			continue
		}
		t := fmt.Sprint(p["type"])
		if "object" != t && "array" != t {
			return key
		}
	}

	return ""
}

// resolveRef follows a `$ref` one hop, or returns the schema itself. apidef
// resolves most refs before this stage; this covers the ones that survive on
// a nested property.
func resolveRef(schema any, def map[string]any) map[string]any {
	node, _ := schema.(map[string]any)
	if node == nil {
		return nil
	}

	ref, _ := node["$ref"].(string)
	if !strings.HasPrefix(ref, "#/") {
		return node
	}

	var cur any = def
	for _, seg := range strings.Split(ref[2:], "/") {
		curMap, _ := cur.(map[string]any)
		if curMap == nil {
			return nil
		}
		cur = curMap[seg]
		if cur == nil {
			return nil
		}
	}

	out, _ := cur.(map[string]any)
	return out
}

// responseCandidates lists the property maps a response could be describing,
// best first.
//
// BOTH SPEC DIALECTS: an OpenAPI 3 response carries its schema under
// `content['application/json']`, a SWAGGER 2 response directly as `schema`.
// JSON only where there is a choice, `allOf` expanded, and ONLY the envelope
// descended — descending every object-valued property instead treats an
// ordinary nested object as a whole record. Action points are skipped, as
// identityParams skips them. Mirrors responseCandidates in
// src/transform/field.ts.
func responseCandidates(mentMap map[string]any, def map[string]any) []map[string]any {
	var out []map[string]any
	seen := map[string]bool{}

	var propsOf func(schema any) []map[string]any
	propsOf = func(schema any) []map[string]any {
		node := resolveRef(schema, def)
		if node == nil {
			return nil
		}

		// Cycle guard. Go cannot key a set on a map, so the pointer is
		// spelled with fmt — enough to stop a self-referential schema.
		key := fmt.Sprintf("%p", node)
		if seen[key] {
			return nil
		}
		seen[key] = true

		if allOf, ok := node["allOf"].([]any); ok {
			var acc []map[string]any
			for _, member := range allOf {
				acc = append(acc, propsOf(member)...)
			}
			return acc
		}

		if props, ok := node["properties"].(map[string]any); ok && props != nil {
			return []map[string]any{props}
		}

		// A bare array response: the record is the item.
		if items := resolveRef(node["items"], def); items != nil {
			return propsOf(items)
		}

		return nil
	}

	add := func(schema any, opname string) {
		for _, props := range propsOf(schema) {
			out = append(out, props)

			envelope := envelopeProp(props, opname)
			if "" == envelope {
				continue
			}
			inner := resolveRef(props[envelope], def)
			if inner == nil {
				continue
			}
			out = append(out, propsOf(inner)...)
		}
	}

	opMap, _ := mentMap["op"].(map[string]any)
	paths, _ := def["paths"].(map[string]any)

	for _, opname := range []string{"load", "list", "update", "create"} {
		mop, _ := opMap[opname].(map[string]any)
		if mop == nil {
			continue
		}
		points, _ := mop["points"].([]any)

		for _, pt := range points {
			ptMap, _ := pt.(map[string]any)
			if ptMap == nil {
				continue
			}
			if sel, ok := ptMap["select"].(map[string]any); ok && sel != nil {
				if _, has := sel["$action"]; has {
					continue
				}
			}

			orig, _ := ptMap["orig"].(string)
			path, _ := paths[orig].(map[string]any)
			if path == nil {
				continue
			}
			method, _ := path[strings.ToLower(fmt.Sprint(ptMap["method"]))].(map[string]any)
			if method == nil {
				continue
			}
			responses, _ := method["responses"].(map[string]any)

			for _, code := range sortedKeys(responses) {
				if !strings.HasPrefix(code, "2") {
					continue
				}
				resdef, _ := responses[code].(map[string]any)
				if resdef == nil {
					continue
				}

				if content, ok := resdef["content"].(map[string]any); ok && content != nil {
					ctypes := sortedKeys(content)
					json := ""
					for _, c := range ctypes {
						if strings.Contains(c, "json") {
							json = c
							break
						}
					}
					if "" != json {
						if ct, ok := content[json].(map[string]any); ok {
							add(ct["schema"], opname)
						}
					} else {
						for _, c := range ctypes {
							if ct, ok := content[c].(map[string]any); ok {
								add(ct["schema"], opname)
							}
						}
					}
				}

				// Swagger 2 puts it here.
				add(resdef["schema"], opname)
			}
		}
	}

	return out
}

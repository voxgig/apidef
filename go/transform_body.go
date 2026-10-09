/* Copyright (c) 2026 Voxgig Ltd, MIT License */

package apidef

import (
	"fmt"
	"reflect"
	"regexp"
	"sort"
	"strings"
)

// JSON first, as generated SDKs send it; then the kinds by what each can carry.
var bodyKindOrder = map[string]int{"json": 0, "multipart": 1, "form": 2, "raw": 3}

const (
	jsonMedia      = "application/json"
	formMedia      = "application/x-www-form-urlencoded"
	multipartMedia = "multipart/form-data"
	octetMedia     = "application/octet-stream"
)

var successRE = regexp.MustCompile(`(?i)^2(\d\d|xx)$`)

var schemaTypingKeys = []string{
	"type", "format", "properties", "additionalProperties", "items",
	"allOf", "anyOf", "oneOf", "enum", "const", "contentMediaType", "contentEncoding",
}

type bodyOffer struct {
	media    string
	schema   any
	encoding any
	swagger  bool
}

type rankedBody struct {
	offer    bodyOffer
	declared string
	body     map[string]any
}

// BodyTransform records each HTTP point's request body, when it is more than JSON,
// and the media types its success response declares.
func BodyTransform(ctx *ApiDefContext) (*TransformResult, error) {
	entities, _ := getKit(ctx)["entity"].(map[string]any)
	msg := "body "

	for _, entname := range sortedKeys(entities) {
		ment, _ := entities[entname].(map[string]any)
		ops, _ := ment["op"].(map[string]any)
		for _, opname := range sortedKeys(ops) {
			op, _ := ops[opname].(map[string]any)
			points, _ := op["points"].([]any)
			for _, pv := range points {
				point, _ := pv.(map[string]any)
				if point == nil || point["k"] == "graphql" {
					continue
				}
				method, _ := point["m"].(string)
				path, _ := point["o"].(string)
				bodyMedia, responseMedia := guideBodyMedia(ctx.Guide, entname, opname, method, path)
				if rb := requestBody(ctx.Def, method, path, bodyMedia); rb != nil {
					point["rb"] = rb
				}
				if bf := bodyFields(ctx.Def, point, bodyMedia); bf != nil {
					point["bf"] = bf
				}
				if rs := responseBody(ctx.Def, method, path, responseMedia); rs != nil {
					point["rs"] = rs
				}
			}
		}
		msg += entname + " "
	}

	return &TransformResult{OK: true, Msg: msg}, nil
}

// The entry of the point's own op, as ops can share a path and method.
// A patch the operation pass promotes to update keeps its entry under patch.
func guideBodyMedia(guide map[string]any, entname string, opname string, method string, path string) (string, string) {
	gents, _ := guide["entity"].(map[string]any)
	gent, _ := gents[entname].(map[string]any)
	gpaths, _ := gent["path"].(map[string]any)
	gpath, _ := gpaths[path].(map[string]any)
	gops, _ := gpath["op"].(map[string]any)
	names := []string{opname}
	if opname == "update" {
		names = append(names, "patch")
	}
	for _, name := range names {
		gop, _ := gops[name].(map[string]any)
		gmethod, _ := gop["method"].(string)
		if gop != nil && guideActive(gop) && strings.ToUpper(gmethod) == strings.ToUpper(method) {
			body, _ := gop["body"].(map[string]any)
			response, _ := gop["response"].(map[string]any)
			return textOf(body["media"]), textOf(response["media"])
		}
	}
	return "", ""
}

// Nil when the operation sends JSON alone.
func requestBody(def map[string]any, method string, path string, media string) map[string]any {
	offers, ok := requestOffers(def, method, path)
	if !ok {
		return nil
	}

	body := chooseBody(offers, media)
	if body == nil {
		return nil
	}
	if body["kind"] == "json" && mediaEssence(body["media"].(string)) == jsonMedia {
		alternatives, _ := body["alternatives"].([]any)
		allJSON := true
		for _, other := range alternatives {
			allJSON = allJSON && other.(map[string]any)["kind"] == "json"
		}
		if allJSON {
			return nil
		}
	}
	return body
}

// Nil when no success response declares a body.
func responseBody(def map[string]any, method string, path string, media string) map[string]any {
	paths, _ := def["paths"].(map[string]any)
	pathdef, _ := paths[path].(map[string]any)
	opdef, _ := pathdef[strings.ToLower(method)].(map[string]any)
	if opdef == nil {
		return nil
	}
	if def["swagger"] != nil {
		return chooseBody(swaggerResponseOffers(def, opdef), media)
	}
	return chooseBody(openapiResponseOffers(opdef), media)
}

func requestOffers(def map[string]any, method string, path string) ([]bodyOffer, bool) {
	paths, _ := def["paths"].(map[string]any)
	pathdef, _ := paths[path].(map[string]any)
	opdef, _ := pathdef[strings.ToLower(method)].(map[string]any)
	if opdef == nil {
		return nil, false
	}
	if def["swagger"] != nil {
		return swaggerOffers(def, pathdef, opdef), true
	}
	return openapiOffers(opdef), true
}

func chooseBody(offers []bodyOffer, media string) map[string]any {
	ranked := rankOffers(offers)

	bodies := []map[string]any{}
	seen := map[string]bool{}
	for _, entry := range ranked {
		if bm := entry.body["media"].(string); !seen[bm] {
			seen[bm] = true
			bodies = append(bodies, entry.body)
		}
	}

	var chosen map[string]any
	if entry := chooseOffer(ranked, media); entry != nil {
		chosen = entry.body
	} else if textOf(media) != "" {
		chosen = describeBody(bodyOffer{media: textOf(media)})
	}

	if chosen == nil {
		return nil
	}

	alternatives := []any{}
	for _, body := range bodies {
		if body["media"] != chosen["media"] {
			alternatives = append(alternatives, body)
		}
	}
	if 0 == len(alternatives) {
		return chosen
	}
	out := map[string]any{"alternatives": alternatives}
	for key, val := range chosen {
		out[key] = val
	}
	return out
}

func rankOffers(offers []bodyOffer) []rankedBody {
	sort.SliceStable(offers, func(i, j int) bool { return lessUTF16(offers[i].media, offers[j].media) })
	ranked := make([]rankedBody, 0, len(offers))
	for _, offer := range offers {
		ranked = append(ranked, rankedBody{offer: offer,
			declared: strings.ToLower(strings.TrimSpace(offer.media)), body: describeBody(offer)})
	}
	sort.SliceStable(ranked, func(i, j int) bool { return bodyBefore(ranked[i].body, ranked[j].body) })
	return ranked
}

// A named media type is matched as declared first, so a range keeps its schema.
func chooseOffer(ranked []rankedBody, media string) *rankedBody {
	named := strings.ToLower(textOf(media))
	if named == "" {
		if 0 < len(ranked) {
			return &ranked[0]
		}
		return nil
	}
	for i := range ranked {
		if ranked[i].declared == named {
			return &ranked[i]
		}
	}
	for i := range ranked {
		if strings.ToLower(ranked[i].body["media"].(string)) == named {
			return &ranked[i]
		}
	}
	return nil
}

func openapiOffers(opdef map[string]any) []bodyOffer {
	rb, _ := opdef["requestBody"].(map[string]any)
	content, _ := rb["content"].(map[string]any)
	offers := []bodyOffer{}
	for _, media := range sortedKeys(content) {
		mt, _ := content[media].(map[string]any)
		offers = append(offers, bodyOffer{media: media, schema: mt["schema"], encoding: mt["encoding"]})
	}
	return offers
}

// A response's `encoding` is ignored, as OpenAPI applies it to request bodies only.
func openapiResponseOffers(opdef map[string]any) []bodyOffer {
	responses, _ := opdef["responses"].(map[string]any)
	offers := []bodyOffer{}
	for _, status := range sortedKeys(responses) {
		if !successRE.MatchString(status) {
			continue
		}
		response, _ := responses[status].(map[string]any)
		content, _ := response["content"].(map[string]any)
		for _, media := range sortedKeys(content) {
			mt, _ := content[media].(map[string]any)
			offers = append(offers, bodyOffer{media: media, schema: mt["schema"]})
		}
	}
	return offers
}

// A Swagger response with no schema has no body.
func swaggerResponseOffers(def map[string]any, opdef map[string]any) []bodyOffer {
	responses, _ := opdef["responses"].(map[string]any)
	var schema any
	for _, status := range sortedKeys(responses) {
		response, _ := responses[status].(map[string]any)
		if successRE.MatchString(status) && response["schema"] != nil {
			schema = response["schema"]
			break
		}
	}
	if schema == nil {
		return nil
	}
	declaredList, isList := opdef["produces"].([]any)
	if !isList {
		declaredList, _ = def["produces"].([]any)
	}
	produces := []string{}
	for _, media := range declaredList {
		if text, ok := media.(string); ok && textOf(text) != "" {
			produces = append(produces, text)
		}
	}
	if 0 == len(produces) {
		produces = []string{jsonMedia}
	}
	offers := []bodyOffer{}
	for _, media := range produces {
		offers = append(offers, bodyOffer{media: media, schema: schema})
	}
	return offers
}

// Swagger declares a body as a `body` parameter or as `formData` parameters,
// and its media types in `consumes`, the operation's replacing the document's.
func swaggerOffers(def map[string]any, pathdef map[string]any, opdef map[string]any) []bodyOffer {
	params := swaggerParams(pathdef, opdef)

	var body map[string]any
	form := []map[string]any{}
	for _, param := range params {
		if body == nil && param["in"] == "body" {
			body = param
		}
		if name, _ := param["name"].(string); param["in"] == "formData" && name != "" {
			form = append(form, param)
		}
	}

	if body == nil && 0 == len(form) {
		return nil
	}

	var bodySchema, formSchema any
	if body != nil {
		bodySchema = body["schema"]
		if bodySchema == nil {
			bodySchema = map[string]any{}
		}
	}
	if 0 < len(form) {
		props := map[string]any{}
		required := []any{}
		for _, param := range form {
			props[param["name"].(string)] = formProperty(param)
			if param["required"] == true {
				required = append(required, param["name"])
			}
		}
		schema := map[string]any{"type": "object", "properties": props}
		if 0 < len(required) {
			schema["required"] = required
		}
		formSchema = schema
	}

	declaredList, isList := opdef["consumes"].([]any)
	if !isList {
		declaredList, _ = def["consumes"].([]any)
	}
	consumes := []string{}
	for _, media := range declaredList {
		if text, ok := media.(string); ok && textOf(text) != "" {
			consumes = append(consumes, text)
		}
	}
	if 0 == len(consumes) {
		switch {
		case body != nil:
			consumes = []string{jsonMedia}
		case formHasFile(form):
			consumes = []string{multipartMedia}
		default:
			consumes = []string{formMedia}
		}
	}

	offers := []bodyOffer{}
	for _, media := range consumes {
		schema, other := bodySchema, formSchema
		if fieldedMedia(mediaEssence(media)) {
			schema, other = formSchema, bodySchema
		}
		if schema == nil {
			schema = other
		}
		offers = append(offers, bodyOffer{media: media, schema: schema, swagger: true})
	}
	return offers
}

// An operation's parameter replaces the path's of the same location and name.
func swaggerParams(pathdef map[string]any, opdef map[string]any) []map[string]any {
	key := func(param map[string]any) string {
		return textOf(param["in"]) + "\u0000" + textOf(param["name"])
	}
	own := mapsOf(opdef["parameters"])
	owned := map[string]bool{}
	for _, param := range own {
		owned[key(param)] = true
	}
	params := append([]map[string]any{}, own...)
	for _, param := range mapsOf(pathdef["parameters"]) {
		if !owned[key(param)] {
			params = append(params, param)
		}
	}
	return params
}

func mapsOf(list any) []map[string]any {
	items, _ := list.([]any)
	out := []map[string]any{}
	for _, item := range items {
		if m, ok := item.(map[string]any); ok && m != nil {
			out = append(out, m)
		}
	}
	return out
}

func formHasFile(form []map[string]any) bool {
	for _, param := range form {
		if isFileType(param["type"]) {
			return true
		}
	}
	return false
}

func formProperty(param map[string]any) map[string]any {
	prop := map[string]any{}
	for _, key := range []string{"type", "format", "items", "collectionFormat"} {
		if param[key] != nil {
			prop[key] = param[key]
		}
	}
	return prop
}

func describeBody(offer bodyOffer) map[string]any {
	media := strings.TrimSpace(offer.media)
	mediaType := mediaEssence(media)
	major, minor := mediaParts(mediaType)

	if mediaType == jsonMedia || mediaType == "text/json" || strings.HasSuffix(minor, "+json") {
		if strings.Contains(mediaType, "*") {
			media = jsonMedia
		}
		return map[string]any{"kind": "json", "media": media}
	}

	if mediaType == formMedia {
		return withBodyFields(map[string]any{"kind": "form", "media": media}, offer)
	}

	if major == "multipart" {
		if minor == "*" {
			media = multipartMedia
		}
		return withBodyFields(map[string]any{"kind": "multipart", "media": media}, offer)
	}

	// A range that admits JSON stays JSON unless its schema is bytes.
	if minor == "*" && (major == "*" || major == "application") {
		if binarySchema(offer.schema) {
			return map[string]any{"kind": "raw", "media": octetMedia, "binary": true}
		}
		return map[string]any{"kind": "json", "media": jsonMedia}
	}

	body := map[string]any{"kind": "raw", "media": media}
	if rawBinary(mediaType, offer.schema) {
		body["binary"] = true
	}
	return body
}

func withBodyFields(body map[string]any, offer bodyOffer) map[string]any {
	props := mergedProperties(offer.schema)
	encoding, _ := offer.encoding.(map[string]any)
	fields := []any{}
	arrays, _ := body["kind"].(string)
	if offer.swagger {
		arrays = "swagger"
	}
	for _, name := range sortedKeys(props) {
		fields = append(fields, bodyField(name, props[name], encoding[name], arrays))
	}
	if 0 < len(fields) {
		body["fields"] = fields
	}
	return body
}

func bodyField(name string, prop any, encoding any, arrays string) map[string]any {
	list := schemaHasType(prop, "array")
	item := prop
	if list {
		item = prop.(map[string]any)["items"]
	}
	itemMap, _ := item.(map[string]any)
	field := map[string]any{"name": name}
	if binarySchema(itemMap) {
		field["binary"] = true
	}
	enc, _ := encoding.(map[string]any)
	if list {
		if join, joined := arrayJoin(prop.(map[string]any), enc, arrays); joined {
			field["join"] = join
		} else {
			field["list"] = true
		}
	}
	media := textOf(enc["contentType"])
	if media == "" {
		media = textOf(itemMap["contentMediaType"])
	}
	if media != "" {
		field["media"] = media
	}
	return field
}

// The delimiter an array's items are joined with, unless each item is sent as
// a field of its own: Swagger's `collectionFormat` (`csv` unless `multi`), a
// form's `style` and `explode`, and never for a multipart part.
func arrayJoin(prop map[string]any, encoding map[string]any, arrays string) (string, bool) {
	switch arrays {
	case "swagger":
		format, ok := prop["collectionFormat"].(string)
		if !ok {
			format = "csv"
		}
		return delimiter(format), format != "multi"
	case "form":
		style, ok := encoding["style"].(string)
		if !ok {
			style = "form"
		}
		explode, ok := encoding["explode"].(bool)
		if !ok {
			explode = style == "form"
		}
		return delimiter(style), !explode
	}
	return "", false
}

func delimiter(format string) string {
	switch format {
	case "ssv", "spaceDelimited":
		return " "
	case "tsv":
		return "\t"
	case "pipes", "pipeDelimited":
		return "|"
	}
	return ","
}

// Bytes unless the schema says text, or the media type is text and the schema typed.
func rawBinary(mediaType string, schema any) bool {
	if encodedText(schema) {
		return false
	}
	return untypedSchema(schema) || binarySchema(schema) || !textMedia(mediaType)
}

func binarySchema(schema any) bool {
	m, ok := schema.(map[string]any)
	return ok && m != nil && !encodedText(m) &&
		(m["format"] == "binary" || isFileType(m["type"]) || m["contentMediaType"] != nil)
}

func encodedText(schema any) bool {
	m, ok := schema.(map[string]any)
	return ok && m != nil && (m["format"] == "byte" || m["contentEncoding"] != nil)
}

func untypedSchema(schema any) bool {
	m, ok := schema.(map[string]any)
	if !ok || m == nil {
		return true
	}
	for _, key := range schemaTypingKeys {
		if m[key] != nil {
			return false
		}
	}
	return true
}

func textMedia(mediaType string) bool {
	major, minor := mediaParts(mediaType)
	return major == "text" || minor == "xml" || strings.HasSuffix(minor, "+xml")
}

func fieldedMedia(mediaType string) bool {
	return mediaType == formMedia || strings.HasPrefix(mediaType, "multipart/")
}

func bodyBefore(a map[string]any, b map[string]any) bool {
	ka, kb := bodyKindOrder[a["kind"].(string)], bodyKindOrder[b["kind"].(string)]
	if ka != kb {
		return ka < kb
	}
	ma, mb := a["media"].(string), b["media"].(string)
	ja, jb := mediaEssence(ma) == jsonMedia, mediaEssence(mb) == jsonMedia
	if ja != jb {
		return ja
	}
	return lessUTF16(ma, mb)
}

func mediaEssence(media string) string {
	return strings.ToLower(strings.TrimSpace(strings.SplitN(media, ";", 2)[0]))
}

func mediaParts(mediaType string) (string, string) {
	parts := strings.Split(mediaType, "/")
	if len(parts) < 2 {
		return parts[0], ""
	}
	return parts[0], parts[1]
}

func schemaHasType(schema any, name string) bool {
	m, ok := schema.(map[string]any)
	if !ok || m == nil {
		return false
	}
	switch t := m["type"].(type) {
	case string:
		return t == name
	case []any:
		for _, each := range t {
			if each == name {
				return true
			}
		}
	}
	return false
}

func textOf(val any) string {
	text, _ := val.(string)
	return strings.TrimSpace(text)
}

// jsonSchema mirrors ts/src/transform/body.ts: the schema the body step
// sends a request body with, when that body is JSON.
func jsonSchema(offers []bodyOffer, media string) any {
	chosen := chooseOffer(rankOffers(offers), media)
	if chosen == nil || chosen.body["kind"] != "json" {
		return nil
	}
	return chosen.offer.schema
}

func jsonRequestSchema(opdef map[string]any) any {
	if opdef == nil {
		return nil
	}
	return jsonSchema(openapiOffers(opdef), "")
}

// requestSchema mirrors ts/src/transform/body.ts: the JSON schema a point's
// request body is sent with, under the media type the guide names, else the
// one the body step prefers.
func requestSchema(def map[string]any, method string, path string, media string) any {
	offers, _ := requestOffers(def, method, path)
	return jsonSchema(offers, media)
}

// selectedRequestSchema mirrors ts/src/transform/body.ts: the schema of the
// request body offered under the media type the guide names, of any kind,
// else the preferred JSON one.
func selectedRequestSchema(def map[string]any, method string, path string, media string) any {
	offers, _ := requestOffers(def, method, path)
	if media != "" {
		if named := chooseOffer(rankOffers(offers), media); named != nil {
			return named.offer.schema
		}
	}
	return jsonSchema(offers, "")
}

// requestFieldSchema mirrors ts/src/transform/body.ts: the request schema a
// point's fields come from, read through the key a wrapped body sends the
// record under.
func requestFieldSchema(def map[string]any, mtarget map[string]any, media string) any {
	method, _ := mtarget["m"].(string)
	path, _ := mtarget["o"].(string)
	schema := selectedRequestSchema(def, method, path, media)
	if schema == nil {
		paths, _ := def["paths"].(map[string]any)
		pathdef, _ := paths[path].(map[string]any)
		opdef, _ := pathdef[strings.ToLower(method)].(map[string]any)
		declared, _ := opdef["requestBody"].(map[string]any)
		schema = declared["schema"]
	}
	t, _ := mtarget["t"].(map[string]any)
	if wrapper := requestWrapperOf(t["req"]); wrapper != "" {
		if inner := mergedProperties(schema)[wrapper]; inner != nil {
			return inner
		}
	}
	return schema
}

// bodyFields mirrors ts/src/transform/body.ts: the names of the properties a
// point's JSON body declares, and of the field an array body is sent from, as
// the entity's fields name them; false for none, nil for no body or a body
// that is not JSON.
func bodyFields(def map[string]any, mtarget map[string]any, media string) any {
	method, _ := mtarget["m"].(string)
	path, _ := mtarget["o"].(string)
	offers, _ := requestOffers(def, method, path)
	sent := chooseBody(offers, media)
	if (sent == nil && requestDecl(def, method, path) == nil) || (sent != nil && sent["kind"] != "json") {
		return nil
	}
	names := map[string]bool{}
	for _, prop := range declaredProperties(requestFieldSchema(def, mtarget, media), map[string]bool{}) {
		names[fieldName(prop)] = true
	}
	if c := arrayCarrier(def, mtarget, media); c != nil {
		names[fieldName(c.name)] = true
	}
	if 0 == len(names) {
		return false
	}
	out := []any{}
	for _, name := range sortedKeysBool(names) {
		out = append(out, name)
	}
	return out
}

// declaredProperties mirrors ts/src/transform/body.ts: a body that may be one
// of several objects declares the properties of each.
func declaredProperties(schema any, seen map[string]bool) []string {
	m, _ := schema.(map[string]any)
	if m == nil || seen[fmt.Sprintf("%p", m)] {
		return nil
	}
	seen[fmt.Sprintf("%p", m)] = true
	names := []string{}
	if props, ok := m["properties"].(map[string]any); ok {
		for name := range props {
			names = append(names, name)
		}
	}
	for _, key := range []string{"allOf", "oneOf", "anyOf"} {
		members, _ := m[key].([]any)
		for _, member := range members {
			names = append(names, declaredProperties(member, seen)...)
		}
	}
	return names
}

func arrayRequestSchema(def map[string]any, method string, path string, media string) map[string]any {
	return arrayShape(requestSchema(def, method, path, media))
}

// arrayShape mirrors ts/src/transform/body.ts: an array, or an allOf whose
// parts make one, or a oneOf or anyOf of one, or of arrays alone, beside any
// null, each fact from the first part that states it, outermost first, the
// items from the array's own part first.
func arrayShape(schema any) map[string]any {
	parts := []map[string]any{}
	seen := map[string]bool{}
	var visit func(node any)
	visit = func(node any) {
		m, _ := node.(map[string]any)
		id := fmt.Sprintf("%p", m)
		if m == nil || seen[id] {
			return
		}
		seen[id] = true
		parts = append(parts, m)
		members, _ := m["allOf"].([]any)
		for _, member := range members {
			visit(member)
		}
		for _, key := range []string{"oneOf", "anyOf"} {
			one, _ := m[key].([]any)
			members := []any{}
			for _, member := range one {
				if !nullOnly(member) {
					members = append(members, member)
				}
			}
			if len(members) == 1 {
				visit(members[0])
			} else if 1 < len(members) && allArrays(members) {
				parts = append(parts, unionArray(members))
			}
		}
	}
	visit(schema)
	var list map[string]any
	for _, part := range parts {
		if isArraySchema(part) {
			list = part
			break
		}
	}
	if list != nil && list["type"] == nil {
		typed := map[string]any{}
		for key, val := range list {
			typed[key] = val
		}
		typed["type"] = "array"
		list = typed
	}
	if list == nil {
		return list
	}
	out := map[string]any{}
	for key, val := range list {
		out[key] = val
	}
	if out["items"] == nil {
		for _, part := range parts {
			if part["items"] != nil {
				out["items"] = part["items"]
				break
			}
		}
	}
	for _, part := range parts {
		if part["description"] != nil {
			out["description"] = part["description"]
			break
		}
	}
	types := []any{}
	for _, t := range typeList(list["type"]) {
		if t != "null" {
			types = append(types, t)
		}
	}
	if len(types) == 1 {
		out["type"] = types[0]
	} else {
		out["type"] = types
	}
	out["nullable"] = admitsNull(schema)
	return out
}

// admitsNull mirrors ts/src/transform/body.ts: null must pass the schema's own
// type, const and enum, every allOf part, exactly one oneOf member, and some
// anyOf member.
func admitsNull(schema any) bool {
	return admitsNullOn(schema, map[string]bool{})
}

// enterPart reports whether a part is already on the path down to it. Go keeps
// a reference cycle that TypeScript's parse cuts to a string, so a part met
// inside itself counts as that string: no schema at all.
func enterPart(path map[string]bool, m map[string]any) (string, bool) {
	id := fmt.Sprintf("%p", m)
	if m == nil || path[id] {
		return id, false
	}
	path[id] = true
	return id, true
}

func admitsNullOn(schema any, path map[string]bool) bool {
	m, _ := schema.(map[string]any)
	id, entered := enterPart(path, m)
	if !entered {
		return false
	}
	defer delete(path, id)
	if !(m["type"] == nil || schemaHasType(m, "null") || m["nullable"] == true) {
		return false
	}
	if c, has := m["const"]; has && c != nil {
		return false
	}
	if enum, isList := m["enum"].([]any); isList && !containsNil(enum) {
		return false
	}
	parts, _ := m["allOf"].([]any)
	for _, part := range parts {
		if !admitsNullOn(part, path) {
			return false
		}
	}
	for _, key := range []string{"oneOf", "anyOf"} {
		one, isList := m[key].([]any)
		if !isList {
			continue
		}
		count := 0
		for _, member := range one {
			if admitsNullOn(member, path) {
				count++
			}
		}
		if 0 == count || ("oneOf" == key && 1 < count) {
			return false
		}
	}
	return true
}

func typeList(t any) []any {
	if list, ok := t.([]any); ok {
		return list
	}
	return []any{t}
}

// nullOnly: only null passes, by its type, a const or enum of null alone, an
// allOf part that passes only null, or a oneOf or anyOf every member of which
// does.
func nullOnly(schema any) bool {
	return nullOnlyOn(schema, map[string]bool{})
}

func nullOnlyOn(schema any, path map[string]bool) bool {
	m, _ := schema.(map[string]any)
	id, entered := enterPart(path, m)
	if !entered {
		return false
	}
	defer delete(path, id)
	if c, has := m["const"]; has {
		return c == nil
	}
	if enum, isList := m["enum"].([]any); isList {
		for _, v := range enum {
			if v != nil {
				return false
			}
		}
		return 0 < len(enum)
	}
	parts, _ := m["allOf"].([]any)
	for _, part := range parts {
		if nullOnlyOn(part, path) {
			return true
		}
	}
	for _, key := range []string{"oneOf", "anyOf"} {
		one, _ := m[key].([]any)
		every := 0 < len(one)
		for _, member := range one {
			if !nullOnlyOn(member, path) {
				every = false
				break
			}
		}
		if every {
			return true
		}
	}
	switch t := m["type"].(type) {
	case string:
		return t == "null"
	case []any:
		for _, each := range t {
			if each != "null" {
				return false
			}
		}
		return true
	}
	return false
}

func containsNil(list []any) bool {
	for _, v := range list {
		if v == nil {
			return true
		}
	}
	return false
}

func isArraySchema(schema any) bool {
	m, _ := schema.(map[string]any)
	return m != nil && (schemaHasType(m, "array") || (m["type"] == nil && arrayValued(m)))
}

func allArrays(members []any) bool {
	for _, member := range members {
		if !arrayOnly(member) {
			return false
		}
	}
	return true
}

// arrayOnly mirrors ts/src/transform/body.ts: only arrays pass, beside any
// null, so a union member that admits a string too is no array.
func arrayOnly(schema any) bool {
	m, _ := schema.(map[string]any)
	if m == nil {
		return false
	}
	if arrayValued(m) {
		return true
	}
	types := typeList(m["type"])
	array := false
	for _, t := range types {
		if t == "array" {
			array = true
		} else if t != "null" {
			return false
		}
	}
	return array
}

// unionArray mirrors ts/src/transform/body.ts: the items are kept only where
// every member's items name one component.
func unionArray(members []any) map[string]any {
	out := map[string]any{"type": "array"}
	first, _ := members[0].(map[string]any)
	items, _ := first["items"].(map[string]any)
	ref, _ := items["x-ref"].(string)
	if ref == "" {
		return out
	}
	for _, member := range members[1:] {
		m, _ := member.(map[string]any)
		other, _ := m["items"].(map[string]any)
		if xref, _ := other["x-ref"].(string); xref != ref {
			return out
		}
	}
	out["items"] = first["items"]
	return out
}

// arrayValued: only arrays pass, by a const, or an enum, of arrays alone.
func arrayValued(schema map[string]any) bool {
	if _, isList := schema["const"].([]any); isList {
		return true
	}
	enum, isList := schema["enum"].([]any)
	if !isList || 0 == len(enum) {
		return false
	}
	for _, v := range enum {
		if _, isList := v.([]any); !isList {
			return false
		}
	}
	return true
}

// nullableType mirrors ts/src/transform/body.ts: a nullable array says so with
// nullable in OpenAPI 3.0, and a type list in 3.1.
func nullableType(schema map[string]any) any {
	if schema["nullable"] == true && !schemaHasType(schema, "null") {
		return append(append([]any{}, typeList(schema["type"])...), "null")
	}
	return schema["type"]
}

var reqdataFieldRE = regexp.MustCompile("^`reqdata\\.([A-Za-z_][A-Za-z0-9_]*)`$")

// sameType mirrors ts/src/transform/body.ts: types compare by value, and a
// type list as the set it is, in one order.
func sameType(a any, b any) bool {
	return reflect.DeepEqual(typeSet(a), typeSet(b))
}

func typeSet(t any) any {
	list, ok := t.([]any)
	if !ok {
		return t
	}
	names := []string{}
	for _, member := range list {
		name, isName := member.(string)
		if !isName {
			out := []any{}
			for _, each := range list {
				out = append(out, typeSet(each))
			}
			return out
		}
		names = append(names, name)
	}
	sort.Strings(names)
	out := []any{}
	for _, name := range names {
		out = append(out, name)
	}
	return out
}

type arrayCarrierInfo struct {
	name        string
	required    bool
	typ         any
	description string
}

// arrayCarrier mirrors ts/src/transform/body.ts: the field of the request data
// a point's JSON array body is sent from, when its request transform unwraps
// one.
func arrayCarrier(def map[string]any, mtarget map[string]any, media string) *arrayCarrierInfo {
	t, _ := mtarget["t"].(map[string]any)
	req, _ := t["req"].(string)
	m := reqdataFieldRE.FindStringSubmatch(req)
	if m == nil {
		return nil
	}
	method, _ := mtarget["m"].(string)
	path, _ := mtarget["o"].(string)
	schema := arrayRequestSchema(def, method, path, media)
	if schema == nil {
		return nil
	}
	decl := requestDecl(def, method, path)
	description := textOf(decl["description"])
	if description == "" {
		description = textOf(schema["description"])
	}
	return &arrayCarrierInfo{name: m[1], required: decl["required"] == true, typ: nullableType(schema), description: description}
}

// OpenAPI's request body, or the Swagger parameter that is one.
func requestDecl(def map[string]any, method string, path string) map[string]any {
	paths, _ := def["paths"].(map[string]any)
	pathdef, _ := paths[path].(map[string]any)
	opdef, _ := pathdef[strings.ToLower(method)].(map[string]any)
	if opdef == nil {
		return nil
	}
	if def["swagger"] != nil {
		for _, param := range swaggerParams(pathdef, opdef) {
			if param["in"] == "body" {
				return param
			}
		}
		return nil
	}
	rb, _ := opdef["requestBody"].(map[string]any)
	return rb
}

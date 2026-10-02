/* Copyright (c) 2026 Voxgig Ltd, MIT License */

package apidef

import (
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

var schemaTypingKeys = []string{
	"type", "format", "properties", "additionalProperties", "items",
	"allOf", "anyOf", "oneOf", "enum", "const", "contentMediaType", "contentEncoding",
}

type bodyOffer struct {
	media    string
	schema   any
	encoding any
}

// BodyTransform records the request body of each HTTP point that sends more than JSON.
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
				rb := requestBody(ctx.Def, method, path, guideBodyMedia(ctx.Guide, entname, method, path))
				if rb != nil {
					point["rb"] = rb
				}
			}
		}
		msg += entname + " "
	}

	return &TransformResult{OK: true, Msg: msg}, nil
}

func guideBodyMedia(guide map[string]any, entname string, method string, path string) string {
	gents, _ := guide["entity"].(map[string]any)
	gent, _ := gents[entname].(map[string]any)
	gpaths, _ := gent["path"].(map[string]any)
	gpath, _ := gpaths[path].(map[string]any)
	gops, _ := gpath["op"].(map[string]any)
	for _, opname := range sortedKeys(gops) {
		gop, _ := gops[opname].(map[string]any)
		gmethod, _ := gop["method"].(string)
		if guideActive(gop) && strings.ToUpper(gmethod) == strings.ToUpper(method) {
			body, _ := gop["body"].(map[string]any)
			return textOf(body["media"])
		}
	}
	return ""
}

// Nil when the operation sends JSON alone.
func requestBody(def map[string]any, method string, path string, media string) map[string]any {
	paths, _ := def["paths"].(map[string]any)
	pathdef, _ := paths[path].(map[string]any)
	opdef, _ := pathdef[strings.ToLower(method)].(map[string]any)
	if opdef == nil {
		return nil
	}

	var offers []bodyOffer
	if def["swagger"] != nil {
		offers = swaggerOffers(def, pathdef, opdef)
	} else {
		offers = openapiOffers(opdef)
	}

	sort.SliceStable(offers, func(i, j int) bool { return lessUTF16(offers[i].media, offers[j].media) })
	ranked := make([]map[string]any, 0, len(offers))
	for _, offer := range offers {
		ranked = append(ranked, describeBody(offer))
	}
	sort.SliceStable(ranked, func(i, j int) bool { return bodyBefore(ranked[i], ranked[j]) })

	bodies := []map[string]any{}
	seen := map[string]bool{}
	for _, body := range ranked {
		if bm := body["media"].(string); !seen[bm] {
			seen[bm] = true
			bodies = append(bodies, body)
		}
	}

	var chosen map[string]any
	if named := textOf(media); named == "" {
		if 0 < len(bodies) {
			chosen = bodies[0]
		}
	} else {
		for _, body := range bodies {
			if strings.ToLower(body["media"].(string)) == strings.ToLower(named) {
				chosen = body
				break
			}
		}
		if chosen == nil {
			chosen = describeBody(bodyOffer{media: named})
		}
	}

	if chosen == nil {
		return nil
	}

	alternatives := []any{}
	allJSON := true
	for _, body := range bodies {
		if body["media"] != chosen["media"] {
			alternatives = append(alternatives, body)
			allJSON = allJSON && body["kind"] == "json"
		}
	}

	if chosen["kind"] == "json" && mediaEssence(chosen["media"].(string)) == jsonMedia && allJSON {
		return nil
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

// Swagger declares a body as a `body` parameter or as `formData` parameters,
// and its media types in `consumes`, the operation's replacing the document's.
func swaggerOffers(def map[string]any, pathdef map[string]any, opdef map[string]any) []bodyOffer {
	params := []map[string]any{}
	for _, list := range []any{pathdef["parameters"], opdef["parameters"]} {
		items, _ := list.([]any)
		for _, item := range items {
			if param, ok := item.(map[string]any); ok && param != nil {
				params = append(params, param)
			}
		}
	}

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
		for _, param := range form {
			props[param["name"].(string)] = formProperty(param)
		}
		formSchema = map[string]any{"type": "object", "properties": props}
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
		offers = append(offers, bodyOffer{media: media, schema: schema})
	}
	return offers
}

func formHasFile(form []map[string]any) bool {
	for _, param := range form {
		if param["type"] == "file" {
			return true
		}
	}
	return false
}

func formProperty(param map[string]any) map[string]any {
	prop := map[string]any{}
	for _, key := range []string{"type", "format", "items"} {
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

	if mediaType == jsonMedia || strings.HasSuffix(minor, "+json") {
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
	for _, name := range sortedKeys(props) {
		fields = append(fields, bodyField(name, props[name], encoding[name]))
	}
	if 0 < len(fields) {
		body["fields"] = fields
	}
	return body
}

func bodyField(name string, prop any, encoding any) map[string]any {
	list := schemaHasType(prop, "array")
	item := prop
	if list {
		item = prop.(map[string]any)["items"]
	}
	itemMap, _ := item.(map[string]any)
	field := map[string]any{"name": name}
	if itemMap != nil && !encodedText(itemMap) &&
		(itemMap["format"] == "binary" || itemMap["type"] == "file" || itemMap["contentMediaType"] != nil) {
		field["binary"] = true
	}
	if list {
		field["list"] = true
	}
	enc, _ := encoding.(map[string]any)
	media := textOf(enc["contentType"])
	if media == "" {
		media = textOf(itemMap["contentMediaType"])
	}
	if media != "" {
		field["media"] = media
	}
	return field
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
	return ok && m != nil && !encodedText(m) && (m["format"] == "binary" || m["contentMediaType"] != nil)
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

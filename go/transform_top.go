/* Copyright (c) 2024-2025 Voxgig, MIT License */

package apidef

import (
	"regexp"
	"strings"
)

// Mirrors src/transform/top.ts — word-boundary, case-insensitive "api".
var apiWordRe = regexp.MustCompile(`(?i)\bapi\b`)

// TopTransform sets API info and servers from the definition.
func TopTransform(ctx *ApiDefContext) (*TransformResult, error) {
	kit := getKit(ctx)
	def := ctx.Def

	info, _ := def["info"].(map[string]any)
	if info != nil {
		kit["info"] = info
		// Guarantee at least one sentence of API description; synthesise from
		// the title when the spec's description is empty or letterless (e.g. a
		// "." placeholder). Mirrors src/transform/top.ts ensureDescription.
		info["description"] = ensureDescription(info)
	}

	servers, _ := def["servers"]
	if servers != nil {
		infoMap := kit["info"].(map[string]any)
		infoMap["servers"] = servers
	}

	// Swagger 2.0
	if host, ok := def["host"].(string); ok {
		scheme := "https"
		if schemes, ok := def["schemes"].([]any); ok && len(schemes) > 0 {
			if s, ok := schemes[0].(string); ok {
				scheme = s
			}
		}
		basePath, _ := def["basePath"].(string)
		// Mirrors src/transform/top.ts:48-51 which uses
		// `@voxgig/struct.join([host, basePath], '/', true)` — the url=true
		// flag strips trailing slashes from the first segment and leading
		// slashes from later segments, dropping empty pieces. So basePath="/"
		// collapses to "" and yields a clean host without trailing slash.
		host = strings.TrimRight(host, "/")
		basePath = strings.Trim(basePath, "/")
		url := scheme + "://" + host
		if basePath != "" {
			url += "/" + basePath
		}
		infoMap := kit["info"].(map[string]any)
		serversList, _ := infoMap["servers"].([]any)
		infoMap["servers"] = append(serversList, map[string]any{"url": url})
	}

	return &TransformResult{OK: true, Msg: "top"}, nil
}

func getKit(ctx *ApiDefContext) map[string]any {
	main := ctx.ApiModel["main"].(map[string]any)
	return main[KIT].(map[string]any)
}

// hasLetters reports whether text carries at least one ASCII letter — i.e. it
// is real prose rather than a placeholder like "." / "---" / whitespace.
// Mirrors src/transform/top.ts hasLetters.
func hasLetters(text string) bool {
	for _, r := range text {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') {
			return true
		}
	}
	return false
}

// ensureDescription returns a non-empty, at-least-one-sentence description:
// the spec's own info.description when it is real prose, else a sentence
// synthesised from the title (else a generic sentence). Never empty or
// letterless. Mirrors src/transform/top.ts ensureDescription.
func ensureDescription(info map[string]any) string {
	current := ""
	if d, ok := info["description"].(string); ok {
		current = strings.TrimSpace(d)
	}
	if current != "" && hasLetters(current) {
		return info["description"].(string)
	}
	title := ""
	if t, ok := info["title"].(string); ok {
		title = strings.TrimSpace(t)
	}
	if title == "" || !hasLetters(title) {
		return "Client SDK for this API."
	}
	if apiWordRe.MatchString(title) {
		return "The " + title + "."
	}
	return "The " + title + " API."
}

/* Copyright (c) 2024-2025 Voxgig, MIT License */

package apidef

import (
	"regexp"
	"strings"
)

var apiWordRe = regexp.MustCompile(`(?i)\bapi\b`)

// TopTransform sets API info and servers from the definition.
func TopTransform(ctx *ApiDefContext) (*TransformResult, error) {
	kit := getKit(ctx)
	def := ctx.Def

	info, _ := def["info"].(map[string]any)
	if info != nil {
		kit["info"] = info
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

	ensureServer(ctx, kit)

	return &TransformResult{OK: true, Msg: "top"}, nil
}

// ensureServer mirrors ts/src/transform/top.ts: a definition that names no
// server takes the Server option, else names the URL as the server variable
// `base` for the SDK's caller to supply.
func ensureServer(ctx *ApiDefContext, kit map[string]any) {
	infoMap, _ := kit["info"].(map[string]any)
	if infoMap == nil {
		infoMap = map[string]any{}
		kit["info"] = infoMap
	}
	if first, _ := firstServerURL(infoMap); strings.TrimSpace(first) != "" {
		return
	}
	given := strings.TrimSpace(ctx.Opts.Server)
	if given != "" {
		infoMap["servers"] = []any{map[string]any{"url": withScheme(given)}}
		return
	}
	infoMap["servers"] = []any{map[string]any{
		"url": "{base}",
		"variables": map[string]any{"base": map[string]any{
			"description": "The base URL of the API, which its definition does not name.",
		}},
	}}
	if ctx.Warn != nil {
		ctx.Warn.Warn(map[string]any{
			"note": "no server URL in the definition (servers[0].url): the SDK takes it as" +
				" the server variable `base`; set the `server` build option to fix one",
		})
	}
}

var schemeRE = regexp.MustCompile(`(?i)^[a-z][a-z0-9+.-]*://`)

// withScheme mirrors ts/src/transform/top.ts: https when the URL names no
// scheme and is not a relative path.
func withScheme(url string) string {
	u := strings.TrimSpace(url)
	if u == "" || schemeRE.MatchString(u) {
		return url
	}
	if strings.HasPrefix(u, "//") {
		return "https:" + u
	}
	if strings.HasPrefix(u, "/") {
		return url
	}
	return "https://" + u
}

func firstServerURL(infoMap map[string]any) (string, bool) {
	servers, _ := infoMap["servers"].([]any)
	if len(servers) == 0 {
		return "", false
	}
	first, _ := servers[0].(map[string]any)
	url, ok := first["url"].(string)
	return url, ok
}

func getKit(ctx *ApiDefContext) map[string]any {
	main := ctx.ApiModel["main"].(map[string]any)
	return main[KIT].(map[string]any)
}

func hasLetters(text string) bool {
	for _, r := range text {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') {
			return true
		}
	}
	return false
}

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

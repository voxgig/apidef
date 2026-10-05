/* Copyright (c) 2024-2025 Voxgig, MIT License */

package apidef

import (
	"encoding/json"
	"golang.org/x/net/idna"
	"maps"
	neturl "net/url"
	"regexp"
	"slices"
	"strings"
)

var apiWordRe = regexp.MustCompile(`(?i)\bapi\b`)

// TopTransform sets API info and servers from the definition.
func TopTransform(ctx *ApiDefContext) (*TransformResult, error) {
	kit := getKit(ctx)
	def := ctx.Def

	info, _ := stringifyInfoScalars(def["info"]).(map[string]any)
	if info == nil {
		info = map[string]any{}
	}
	kit["info"] = info
	servers, _ := stringifyInfoScalars(def["servers"]).([]any)
	if servers == nil {
		servers = []any{}
	}
	info["servers"] = servers
	info["description"] = ensureDescription(info)

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

	normalizeServers(ctx, kit)
	ensureServer(ctx, kit)

	infoMap, _ := kit["info"].(map[string]any)
	if summary, ok := resolveSummary(def); ok {
		infoMap["summary"] = summary
	}
	infoServers, _ := infoMap["servers"].([]any)
	if website, ok := resolveWebsite(def, infoServers); ok {
		infoMap["website"] = website
	}
	if true == def["graphql"] {
		// A GraphQL schema declares no HTTP auth, so only the auth option sets it.
		if auth := ctx.Opts.Auth; auth != nil {
			if auth.Active != nil && !*auth.Active {
				infoMap["auth"] = false
			} else {
				infoMap["security"] = map[string]any{
					"scheme": optionOr(auth.Scheme, "apikey"),
					"type":   optionOr(auth.Type, "apiKey"),
					"in":     optionOr(auth.In, "header"),
					"name":   optionOr(auth.Name, "Authorization"),
					"prefix": optionOr(auth.Prefix, ""),
				}
			}
		}
	} else if !specDeclaresAuth(def) {
		infoMap["auth"] = false
	} else if security := resolveSecurity(def); security != nil {
		if exchange := findAuthExchange(def); exchange != nil {
			security["exchange"] = exchange
		}
		infoMap["security"] = security
	}

	return &TransformResult{OK: true, Msg: "top"}, nil
}

func optionOr(v *string, dflt string) string {
	if v == nil {
		return dflt
	}
	return *v
}

var operationMethods = []string{"get", "put", "post", "delete", "options", "head", "patch", "trace"}

// resolveSecurity mirrors ts/src/transform/top.ts.
func resolveSecurity(def map[string]any) map[string]any {
	schemes := securitySchemes(def)
	declared := func(name string) bool {
		_, ok := schemes[name].(map[string]any)
		return ok
	}

	opsecurity := operationSecurity(def)
	firsts := map[string]bool{}
	for _, reqs := range opsecurity {
		if name, ok := firstSingleScheme(reqs, declared); ok {
			firsts[name] = true
		}
	}

	name, found := "", false
	if 1 == len(firsts) {
		for first := range firsts {
			name, found = first, true
		}
	}
	if !found {
		name, found = firstSingleScheme(def["security"], declared)
	}
	if !found {
		name, found = firstDeclared(def, schemes)
	}

	scheme, _ := schemes[name].(map[string]any)
	if !found || scheme == nil {
		return nil
	}

	out := describeScheme(def, name, scheme)

	lists := opsecurity
	if 0 == len(lists) {
		if global, ok := def["security"].([]any); ok {
			lists = [][]any{global}
		}
	}
	alternatives := []any{}
	for _, names := range otherSchemeSets(lists, name, declared) {
		set := make([]any, len(names))
		for i, other := range names {
			set[i] = describeScheme(def, other, schemes[other].(map[string]any))
		}
		alternatives = append(alternatives, set)
	}
	if 0 < len(alternatives) {
		out["alternatives"] = alternatives
	}

	return out
}

func securitySchemes(def map[string]any) map[string]any {
	components, _ := def["components"].(map[string]any)
	schemes := components["securitySchemes"]
	if schemes == nil {
		schemes = def["securityDefinitions"]
	}
	out, _ := schemes.(map[string]any)
	return out
}

func operationSecurity(def map[string]any) [][]any {
	out := [][]any{}
	paths, _ := def["paths"].(map[string]any)
	for _, path := range sortedKeys(paths) {
		item, _ := paths[path].(map[string]any)
		for _, method := range operationMethods {
			op, _ := item[method].(map[string]any)
			if op == nil {
				continue
			}
			reqs, ok := op["security"].([]any)
			if !ok {
				reqs, ok = def["security"].([]any)
			}
			if ok {
				out = append(out, reqs)
			}
		}
	}
	return out
}

func schemeSet(req any) []string {
	m, _ := req.(map[string]any)
	return sortedKeys(m)
}

func firstSingleScheme(reqs any, declared func(string) bool) (string, bool) {
	list, _ := reqs.([]any)
	for _, req := range list {
		if names := schemeSet(req); 1 == len(names) && declared(names[0]) {
			return names[0], true
		}
	}
	return "", false
}

func otherSchemeSets(lists [][]any, primary string, declared func(string) bool) [][]string {
	key := func(names []string) string {
		b, _ := json.Marshal(names)
		return string(b)
	}
	seen := map[string]bool{key([]string{primary}): true}
	out := [][]string{}
	for _, reqs := range lists {
		for _, req := range reqs {
			names := schemeSet(req)
			if 0 == len(names) || !allDeclared(names, declared) || seen[key(names)] {
				continue
			}
			seen[key(names)] = true
			out = append(out, names)
		}
	}
	return out
}

func allDeclared(names []string, declared func(string) bool) bool {
	for _, name := range names {
		if !declared(name) {
			return false
		}
	}
	return true
}

// firstDeclared is the TypeScript's Object.keys(schemes)[0], in the order
// Parse recorded; a definition built some other way has none to keep.
func firstDeclared(def map[string]any, schemes map[string]any) (string, bool) {
	order, _ := def[schemeOrderKey].([]string)
	if raw, ok := def[schemeOrderKey].([]any); ok {
		for _, name := range raw {
			if s, ok := name.(string); ok {
				order = append(order, s)
			}
		}
	}
	for _, name := range order {
		if _, ok := schemes[name]; ok {
			return name, true
		}
	}
	if keys := jsKeyOrder(sortedKeys(schemes)); 0 < len(keys) {
		return keys[0], true
	}
	return "", false
}

func describeScheme(def map[string]any, name string, scheme map[string]any) map[string]any {
	orDefault := func(v any, dflt string) any {
		if v == nil {
			return dflt
		}
		return v
	}
	lower := func(v any) string {
		s, _ := v.(string)
		return strings.ToLower(s)
	}

	out := map[string]any{
		"scheme": name,
		"type":   orDefault(scheme["type"], ""),
		"in":     orDefault(scheme["in"], "header"),
		"name":   orDefault(scheme["name"], "Authorization"),
		"prefix": "",
	}

	switch lower(scheme["type"]) {
	case "http":
		if "basic" == lower(scheme["scheme"]) {
			out["prefix"] = "Basic"
		} else {
			out["prefix"] = "Bearer"
		}
	case "basic":
		out["prefix"] = "Basic"
	case "oauth2", "openidconnect":
		out["in"] = "header"
		out["name"] = "Authorization"
		out["prefix"] = "Bearer"
	case "apikey":
		if "header" == lower(out["in"]) && "authorization" == lower(out["name"]) {
			prefix := findAuthPrefix(scheme["description"])
			if "" == prefix {
				info, _ := def["info"].(map[string]any)
				prefix = findAuthPrefix(info["description"])
			}
			out["prefix"] = prefix
		}
	}

	return out
}

// The TypeScript's \s, and the ASCII-only case folding of its i flag: Go's
// own \s and (?i) both differ outside ASCII.
const jsSpaceClass = `\t\n\v\f\r \x{a0}\x{1680}\x{2000}-\x{200a}\x{2028}\x{2029}\x{202f}\x{205f}\x{3000}\x{feff}`

func foldASCII(word string) string {
	var b strings.Builder
	for _, c := range word {
		if 'a' <= c && c <= 'z' {
			b.WriteString("[" + strings.ToUpper(string(c)) + string(c) + "]")
		} else {
			b.WriteString(regexp.QuoteMeta(string(c)))
		}
	}
	return b.String()
}

var authSchemeWordRE = `\b(` + foldASCII("bearer") + `|` + foldASCII("oauth") + `2?|` +
	foldASCII("token") + `|` + foldASCII("basic") + `)\b`

var authPrefixExplicitRE = regexp.MustCompile(
	`Authorization:[ \t]*([A-Za-z][A-Za-z0-9._-]{0,14})[ \t]+` +
		`(?:<[^>\n]+>|\{[^}\n]+\}|\$[A-Za-z_][A-Za-z0-9_]*|[Yy][Oo][Uu][Rr][A-Za-z0-9_-]*|[A-Za-z0-9._~+/=-]{8,})`)

var authPrefixExampleRE = regexp.MustCompile(
	`(?:` + foldASCII("example") + `|` + foldASCII("e.g.") + `)[:` + jsSpaceClass + `][^\n]{0,20}?` +
		authSchemeWordRE + `[ \t]+(?:<[^>\n]+>|\{[^}\n]+\}|[A-Za-z0-9._~+/=-]{6,})`)

var authPrefixNamedRE = regexp.MustCompile(
	authSchemeWordRE + `[ \t]+(?:` + foldASCII("scheme") + `|` + foldASCII("authentication") +
		`|` + foldASCII("auth") + `\b|` + foldASCII("credential") + `[Ss]?)`)

// findAuthPrefix mirrors ts/src/transform/top.ts, answering "" for none.
func findAuthPrefix(v any) string {
	text, _ := v.(string)
	if "" == text {
		return ""
	}
	text = utf16Units(text)

	if m := authPrefixExplicitRE.FindStringSubmatch(text); m != nil {
		return m[1]
	}
	if m := authPrefixExampleRE.FindStringSubmatch(text); m != nil {
		return canonAuthScheme(m[1])
	}
	if m := authPrefixNamedRE.FindStringSubmatch(text); m != nil {
		return canonAuthScheme(m[1])
	}
	return ""
}

// utf16Units widens each supplementary character into a pair of units no
// pattern matches, so a bounded repeat counts code units as the TypeScript does.
func utf16Units(text string) string {
	var b strings.Builder
	for _, r := range text {
		if 0xFFFF < r {
			b.WriteString("")
		} else {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func canonAuthScheme(word string) string {
	w := strings.ToLower(word)
	switch {
	case strings.HasPrefix(w, "oauth"):
		return "OAuth"
	case "bearer" == w:
		return "Bearer"
	case "token" == w:
		return "Token"
	case "basic" == w:
		return "Basic"
	}
	return word
}

// specDeclaresAuth mirrors ts/src/transform/top.ts.
func specDeclaresAuth(def map[string]any) bool {
	nonEmpty := func(v any) bool {
		switch x := v.(type) {
		case map[string]any:
			return 0 < len(x)
		case []any:
			return 0 < len(x)
		}
		return false
	}

	components, _ := def["components"].(map[string]any)
	if nonEmpty(components["securitySchemes"]) || nonEmpty(def["securityDefinitions"]) {
		return true
	}

	if security, ok := def["security"].([]any); ok && 0 < len(security) {
		return true
	}

	paths, _ := def["paths"].(map[string]any)
	for _, item := range paths {
		ops, _ := item.(map[string]any)
		for _, op := range ops {
			opMap, _ := op.(map[string]any)
			if security, ok := opMap["security"].([]any); ok && 0 < len(security) {
				return true
			}
		}
	}

	return false
}

// findAuthExchange mirrors ts/src/transform/top.ts.
func findAuthExchange(def map[string]any) map[string]any {
	if !specSecuredByDefault(def) {
		return nil
	}

	paths, _ := def["paths"].(map[string]any)
	for _, path := range sortedKeys(paths) {
		item, _ := paths[path].(map[string]any)
		for _, method := range sortedKeys(item) {
			mdef, _ := item[method].(map[string]any)
			if mdef == nil {
				continue
			}
			op := maps.Clone(mdef)
			op["method"] = strings.ToUpper(method)
			found := authExchangeOp(op, true)
			if found == nil {
				continue
			}
			out := map[string]any{
				"path":     strings.TrimLeft(path, "/"),
				"method":   strings.ToUpper(method),
				"response": found["response"],
			}
			if found["request"] != nil {
				out["request"] = found["request"]
			}
			return out
		}
	}

	return nil
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

// normalizeServers mirrors the server loop in ts/src/transform/top.ts. It
// writes copies, since the list still holds the definition's own servers.
func normalizeServers(ctx *ApiDefContext, kit map[string]any) {
	infoMap, _ := kit["info"].(map[string]any)
	servers, _ := infoMap["servers"].([]any)
	if servers == nil {
		return
	}
	out := make([]any, len(servers))
	for i, entry := range servers {
		out[i] = entry
		server, _ := entry.(map[string]any)
		given, ok := server["url"].(string)
		if !ok {
			continue
		}
		url, names := singleBraces(given)
		url = withScheme(url)
		server = maps.Clone(server)
		server["url"] = url
		out[i] = server
		if len(names) == 0 {
			continue
		}
		declareVariables(server, names)
		if ctx.Warn != nil {
			ctx.Warn.Warn(map[string]any{
				"note": "server URL `" + given + "` writes its variables in Postman's double" +
					" braces: taken as `" + url + "`",
			})
		}
	}
	infoMap["servers"] = out
}

var braceRunRE = regexp.MustCompile(`\{+[A-Za-z0-9_]+\}+`)
var postmanVariableRE = regexp.MustCompile(`^\{\{([A-Za-z0-9_]+)\}\}$`)

// singleBraces mirrors ts/src/transform/top.ts.
func singleBraces(url string) (string, []string) {
	names := []string{}
	out := braceRunRE.ReplaceAllStringFunc(url, func(run string) string {
		m := postmanVariableRE.FindStringSubmatch(run)
		if m == nil {
			return run
		}
		if !slices.Contains(names, m[1]) {
			names = append(names, m[1])
		}
		return "{" + m[1] + "}"
	})
	return out, names
}

// declareVariables mirrors ts/src/transform/top.ts.
func declareVariables(server map[string]any, names []string) {
	var declared map[string]any
	switch vars := server["variables"].(type) {
	case nil:
		declared = map[string]any{}
	case map[string]any:
		declared = maps.Clone(vars)
	default:
		return
	}
	url, _ := server["url"].(string)
	origin := originVariable(url)
	for _, name := range names {
		if _, ok := declared[name]; !ok {
			entry := map[string]any{"default": ""}
			if name == origin {
				entry["description"] = originDescription
			}
			declared[name] = entry
		}
	}
	server["variables"] = declared
}

var schemeRE = regexp.MustCompile(`(?i)^[a-z][a-z0-9+.-]*://`)
var leadingVariableRE = regexp.MustCompile(`^\{([^{}]+)\}($|[/?#]|://)`)

const originDescription = "The origin of the API, with its scheme, such as https://api.example.com."

// withScheme mirrors ts/src/transform/top.ts: https when the URL names no
// scheme and is neither a relative path nor opened by a server variable.
func withScheme(url string) string {
	u := strings.TrimSpace(url)
	if u == "" || schemeRE.MatchString(u) {
		return url
	}
	if strings.HasPrefix(u, "//") {
		return "https:" + u
	}
	if strings.HasPrefix(u, "/") || leadingVariableRE.MatchString(u) {
		return url
	}
	return "https://" + u
}

// originVariable mirrors ts/src/transform/top.ts.
func originVariable(url string) string {
	m := leadingVariableRE.FindStringSubmatch(strings.TrimSpace(url))
	if m == nil || m[2] == "://" {
		return ""
	}
	return m[1]
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

var (
	summaryHeadingRe = regexp.MustCompile(`^[` + jsWhitespace + `]*#{1,6}[` + jsWhitespace + `]`)
	summaryRuleRe    = regexp.MustCompile(`^[` + jsWhitespace + `]*(-{2,}|={2,})[` + jsWhitespace + `]*$`)
	httpURLRe        = regexp.MustCompile(`(?i)^https?://`)
	serviceHostRe    = regexp.MustCompile(`(?i)^(api|api-[a-z0-9]+|apis|developer|developers|docs?|www)\.`)
)

func jsTrim(s string) string {
	return strings.Trim(s, jsWhitespace)
}

// resolveSummary mirrors ts/src/transform/top.ts.
func resolveSummary(def map[string]any) (string, bool) {
	info, _ := def["info"].(map[string]any)
	if summary, ok := info["summary"].(string); ok {
		if explicit := jsTrim(summary); explicit != "" && hasLetters(explicit) {
			return FirstSentence(explicit), true
		}
	}
	desc, _ := info["description"].(string)
	if jsTrim(desc) == "" || !hasLetters(desc) {
		return "", false
	}
	lines := strings.Split(desc, "\n")
	i := 0
	for i < len(lines) && (jsTrim(lines[i]) == "" ||
		summaryHeadingRe.MatchString(lines[i]) || summaryRuleRe.MatchString(lines[i])) {
		i++
	}
	var para []string
	for i < len(lines) && jsTrim(lines[i]) != "" && !summaryHeadingRe.MatchString(lines[i]) {
		para = append(para, jsTrim(lines[i]))
		i++
	}
	paragraph := jsTrim(strings.Join(para, " "))
	if paragraph == "" {
		return "", false
	}
	return FirstSentence(paragraph), true
}

// resolveWebsite mirrors ts/src/transform/top.ts.
func resolveWebsite(def map[string]any, servers []any) (string, bool) {
	info, _ := def["info"].(map[string]any)
	external, _ := def["externalDocs"].(map[string]any)
	if link, ok := external["url"].(string); ok && isHTTPURL(link) {
		return jsTrim(link), true
	}
	logo, _ := info["x-logo"].(map[string]any)
	if link, ok := logo["href"].(string); ok && isHTTPURL(link) {
		return jsTrim(link), true
	}
	if 0 < len(servers) {
		server, _ := servers[0].(map[string]any)
		if home, ok := homepageFromServer(server["url"]); ok {
			return home, true
		}
	}
	contact, _ := info["contact"].(map[string]any)
	if link, ok := contact["url"].(string); ok && isHTTPURL(link) {
		return jsTrim(link), true
	}
	if link, ok := info["termsOfService"].(string); ok && isHTTPURL(link) {
		return jsTrim(link), true
	}
	return "", false
}

func isHTTPURL(link string) bool {
	return httpURLRe.MatchString(jsTrim(link))
}

// The schemes the WHATWG parser calls special, for which a backslash is a
// slash.
var specialSchemeRe = regexp.MustCompile(`(?i)^(https?|wss?|ftp|file):`)

// The host mapping the WHATWG parser applies: UTS 46, non-transitional.
var idnaHost = idna.New(idna.MapForLookup(), idna.Transitional(false))

// whatwgInput is the preprocessing the WHATWG parser performs before it reads
// a URL: leading and trailing C0 controls and spaces go, and a tab or a
// newline goes wherever it sits.
func whatwgInput(raw string) string {
	raw = strings.TrimFunc(raw, func(r rune) bool { return r <= ' ' })
	return strings.Map(func(r rune) rune {
		if r == '\t' || r == '\n' || r == '\r' {
			return -1
		}
		return r
	}, raw)
}

// homepageFromServer mirrors ts/src/transform/top.ts, where the WHATWG URL
// parser preprocesses its input, lowercases the scheme and the host, and
// writes a non-ASCII host as punycode.
func homepageFromServer(v any) (string, bool) {
	raw, ok := v.(string)
	if !ok || jsTrim(raw) == "" {
		return "", false
	}
	if !strings.Contains(raw, "://") {
		raw = "https://" + raw
	}
	raw = whatwgInput(raw)
	if specialSchemeRe.MatchString(raw) {
		raw = strings.ReplaceAll(raw, `\`, "/")
	}
	parsed, err := neturl.Parse(raw)
	if err != nil {
		return "", false
	}
	host := strings.ToLower(parsed.Hostname())
	if host == "" || !strings.Contains(host, ".") || strings.ContainsAny(host, "{}") {
		return "", false
	}
	if ascii, err := idnaHost.ToASCII(host); err == nil {
		host = ascii
	}
	return strings.ToLower(parsed.Scheme) + "://" + serviceHostRe.ReplaceAllString(host, ""), true
}

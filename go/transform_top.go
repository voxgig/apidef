/* Copyright (c) 2024-2025 Voxgig, MIT License */

package apidef

// TopTransform sets API info and servers from the definition.
func TopTransform(ctx *ApiDefContext) (*TransformResult, error) {
	kit := getKit(ctx)
	def := ctx.Def

	info, _ := def["info"].(map[string]any)
	if info != nil {
		kit["info"] = info
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
		url := scheme + "://" + host
		if basePath != "" {
			url += basePath
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

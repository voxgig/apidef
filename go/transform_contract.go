package apidef

import "strings"

func ContractTransform(ctx *ApiDefContext) (*TransformResult, error) {
	entities, _ := getKit(ctx)["entity"].(map[string]any)
	paths, _ := ctx.Def["paths"].(map[string]any)
	for _, ev := range entities {
		entity, _ := ev.(map[string]any)
		ops, _ := entity["op"].(map[string]any)
		for _, ov := range ops {
			op, _ := ov.(map[string]any)
			points, _ := op["points"].([]any)
			for _, pv := range points {
				point, _ := pv.(map[string]any)
				orig, _ := point["orig"].(string)
				verb, _ := point["method"].(string)
				path, _ := paths[orig].(map[string]any)
				method, _ := path[strings.ToLower(verb)].(map[string]any)
				query, _ := ctx.Def["query"].(map[string]any)
				mutation, _ := ctx.Def["mutation"].(map[string]any)
				graphql := query[orig]
				if graphql == nil {
					graphql = mutation[orig]
				}
				if method == nil && graphql == nil {
					continue
				}
				guideKind := "path"
				if graphql != nil {
					guideKind = "field"
				}
				ge, _ := ctx.Guide["entity"].(map[string]any)
				gent, _ := ge[entity["name"].(string)].(map[string]any)
				gp, _ := gent[guideKind].(map[string]any)
				gpath, _ := gp[orig].(map[string]any)
				goops, _ := gpath["op"].(map[string]any)
				gop, _ := goops[op["name"].(string)].(map[string]any)
				if v, ok := gop["live"]; ok {
					point["live"] = v
				}
				source := "openapi3"
				if ctx.Def["swagger"] != nil {
					source = "swagger2"
				}
				if graphql != nil {
					source = "graphql"
				}
				point["contract"] = map[string]any{"version": 1, "id": verb + " " + orig, "source": source}
			}
		}
	}
	return &TransformResult{OK: true, Msg: "contract"}, nil
}

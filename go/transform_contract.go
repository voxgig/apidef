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
				orig, _ := point["o"].(string)
				verb, _ := point["m"].(string)
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
				// update also holds a promoted PATCH and a create made only of
				// actions, whose guide ops keep their own names.
				if op["name"] == "update" && !sameMethod(gop, verb) {
					for _, name := range []string{"patch", "create"} {
						if alt, _ := goops[name].(map[string]any); sameMethod(alt, verb) {
							gop = alt
							break
						}
					}
				}
				if v, ok := gop["live"]; ok {
					point["li"] = v
				}
				source := "openapi3"
				if ctx.Def["swagger"] != nil {
					source = "swagger2"
				}
				if graphql != nil {
					source = "graphql"
				}
				point["co"] = map[string]any{"version": 2, "id": verb + " " + orig, "source": source}
			}
		}
	}
	return &TransformResult{OK: true, Msg: "contract"}, nil
}

func sameMethod(gop map[string]any, verb string) bool {
	method, _ := gop["method"].(string)
	return gop != nil && strings.EqualFold(method, verb)
}

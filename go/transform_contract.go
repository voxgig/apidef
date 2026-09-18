package apidef

import (
	"bytes"
	"encoding/json"
	"reflect"
	"strconv"
	"strings"
)

func contractCopy(v any) any {
	return contractCopyAt(v, "#", map[uintptr]string{})
}
func contractCopyAt(v any, path string, ancestors map[uintptr]string) any {
	switch n := v.(type) {
	case map[string]any:
		ptr := reflect.ValueOf(n).Pointer()
		if previous, ok := ancestors[ptr]; ok {
			return map[string]any{"$ref": previous}
		}
		ancestors[ptr] = path
		defer delete(ancestors, ptr)
		out := map[string]any{}
		for _, k := range sortedKeys(n) {
			if !strings.HasSuffix(k, "$") && !strings.HasPrefix(k, "x-") {
				escaped := strings.ReplaceAll(strings.ReplaceAll(k, "~", "~0"), "/", "~1")
				out[k] = contractCopyAt(n[k], path+"/"+escaped, ancestors)
			}
		}
		return out
	case []any:
		ptr := reflect.ValueOf(n).Pointer()
		if previous, ok := ancestors[ptr]; ok {
			return map[string]any{"$ref": previous}
		}
		ancestors[ptr] = path
		defer delete(ancestors, ptr)
		out := make([]any, len(n))
		for i, val := range n {
			out[i] = contractCopyAt(val, path+"/"+strconv.Itoa(i), ancestors)
		}
		return out
	}
	return v
}
func graphqlInputTypes(field any, types map[string]any) map[string]any {
	out := map[string]any{}
	var visit func(string)
	visit = func(name string) {
		value, ok := types[name]
		if !ok {
			return
		}
		if _, seen := out[name]; seen {
			return
		}
		out[name] = value
		typ, _ := value.(map[string]any)
		if typ["kind"] == "INPUT_OBJECT" {
			fields, _ := typ["fields"].(map[string]any)
			for _, child := range fields {
				f, _ := child.(map[string]any)
				name, _ := f["type"].(string)
				visit(name)
			}
		}
	}
	f, _ := field.(map[string]any)
	args, _ := f["args"].([]any)
	for _, arg := range args {
		a, _ := arg.(map[string]any)
		name, _ := a["type"].(string)
		visit(name)
	}
	return out
}
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
				facts := map[string]any{"protocol": "http", "securitySource": "unspecified"}
				for _, k := range []string{"operationId", "requestBody", "responses", "consumes", "produces"} {
					if v, ok := method[k]; ok {
						facts[k] = v
					}
				}
				parameters := []any{}
				if p, ok := path["parameters"].([]any); ok {
					parameters = append(parameters, p...)
				}
				if p, ok := method["parameters"].([]any); ok {
					parameters = append(parameters, p...)
				}
				facts["parameters"] = parameters
				if v, ok := method["security"]; ok {
					facts["security"] = v
					facts["securitySource"] = "operation"
				} else if v, ok := ctx.Def["security"]; ok {
					facts["security"] = v
					facts["securitySource"] = "definition"
				}
				components, _ := ctx.Def["components"].(map[string]any)
				if v, ok := components["securitySchemes"]; ok {
					facts["securitySchemes"] = v
				} else if v, ok := ctx.Def["securityDefinitions"]; ok {
					facts["securitySchemes"] = v
				}
				for _, k := range []string{"consumes", "produces"} {
					if _, ok := facts[k]; !ok {
						if v, yes := ctx.Def[k]; yes {
							facts[k] = v
						}
					}
				}
				guideKind := "path"
				if graphql != nil {
					facts = map[string]any{"protocol": "graphql", "field": graphql}
					types, _ := ctx.Def["types"].(map[string]any)
					facts["types"] = graphqlInputTypes(graphql, types)
					facts["typesScope"] = "inputs"
					if v, ok := point["graphql"]; ok {
						facts["invocation"] = v
					}
					guideKind = "field"
				}
				ge, _ := ctx.Guide["entity"].(map[string]any)
				gent, _ := ge[entity["name"].(string)].(map[string]any)
				gp, _ := gent[guideKind].(map[string]any)
				gpath, _ := gp[orig].(map[string]any)
				goops, _ := gpath["op"].(map[string]any)
				gop, _ := goops[op["name"].(string)].(map[string]any)
				correction, _ := gop["contract"].(map[string]any)
				sources := map[string]any{}
				for _, key := range []string{"requestBody", "responses", "parameters", "security"} {
					if value, ok := correction[key]; ok {
						facts[key] = value
						sources[key] = "guide"
					}
				}
				if len(sources) > 0 {
					facts["factSources"] = sources
				}
				if v, ok := gop["live"]; ok {
					facts["live"] = v
				}
				var buffer bytes.Buffer
				encoder := json.NewEncoder(&buffer)
				encoder.SetEscapeHTML(false)
				err := encoder.Encode(contractCopy(facts))
				data := strings.TrimSuffix(buffer.String(), "\n")
				if err != nil {
					return nil, err
				}
				source := "openapi3"
				if ctx.Def["swagger"] != nil {
					source = "swagger2"
				}
				if graphql != nil {
					source = "graphql"
				}
				point["contract"] = map[string]any{"version": 1, "id": verb + " " + orig, "source": source, "json": data}
			}
		}
	}
	return &TransformResult{OK: true, Msg: "contract"}, nil
}

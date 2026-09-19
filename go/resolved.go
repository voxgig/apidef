package apidef

import (
	"fmt"
	"strings"
)

type ResolvedOperation map[string]any

type OperationSelector struct {
	Entity string
	Op     string
}

type ResolvedSpec struct {
	Version int
	Kind    string
	Def     map[string]any
	guide   func() map[string]any
}

func graphqlInputTypes(field, types map[string]any) map[string]any {
	out := map[string]any{}
	var visit func(string)
	visit = func(name string) {
		typ, ok := types[name].(map[string]any)
		if !ok {
			return
		}
		if _, seen := out[name]; seen {
			return
		}
		out[name] = typ
		if typ["kind"] == "INPUT_OBJECT" {
			fields, _ := typ["fields"].(map[string]any)
			for _, key := range sortedKeys(fields) {
				child, _ := fields[key].(map[string]any)
				name, _ := child["type"].(string)
				visit(name)
			}
		}
	}
	args, _ := field["args"].([]any)
	for _, value := range args {
		arg, _ := value.(map[string]any)
		name, _ := arg["type"].(string)
		visit(name)
	}
	return out
}

func OperationFacts(def map[string]any, point map[string]any) ResolvedOperation {
	orig, _ := point["orig"].(string)
	verb, _ := point["method"].(string)
	paths, _ := def["paths"].(map[string]any)
	path, _ := paths[orig].(map[string]any)
	method, _ := path[strings.ToLower(verb)].(map[string]any)
	query, _ := def["query"].(map[string]any)
	mutation, _ := def["mutation"].(map[string]any)
	graphql, _ := query[orig].(map[string]any)
	if graphql == nil {
		graphql, _ = mutation[orig].(map[string]any)
	}
	if graphql != nil {
		types, _ := def["types"].(map[string]any)
		return ResolvedOperation{"protocol": "graphql", "field": graphql,
			"types": graphqlInputTypes(graphql, types), "typesScope": "inputs"}
	}
	if method == nil {
		return nil
	}
	facts := ResolvedOperation{"protocol": "http", "securitySource": "unspecified"}
	for _, key := range []string{"operationId", "requestBody", "responses", "consumes", "produces"} {
		if value, ok := method[key]; ok {
			facts[key] = value
		}
	}
	params := []any{}
	if values, ok := path["parameters"].([]any); ok {
		params = append(params, values...)
	}
	if values, ok := method["parameters"].([]any); ok {
		params = append(params, values...)
	}
	facts["parameters"] = params
	if value, ok := method["security"]; ok {
		facts["security"] = value
		facts["securitySource"] = "operation"
	} else if value, ok := def["security"]; ok {
		facts["security"] = value
		facts["securitySource"] = "definition"
	}
	if facts["security"] == nil {
		if value, ok := def["security"]; ok {
			facts["security"] = value
		}
	}
	components, _ := def["components"].(map[string]any)
	if value := components["securitySchemes"]; value != nil {
		facts["securitySchemes"] = value
	} else if value, ok := def["securityDefinitions"]; ok {
		facts["securitySchemes"] = value
	}
	for _, key := range []string{"consumes", "produces"} {
		if facts[key] == nil {
			if value, ok := def[key]; ok {
				facts[key] = value
			}
		}
	}
	return facts
}

func OperationIndex(def map[string]any) map[string]ResolvedOperation {
	out := map[string]ResolvedOperation{}
	paths, _ := def["paths"].(map[string]any)
	for _, path := range sortedKeys(paths) {
		item, _ := paths[path].(map[string]any)
		for _, method := range []string{"get", "put", "post", "delete", "options", "head", "patch", "trace"} {
			if item[method] == nil {
				continue
			}
			if facts := OperationFacts(def, map[string]any{"method": method, "orig": path}); facts != nil {
				out[strings.ToUpper(method)+" "+path] = facts
			}
		}
	}
	for _, kind := range []string{"query", "mutation"} {
		fields, _ := def[kind].(map[string]any)
		for _, field := range sortedKeys(fields) {
			if facts := OperationFacts(def, map[string]any{"method": "POST", "orig": field}); facts != nil {
				out["POST "+field] = facts
			}
		}
	}
	return out
}

func operationGuide(guide map[string]any, method, path string, graphql bool, selector *OperationSelector) (map[string]any, error) {
	kind := "path"
	if graphql {
		kind = "field"
	}
	entities, _ := guide["entity"].(map[string]any)
	var match map[string]any
	for _, entityName := range sortedKeys(entities) {
		if selector != nil && selector.Entity != entityName {
			continue
		}
		entity, _ := entities[entityName].(map[string]any)
		paths, _ := entity[kind].(map[string]any)
		entry, _ := paths[path].(map[string]any)
		ops, _ := entry["op"].(map[string]any)
		for _, opName := range sortedKeys(ops) {
			if selector != nil && selector.Op != opName {
				continue
			}
			op, _ := ops[opName].(map[string]any)
			verb, _ := op["method"].(string)
			if verb != "" && !strings.EqualFold(verb, method) {
				continue
			}
			_, hasContract := op["contract"]
			_, hasLive := op["live"]
			if !hasContract && !hasLive {
				continue
			}
			if match != nil {
				return nil, fmt.Errorf("Ambiguous operation guide for %s %s; select entity and op", method, path)
			}
			match = op
		}
	}
	return match, nil
}

func MakeResolved(kind string, def map[string]any, guide ...func() map[string]any) *ResolvedSpec {
	resolved := &ResolvedSpec{Version: 1, Kind: kind, Def: def}
	if len(guide) > 0 {
		resolved.guide = guide[0]
	}
	return resolved
}

func (r *ResolvedSpec) Operation(method, path string, selection ...OperationSelector) (ResolvedOperation, error) {
	facts := OperationFacts(r.Def, map[string]any{"method": method, "orig": path})
	if facts == nil {
		return nil, nil
	}
	var guide map[string]any
	if r.guide != nil {
		guide = r.guide()
	}
	var selector *OperationSelector
	if len(selection) > 0 {
		selector = &selection[0]
	}
	op, err := operationGuide(guide, method, path, facts["protocol"] == "graphql", selector)
	if err != nil {
		return nil, err
	}
	corrections, _ := op["contract"].(map[string]any)
	sources := map[string]any{}
	for _, key := range []string{"requestBody", "responses", "parameters", "security"} {
		if value, ok := corrections[key]; ok {
			facts[key] = value
			sources[key] = "guide"
		}
	}
	if len(sources) > 0 {
		facts["factSources"] = sources
	}
	if value, ok := op["live"]; ok {
		facts["live"] = value
	}
	return facts, nil
}

func PublishResolved(ctx map[string]any, kind string, def map[string]any, guide ...func() map[string]any) *ResolvedSpec {
	resolved := MakeResolved(kind, def, guide...)
	if ctx != nil {
		state, _ := ctx["state"].(map[string]any)
		if state == nil {
			state = map[string]any{}
			ctx["state"] = state
		}
		apidef, _ := state["apidef"].(map[string]any)
		if apidef == nil {
			apidef = map[string]any{}
			state["apidef"] = apidef
		}
		apidef["resolved"] = resolved
	}
	return resolved
}

func ResolvedSpecFrom(carrier any) *ResolvedSpec {
	switch value := carrier.(type) {
	case *ApiDefResult:
		if value != nil {
			return ResolvedSpecFrom(value.Ctx)
		}
	case *ApiDefContext:
		if value != nil {
			return value.Resolved
		}
	case map[string]any:
		if resolved, ok := value["resolved"].(*ResolvedSpec); ok {
			return resolved
		}
		if resolved := ResolvedSpecFrom(value["ctx"]); resolved != nil {
			return resolved
		}
		state, _ := value["state"].(map[string]any)
		apidef, _ := state["apidef"].(map[string]any)
		if resolved, ok := apidef["resolved"].(*ResolvedSpec); ok {
			return resolved
		}
		apidef, _ = value["apidef"].(map[string]any)
		resolved, _ := apidef["resolved"].(*ResolvedSpec)
		return resolved
	}
	return nil
}

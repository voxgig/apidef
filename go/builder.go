/* Copyright (c) 2024-2025 Voxgig, MIT License */

package apidef

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

func writeGen(ctx *ApiDefContext, path string, src string) {
	if err := os.WriteFile(path, []byte(src), 0644); err != nil {
		warnGen(ctx, "write", path, err)
	}
}

// mkdirGen is MkdirAll with the same error reporting.
func mkdirGen(ctx *ApiDefContext, dir string) {
	if err := os.MkdirAll(dir, 0755); err != nil {
		warnGen(ctx, "mkdir", dir, err)
	}
}

func warnGen(ctx *ApiDefContext, what string, path string, err error) {
	if ctx == nil || ctx.Warn == nil {
		return
	}
	ctx.Warn.Warn(map[string]any{
		"what": what,
		"path": path,
		"err":  err.Error(),
		"note": fmt.Sprintf("builder: %s failed: %s: %s",
			what, RelativizePath(path), err.Error()),
	})
}

// MakeEntityBuilder creates a builder that generates entity definition files.
func MakeEntityBuilder(ctx *ApiDefContext) (func() error, error) {
	return func() error {
		entityBuilder(ctx)
		infoBuilder(ctx)
		return nil
	}, nil
}

func entityBuilder(ctx *ApiDefContext) {
	kit := getKit(ctx)
	entityMap, _ := kit["entity"].(map[string]any)
	folder := ctx.Opts.Folder
	prefix := ctx.Opts.OutPrefix

	entityDir := filepath.Join(folder, "entity")
	mkdirGen(ctx, entityDir)

	barrel := []string{"# Entity Models\n"}

	// Sort entity names for deterministic output
	entnames := make([]string, 0, len(entityMap))
	for k := range entityMap {
		entnames = append(entnames, k)
	}
	sort.Strings(entnames)

	for _, entityName := range entnames {
		entity, _ := entityMap[entityName].(map[string]any)
		if entity == nil {
			continue
		}

		entityFile := prefix + entityName + ".aon"
		cleanEntity := stripEntityDefaults(entity)
		cleanEntity = stripEmptyRelations(cleanEntity)
		cleanEntity, relations := entityAncestorSource(cleanEntity.(map[string]any))
		entityJSONIC := FormatJSONIC(cleanEntity)
		entityJSONIC = strings.TrimSpace(entityJSONIC)
		if len(entityJSONIC) > 2 && entityJSONIC[0] == '{' && entityJSONIC[len(entityJSONIC)-1] == '}' {
			entityJSONIC = entityJSONIC[1 : len(entityJSONIC)-1]
		}

		fieldAliasesSrc := buildFieldAliases(entity)

		entitySrc := fmt.Sprintf("# Entity: %s\n\n", entityName) +
			fmt.Sprintf("main: %s: entity: %s: {\n\n", KIT, entityName) +
			fmt.Sprintf("  alias: field: %s\n", fieldAliasesSrc) +
			entityJSONIC +
			relations +
			"\n\n}\n"

		writeGen(ctx, filepath.Join(entityDir, entityFile), entitySrc)
		barrel = append(barrel, fmt.Sprintf(`@"%s"`, entityFile))
	}

	indexFile := prefix + "entity-index.aon"
	writeGen(ctx, filepath.Join(entityDir, indexFile), strings.Join(barrel, "\n"))
}

func entityAncestorSource(entity map[string]any) (map[string]any, string) {
	model := make(map[string]any, len(entity))
	for k, v := range entity {
		model[k] = v
	}
	rel, ok := entity["relations"].(map[string]any)
	if !ok {
		return model, ""
	}
	other := make(map[string]any, len(rel))
	for k, v := range rel {
		if k != "ancestors" {
			other[k] = v
		}
	}
	delete(model, "relations")
	if len(other) > 0 {
		model["relations"] = other
	}
	data, _ := json.Marshal(rel["ancestors"])
	var ancestors [][]string
	if err := json.Unmarshal(data, &ancestors); err != nil || len(ancestors) == 0 {
		return model, ""
	}
	chains := make([]string, 0, len(ancestors))
	for _, chain := range ancestors {
		links := make([]string, 0, len(chain))
		for _, name := range chain {
			links = append(links, "path("+jsonString("$.main.kit.entity."+name)+")")
		}
		chains = append(chains, "    ["+strings.Join(links, " ")+"]")
	}
	return model, "\n  relations: ancestors: [\n" + strings.Join(chains, "\n") + "\n  ]"
}

func stripEntityDefaults(entity any) any {
	clean := stripKeys(entity, "active")
	if ent, ok := clean.(map[string]any); ok {
		op, _ := ent["op"].(map[string]any)
		for _, value := range op {
			operation, _ := value.(map[string]any)
			points, _ := operation["points"].([]any)
			for _, value := range points {
				point, _ := value.(map[string]any)
				if point["a"] == true {
					delete(point, "a")
				}
				args, _ := point["g"].(map[string]any)
				for _, value := range args {
					list, _ := value.([]any)
					for _, value := range list {
						if arg, ok := value.(map[string]any); ok && arg["a"] == true {
							delete(arg, "a")
						}
					}
				}
			}
		}
		source := entity.(map[string]any)
		fields, ok := source["fields"].(map[string]any)
		if !ok {
			return clean
		}
		fields = deepCopyMap(fields)
		ent["fields"] = fields
		for _, value := range fields {
			if field, ok := value.(map[string]any); ok && field["a"] == true {
				delete(field, "a")
			}
		}
	}
	return clean
}

// stripKeys recursively removes the named key from all maps.
func stripKeys(val any, key string) any {
	switch v := val.(type) {
	case map[string]any:
		out := make(map[string]any, len(v))
		for _, k := range sortedKeys(v) {
			child := v[k]
			if k == key {
				continue
			}
			out[k] = stripKeys(child, key)
		}
		return out
	case []any:
		out := make([]any, len(v))
		for i, child := range v {
			out[i] = stripKeys(child, key)
		}
		return out
	default:
		return val
	}
}

// stripEmptyRelations removes the relations key if ancestors is empty.
// TS only includes relations when ancestors exist.
// stripEmptyRelations removes the relations key if ancestors is empty/nil.
// TS only includes relations when ancestors exist.
func stripEmptyRelations(val any) any {
	m, ok := val.(map[string]any)
	if !ok {
		return val
	}
	rel, ok := m["relations"].(map[string]any)
	if !ok {
		return val
	}

	// Check if ancestors is non-empty (could be []any, [][]string, etc.)
	hasAncestors := false
	switch anc := rel["ancestors"].(type) {
	case []any:
		hasAncestors = len(anc) > 0
	case [][]string:
		hasAncestors = len(anc) > 0
	}

	if !hasAncestors {
		out := make(map[string]any, len(m))
		for _, k := range sortedKeys(m) {
			v := m[k]
			if k == "relations" {
				continue
			}
			out[k] = v
		}
		return out
	}
	return val
}

func buildFieldAliases(entity map[string]any) string {
	aliases := map[string]any{}
	b, _ := json.MarshalIndent(aliases, "", "  ")
	return string(b)
}

func infoBuilder(ctx *ApiDefContext) {
	kit := getKit(ctx)
	info, _ := kit["info"].(map[string]any)
	folder := ctx.Opts.Folder
	prefix := ctx.Opts.OutPrefix

	apiDir := filepath.Join(folder, "api")
	mkdirGen(ctx, apiDir)

	infoFile := prefix + "api-info.aon"
	modelInfo := map[string]any{
		"main": map[string]any{
			KIT: map[string]any{
				"info": info,
			},
		},
	}

	modelDefSrc := FormatJSONIC(modelInfo)

	modelDefSrc = strings.TrimSpace(modelDefSrc)
	if len(modelDefSrc) >= 2 {
		modelDefSrc = modelDefSrc[1 : len(modelDefSrc)-1]
	}
	modelDefSrc = strings.ReplaceAll(modelDefSrc, "\n  ", "\n")

	src := "# API Information\n\n" + modelDefSrc
	writeGen(ctx, filepath.Join(apiDir, infoFile), src)
}

// MakeFlowBuilder creates a builder that generates flow definition files.
func MakeFlowBuilder(ctx *ApiDefContext) (func() error, error) {
	kit := getKit(ctx)
	flows, _ := kit["flow"].(map[string]any)

	return func() error {
		folder := ctx.Opts.Folder
		prefix := ctx.Opts.OutPrefix

		flowDir := filepath.Join(folder, "flow")
		mkdirGen(ctx, flowDir)

		barrel := []string{"# Flows\n"}

		// Sort flow names for deterministic output
		flownames := make([]string, 0, len(flows))
		for k := range flows {
			flownames = append(flownames, k)
		}
		sort.Strings(flownames)

		for _, flowName := range flownames {
			flow, _ := flows[flowName].(map[string]any)
			if flow == nil {
				continue
			}

			flow["key$"] = flowName

			flowfile := prefix + flowName + ".aon"
			entNameMap := map[string]any{"name": flowName}
			flowModelSrc := FormatJsonSrc(ToJSONOrdered(flow))
			flowSrc := fmt.Sprintf("# %s\n\nmain: %s: flow: %s:\n%s",
				Nom(entNameMap, "Name"), KIT, flowName, flowModelSrc)

			writeGen(ctx, filepath.Join(flowDir, flowfile), flowSrc)
			barrel = append(barrel, fmt.Sprintf(`@"%s"`, flowfile))
		}

		barrelFile := prefix + "flow-index.aon"
		writeGen(ctx, filepath.Join(flowDir, barrelFile), strings.Join(barrel, "\n"))
		return nil
	}, nil
}

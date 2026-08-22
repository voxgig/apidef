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

// writeGen writes one generated model file, recording any failure as a
// pipeline warning. Discarding these errors made a build that wrote nothing —
// read-only output directory, full disk, bad path — still report OK with an
// empty warning list, so the caller had no way to tell an empty model from a
// failed write. The TS side gets this from jostraca, which reports the files
// it wrote and drives `result.reload`.
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
		cleanEntity := stripKeys(entity, "active")
		cleanEntity = stripEmptyRelations(cleanEntity)
		entityJSONIC := FormatJSONIC(cleanEntity)
		// Mirrors src/builder/entity/entity.ts:
		//   entityJSONIC = formatJSONIC(entity).trim()
		//   entityJSONIC = entityJSONIC.substring(1, entityJSONIC.length - 1)
		entityJSONIC = strings.TrimSpace(entityJSONIC)
		if len(entityJSONIC) > 2 && entityJSONIC[0] == '{' && entityJSONIC[len(entityJSONIC)-1] == '}' {
			entityJSONIC = entityJSONIC[1 : len(entityJSONIC)-1]
		}

		fieldAliasesSrc := buildFieldAliases(entity)

		// Mirrors src/builder/entity/entity.ts: file ends with "\n\n}\n".
		entitySrc := fmt.Sprintf("# Entity: %s\n\n", entityName) +
			fmt.Sprintf("main: %s: entity: %s: {\n\n", KIT, entityName) +
			fmt.Sprintf("  alias: field: %s\n", fieldAliasesSrc) +
			entityJSONIC +
			"\n\n}\n"

		writeGen(ctx, filepath.Join(entityDir, entityFile), entitySrc)
		barrel = append(barrel, fmt.Sprintf(`@"%s"`, entityFile))
	}

	indexFile := prefix + "entity-index.aon"
	writeGen(ctx, filepath.Join(entityDir, indexFile), strings.Join(barrel, "\n"))
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

	// Mirrors src/builder/entity/info.ts:
	//   formatJSONIC(modelInfo).trim().substring(1, len-1).replace(/\n  /g, '\n')
	// Trim first so stripping the first and last char removes the wrapping
	// '{' and '}' — without the trim the trailing newline is removed instead,
	// leaving a dangling '}'. Then shift indent left by one level.
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

			// Mirrors src/builder/flow.ts: jostraca's `each(flows, ...)`
			// mutates each value to set `key$` to the map key. Reproduce
			// that here so the emitted JSONIC matches TS output.
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

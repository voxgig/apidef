/* Copyright (c) 2024-2025 Voxgig, MIT License */

package apidef

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	jostraca "github.com/jostraca/jostraca/go"
)

// Builder adds its model files to the component tree of the generate step.
type Builder func(j *jostraca.J)

type modelFile struct {
	name string
	src  string
}

// MakeEntityBuilder creates a builder that generates entity definition files.
func MakeEntityBuilder(ctx *ApiDefContext) (Builder, error) {
	entityBuilder := resolveEntity(ctx)
	infoBuilder := resolveInfo(ctx)
	return func(j *jostraca.J) {
		entityBuilder(j)
		infoBuilder(j)
	}, nil
}

func resolveEntity(ctx *ApiDefContext) Builder {
	kit := getKit(ctx)
	entityMap, _ := kit["entity"].(map[string]any)
	prefix := ctx.Opts.OutPrefix

	barrel := []string{"# Entity Models\n"}
	entityFiles := []modelFile{}

	for _, entityName := range sortedKeys(entityMap) {
		entity, _ := entityMap[entityName].(map[string]any)
		if entity == nil {
			continue
		}
		// jostraca's each() stamps the key on each entity in the TypeScript builder.
		entity["key$"] = entityName

		entityFile := prefix + entityName + ".aontu"
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

		entityFiles = append(entityFiles, modelFile{name: entityFile, src: entitySrc})
		barrel = append(barrel, `@"./`+filepath.Base(entityFile)+`"`)
	}

	indexFile := prefix + "entity-index.aontu"
	indexSrc := strings.Join(barrel, "\n")

	return func(j *jostraca.J) {
		j.Folder("entity", func(j *jostraca.J) {
			for _, entityFile := range entityFiles {
				j.File(entityFile.name, func(j *jostraca.J) { j.Content(entityFile.src) })
			}
			j.File(indexFile, func(j *jostraca.J) { j.Content(indexSrc) })
		})
	}
}

// GcEntityFiles removes generated entity files whose entity the def does not
// derive, and returns their names. Mirrors gcEntityFiles in
// ts/src/builder/entity/entity.ts.
func GcEntityFiles(log Logger, modelFolder string, outprefix string, entityNames []string) []string {
	removed := []string{}
	entityFolder := filepath.Join(modelFolder, "entity")

	keep := map[string]bool{outprefix + "entity-index.aontu": true}
	for _, name := range entityNames {
		keep[outprefix+name+".aontu"] = true
	}

	entries, err := os.ReadDir(entityFolder)
	if err != nil {
		return removed
	}

	for _, entry := range entries {
		name := entry.Name()
		// `.aon` is what a project generated before the rename still holds.
		if !strings.HasSuffix(name, ".aontu") && !strings.HasSuffix(name, ".aon") {
			continue
		}
		if !strings.HasPrefix(name, outprefix) || keep[name] {
			continue
		}

		file := filepath.Join(entityFolder, name)
		src, err := os.ReadFile(file)
		if err == nil && !strings.HasPrefix(string(src), "# Entity: ") {
			continue
		}
		if err == nil {
			err = os.Remove(file)
		}
		if err != nil {
			if log != nil {
				log.Warn(map[string]any{
					"point": "entity-gc-failed", "file": name, "err": err.Error(),
					"note": "could not gc " + name + ": " + err.Error(),
				})
			}
			continue
		}

		removed = append(removed, name)
		if log != nil {
			log.Info(map[string]any{
				"point": "entity-gc", "file": name,
				"note": "removed orphaned entity model file " + name +
					" (no longer derived from the def)",
			})
		}
	}

	return removed
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

func resolveInfo(ctx *ApiDefContext) Builder {
	kit := getKit(ctx)
	info, _ := kit["info"].(map[string]any)

	infoFile := ctx.Opts.OutPrefix + "api-info.aontu"
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

	return func(j *jostraca.J) {
		j.Folder("api", func(j *jostraca.J) {
			j.File(infoFile, func(j *jostraca.J) { j.Content(src) })
		})
	}
}

// MakeFlowBuilder creates a builder that generates flow definition files.
func MakeFlowBuilder(ctx *ApiDefContext) (Builder, error) {
	kit := getKit(ctx)
	flows, _ := kit["flow"].(map[string]any)

	flownames := []string{}
	for _, flowName := range sortedKeys(flows) {
		if flow, _ := flows[flowName].(map[string]any); flow != nil {
			flow["key$"] = flowName
			flownames = append(flownames, flowName)
		}
	}
	filebase := flowFileBases(flownames)

	for _, name := range flownames {
		if name != filebase[name] && ctx.Warn != nil {
			ctx.Warn.Warn(map[string]any{
				"step": "flow",
				"note": "flow name " + name + " collides with another when case is" +
					" ignored: file written as " + filebase[name] + ".aontu",
			})
		}
	}

	prefix := ctx.Opts.OutPrefix

	return func(j *jostraca.J) {
		j.Folder("flow", func(j *jostraca.J) {
			barrel := []string{"# Flows\n"}

			for _, flowName := range flownames {
				flow := flows[flowName].(map[string]any)

				flowfile := prefix + filebase[flowName] + ".aontu"
				entNameMap := map[string]any{"name": flowName}
				flowModelSrc := FormatJsonSrc(ToJSONOrdered(flow))
				flowSrc := fmt.Sprintf("# %s\n\nmain: %s: flow: %s:\n%s",
					Nom(entNameMap, "Name"), KIT, flowName, flowModelSrc)

				barrel = append(barrel, `@"./`+filepath.Base(flowfile)+`"`)
				j.File(filepath.Base(flowfile), func(j *jostraca.J) { j.Content(flowSrc) })
			}

			barrelFile := prefix + "flow-index.aontu"
			barrelSrc := strings.Join(barrel, "\n")
			j.File(barrelFile, func(j *jostraca.J) { j.Content(barrelSrc) })
		})
	}, nil
}

// flowFileBases gives each flow a file base name that stays unique when case
// is ignored. Every member of a colliding group is suffixed in sorted order,
// so none keeps the bare name. Mirrors flowFileBases in ts/src/builder/flow.ts.
func flowFileBases(names []string) map[string]string {
	bylower := map[string][]string{}
	for _, name := range names {
		lower := strings.ToLower(name)
		bylower[lower] = append(bylower[lower], name)
	}

	base := map[string]string{}
	for _, group := range bylower {
		sortUTF16(group)
		if len(group) == 1 {
			base[group[0]] = group[0]
			continue
		}
		for i, name := range group {
			base[name] = fmt.Sprintf("%s__%d", name, i+1)
		}
	}

	return base
}

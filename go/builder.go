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
	os.MkdirAll(entityDir, 0755)

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

		entityFile := prefix + entityName + ".jsonic"
		entityJSONIC := FormatJSONIC(entity)
		// Trim outer braces
		if len(entityJSONIC) > 2 {
			entityJSONIC = entityJSONIC[1 : len(entityJSONIC)-1]
		}

		fieldAliasesSrc := buildFieldAliases(entity)

		entitySrc := fmt.Sprintf("# Entity: %s\n\n", entityName) +
			fmt.Sprintf("main: %s: entity: %s: {\n\n", KIT, entityName) +
			fmt.Sprintf("  alias: field: %s\n", fieldAliasesSrc) +
			entityJSONIC +
			"\n\n}\n"

		os.WriteFile(filepath.Join(entityDir, entityFile), []byte(entitySrc), 0644)
		barrel = append(barrel, fmt.Sprintf(`@"%s"`, entityFile))
	}

	indexFile := prefix + "entity-index.jsonic"
	os.WriteFile(filepath.Join(entityDir, indexFile),
		[]byte(strings.Join(barrel, "\n")), 0644)
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
	os.MkdirAll(apiDir, 0755)

	infoFile := prefix + "api-info.jsonic"
	modelInfo := map[string]any{
		"main": map[string]any{
			KIT: map[string]any{
				"info": info,
			},
		},
	}

	modelDefSrc := FormatJSONIC(modelInfo)

	src := "# API Information\n\n" + modelDefSrc
	os.WriteFile(filepath.Join(apiDir, infoFile), []byte(src), 0644)
}

// MakeFlowBuilder creates a builder that generates flow definition files.
func MakeFlowBuilder(ctx *ApiDefContext) (func() error, error) {
	kit := getKit(ctx)
	flows, _ := kit["flow"].(map[string]any)

	return func() error {
		folder := ctx.Opts.Folder
		prefix := ctx.Opts.OutPrefix

		flowDir := filepath.Join(folder, "flow")
		os.MkdirAll(flowDir, 0755)

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

			flowfile := prefix + flowName + ".jsonic"
			entNameMap := map[string]any{"name": flowName}
			flowModelSrc := FormatJsonSrc(ToJSON(flow))
			flowSrc := fmt.Sprintf("# %s\n\nmain: %s: flow: %s:\n%s",
				Nom(entNameMap, "Name"), KIT, flowName, flowModelSrc)

			os.WriteFile(filepath.Join(flowDir, flowfile), []byte(flowSrc), 0644)
			barrel = append(barrel, fmt.Sprintf(`@"%s"`, flowfile))
		}

		barrelFile := prefix + "flow-index.jsonic"
		os.WriteFile(filepath.Join(flowDir, barrelFile),
			[]byte(strings.Join(barrel, "\n")), 0644)
		return nil
	}, nil
}

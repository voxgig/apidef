/* Copyright (c) 2024-2025 Voxgig, MIT License */

package apidef

import (
	"encoding/json"
	"sort"
	"strings"
)

// SelectTransform selects response fields from OpenAPI definitions.
func SelectTransform(ctx *ApiDefContext) (*TransformResult, error) {
	kit := getKit(ctx)
	guide := ctx.Guide
	entityMap := kit["entity"].(map[string]any)

	msg := "select "
	guideEntity, _ := guide["entity"].(map[string]any)

	for _, entname := range sortedKeys(entityMap) {
		ment := entityMap[entname]
		mentMap, _ := ment.(map[string]any)
		if mentMap == nil {
			continue
		}
		opMap, _ := mentMap["op"].(map[string]any)
		for _, opkey := range sortedKeys(opMap) {
			mop := opMap[opkey]
			mopMap, _ := mop.(map[string]any)
			if mopMap == nil {
				continue
			}
			points, _ := mopMap["points"].([]any)

			for _, pt := range points {
				mtarget, _ := pt.(map[string]any)
				if mtarget == nil {
					continue
				}
				method, _ := mtarget["m"].(string)
				path, _ := mtarget["o"].(string)
				media, _ := guideBodyMedia(guide, entname, opkey, method, path)
				resolveSelect(guideEntity, entname, mtarget, arrayCarrier(ctx.Def, mtarget, media))
			}

			if len(points) > 0 {
				sortPoints(mopMap)
				warnSharedSelectors(ctx, mentMap, mopMap)
			}
		}
		msg += entname + " "
	}

	return &TransformResult{OK: true, Msg: msg}, nil
}

func resolveSelect(guideEntity map[string]any, entname string, mtarget map[string]any, carrier *arrayCarrierInfo) {
	selectMap, _ := mtarget["q"].(map[string]any)
	if selectMap == nil {
		selectMap = map[string]any{"exist": []any{}}
		mtarget["q"] = selectMap
	}

	margs, _ := mtarget["g"].(map[string]any)
	argKinds := []string{"params", "query", "header", "cookie"}

	exist, _ := selectMap["exist"].([]any)
	existSet := map[string]bool{}
	for _, e := range exist {
		if s, ok := e.(string); ok {
			existSet[s] = true
		}
	}

	graphql := "graphql" == mtarget["k"]
	for _, kind := range argKinds {
		kindArgs, _ := margs[kind].([]any)
		for _, arg := range kindArgs {
			argMap, _ := arg.(map[string]any)
			if argMap == nil {
				continue
			}
			if required, _ := argMap["r"].(bool); !required && (graphql || "params" != kind) {
				continue
			}
			name, _ := argMap["n"].(string)
			if !existSet[name] {
				exist = append(exist, name)
				existSet[name] = true
			}
		}
	}

	// The field an array body is sent from, when the body is required.
	if carrier != nil && carrier.required && !existSet[carrier.name] {
		exist = append(exist, carrier.name)
		existSet[carrier.name] = true
	}

	// Sort exist
	sort.Slice(exist, func(i, j int) bool {
		si, _ := exist[i].(string)
		sj, _ := exist[j].(string)
		return lessUTF16(si, sj)
	})
	selectMap["exist"] = exist

	// Check for actions. REST guides key entries by path, GraphQL guides by root field.
	gent, _ := guideEntity[entname].(map[string]any)
	if gent != nil {
		orig, _ := mtarget["o"].(string)
		gpaths, _ := gent["path"].(map[string]any)
		entry := gpaths[orig]
		if entry == nil {
			gfields, _ := gent["field"].(map[string]any)
			entry = gfields[orig]
		}
		if gpath, ok := entry.(map[string]any); ok {
			if action, ok := gpath["action"].(map[string]any); ok {
				for _, actname := range sortedKeys(action) {
					selectMap["$action"] = actname
					break
				}
			}
		}
	}
}

func sortPoints(mop map[string]any) {
	points, _ := mop["points"].([]any)
	sort.SliceStable(points, func(i, j int) bool {
		ai, _ := points[i].(map[string]any)
		aj, _ := points[j].(map[string]any)
		si, _ := ai["q"].(map[string]any)
		sj, _ := aj["q"].(map[string]any)
		ei, _ := si["exist"].([]any)
		ej, _ := sj["exist"].([]any)

		order := len(ej) - len(ei)
		if order != 0 {
			return order < 0
		}

		aai, _ := si["$action"].(string)
		aaj, _ := sj["$action"].(string)
		if aai != "" && aaj != "" {
			if aai != aaj {
				return lessUTF16(aai, aaj)
			}
		}

		return lessUTF16(existStr(ei), existStr(ej))
	})
}

// warnSharedSelectors mirrors ts/src/transform/select.ts.
func warnSharedSelectors(ctx *ApiDefContext, ment map[string]any, mop map[string]any) {
	if ctx.Warn == nil {
		return
	}
	points, _ := mop["points"].([]any)
	keys := []string{}
	groups := map[string][]map[string]any{}
	for _, pt := range points {
		mpoint, _ := pt.(map[string]any)
		if mpoint == nil {
			continue
		}
		q, _ := mpoint["q"].(map[string]any)
		var action any
		if a, ok := q["$action"].(string); ok {
			action = a
		}
		b, _ := json.Marshal([]any{action, q["exist"]})
		key := string(b)
		if _, ok := groups[key]; !ok {
			keys = append(keys, key)
		}
		groups[key] = append(groups[key], mpoint)
	}

	entname, _ := ment["name"].(string)
	opname, _ := mop["name"].(string)
	for _, key := range keys {
		group := groups[key]
		if len(group) < 2 {
			continue
		}
		names := make([]string, len(group))
		for i, mpoint := range group {
			m, _ := mpoint["m"].(string)
			o, _ := mpoint["o"].(string)
			names[i] = m + " " + o
		}
		q, _ := group[0]["q"].(map[string]any)
		exist, _ := q["exist"].([]any)
		parts := []string{}
		for _, e := range exist {
			if s, ok := e.(string); ok {
				parts = append(parts, s)
			}
		}
		existText := strings.Join(parts, ",")
		if "" == existText {
			existText = "none"
		}
		actionText := ""
		if action, ok := q["$action"].(string); ok {
			actionText = "; $action: " + action
		}
		ctx.Warn.Warn(map[string]any{
			"note": "Points " + strings.Join(names[:len(names)-1], ", ") + " and " + names[len(names)-1] +
				" on entity=" + entname + " op=" + opname + " have the same selector" +
				" (exist: " + existText + actionText + "), so only " + names[0] + " is ever chosen." +
				" An action or another entity in guide.aontu tells them apart.",
			"entity": entname,
			"op":     opname,
			"points": names,
		})
	}
}

func existStr(exist []any) string {
	var parts []string
	for _, e := range exist {
		if s, ok := e.(string); ok {
			parts = append(parts, s)
		}
	}
	return joinStr(parts, "\t")
}

func joinStr(parts []string, sep string) string {
	result := ""
	for i, p := range parts {
		if i > 0 {
			result += sep
		}
		result += p
	}
	return result
}

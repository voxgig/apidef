/* Copyright (c) 2024-2025 Voxgig, MIT License */

package apidef

import (
	"fmt"
	"path/filepath"
)

// ResolveElements resolves and executes guide elements in order.
func ResolveElements(
	ctx *ApiDefContext,
	kind string,
	subkind string,
	standard map[string]func(*ApiDefContext) (any, error),
) ([]any, error) {
	guide := ctx.Guide
	controlMap, _ := guide["control"].(map[string]any)
	kindMap, _ := controlMap[kind].(map[string]any)
	subkindMap, _ := kindMap[subkind].(map[string]any)

	target := kind + "." + subkind

	orderStr, _ := subkindMap["order"].(string)
	elementNames := splitAndFilterComma(orderStr)

	results := make([]any, 0)

	for _, en := range elementNames {
		element, err := resolveElement(en, subkindMap, target, standard, ctx)
		if err != nil {
			return nil, err
		}
		result, err := element(ctx)
		if err != nil {
			return nil, err
		}
		results = append(results, result)
	}

	return results, nil
}

func resolveElement(
	en string,
	control map[string]any,
	target string,
	standard map[string]func(*ApiDefContext) (any, error),
	ctx *ApiDefContext,
) (func(*ApiDefContext) (any, error), error) {
	// Check standard elements first
	if elem, ok := standard[en]; ok {
		return elem, nil
	}

	// Check control definition
	elementMap, _ := control["element"].(map[string]any)
	elemdef, _ := elementMap[en].(map[string]any)
	if elemdef == nil {
		return nil, fmt.Errorf("unknown element: %s", en)
	}

	// Custom elements must start with "custom"
	if len(en) < 6 || en[:6] != "custom" {
		return nil, fmt.Errorf("custom element name must start with \"custom\": %s", en)
	}

	// Load custom element (Go plugin loading not supported - return error)
	loadPath, _ := elemdef["load"].(string)
	customPath := filepath.Join(ctx.DefPath, loadPath)
	return nil, fmt.Errorf("custom element loading not supported in Go: %s (%s)",
		en, RelativizePath(customPath))
}

func splitAndFilterComma(s string) []string {
	var result []string
	for _, part := range splitByComma(s) {
		trimmed := trimSpace(part)
		if trimmed != "" {
			result = append(result, trimmed)
		}
	}
	return result
}

func splitByComma(s string) []string {
	var result []string
	start := 0
	for i := range s {
		if s[i] == ',' {
			result = append(result, s[start:i])
			start = i + 1
		}
	}
	result = append(result, s[start:])
	return result
}

func trimSpace(s string) string {
	start, end := 0, len(s)
	for start < end && (s[start] == ' ' || s[start] == '\t' || s[start] == '\n' || s[start] == '\r') {
		start++
	}
	for end > start && (s[end-1] == ' ' || s[end-1] == '\t' || s[end-1] == '\n' || s[end-1] == '\r') {
		end--
	}
	return s[start:end]
}

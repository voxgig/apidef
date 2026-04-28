/* Copyright (c) 2024-2025 Voxgig, MIT License */

package apidef

import (
	"reflect"
	"strings"
)

// CleanTransform removes empty nodes and internal properties from the model.
func CleanTransform(ctx *ApiDefContext) (*TransformResult, error) {
	ctx.ApiModel = cleanNode(ctx.ApiModel).(map[string]any)
	return &TransformResult{OK: true, Msg: "clean"}, nil
}

func cleanNode(v any) any {
	switch node := v.(type) {
	case map[string]any:
		result := map[string]any{}
		for _, k := range sortedKeys(node) {
			val := node[k]
			// Remove keys ending with $
			if strings.HasSuffix(k, "$") {
				continue
			}
			cleaned := cleanNode(val)
			if cleaned != nil && !isEmptyNode(cleaned) {
				result[k] = cleaned
			}
		}
		if len(result) == 0 {
			return nil
		}
		return result

	case []any:
		var result []any
		for _, val := range node {
			cleaned := cleanNode(val)
			if cleaned != nil {
				result = append(result, cleaned)
			}
		}
		if len(result) == 0 {
			return nil
		}
		return result
	}

	// Typed slices ([]string, []int, …) — collapse empty ones to nil so
	// the parent map treats them as absent. This mirrors TS clean's
	// `isempty` check which tests structural emptiness uniformly across
	// all list-shaped values.
	if v != nil {
		rv := reflect.ValueOf(v)
		switch rv.Kind() {
		case reflect.Slice, reflect.Array:
			if rv.Len() == 0 {
				return nil
			}
			return v
		}
	}
	return v
}

func isEmptyNode(v any) bool {
	switch node := v.(type) {
	case map[string]any:
		return len(node) == 0
	case []any:
		return len(node) == 0
	case nil:
		return true
	}
	if v != nil {
		rv := reflect.ValueOf(v)
		switch rv.Kind() {
		case reflect.Slice, reflect.Array, reflect.Map:
			return rv.Len() == 0
		}
	}
	return false
}

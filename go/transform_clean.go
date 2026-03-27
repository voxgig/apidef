/* Copyright (c) 2024-2025 Voxgig, MIT License */

package apidef

import "strings"

// CleanTransform removes empty nodes and internal properties from the model.
func CleanTransform(ctx *ApiDefContext) (*TransformResult, error) {
	ctx.ApiModel = cleanNode(ctx.ApiModel).(map[string]any)
	return &TransformResult{OK: true, Msg: "clean"}, nil
}

func cleanNode(v any) any {
	switch node := v.(type) {
	case map[string]any:
		result := map[string]any{}
		for k, val := range node {
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

	default:
		return v
	}
}

func isEmptyNode(v any) bool {
	switch node := v.(type) {
	case map[string]any:
		return len(node) == 0
	case []any:
		return len(node) == 0
	case nil:
		return true
	default:
		return false
	}
}

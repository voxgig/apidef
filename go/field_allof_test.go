package apidef

import (
	"reflect"
	"sort"
	"testing"
)

func allofJSON(schema any) map[string]any {
	return map[string]any{"content": map[string]any{
		"application/json": map[string]any{"schema": schema},
	}}
}

func allofProps(keys ...string) map[string]any {
	out := map[string]any{}
	for _, k := range keys {
		out[k] = map[string]any{"type": "string"}
	}
	return out
}

// allofFields runs FieldTransform over one operation on /jobs and returns the
// entity's field names, each marked with ! when required.
func allofFields(t *testing.T, opname, method string, response, request any) []string {
	t.Helper()
	opdef := map[string]any{"responses": map[string]any{"200": allofJSON(response)}}
	if request != nil {
		opdef["requestBody"] = allofJSON(request)
	}
	ent := map[string]any{
		"name":   "job",
		"fields": map[string]any{},
		"op": map[string]any{opname: map[string]any{
			"name":   opname,
			"points": []any{map[string]any{"o": "/jobs", "m": method, "k": "json"}},
		}},
	}
	apimodel := map[string]any{"main": map[string]any{"kit": map[string]any{
		"entity": map[string]any{"job": ent},
	}}}
	def := map[string]any{"paths": map[string]any{
		"/jobs": map[string]any{map[string]string{"GET": "get", "POST": "post"}[method]: opdef},
	}}
	if _, err := FieldTransform(&ApiDefContext{ApiModel: apimodel, Def: def}); err != nil {
		t.Fatalf("FieldTransform: %v", err)
	}
	var out []string
	for _, f := range ent["fields"].(map[string]any) {
		fm := f.(map[string]any)
		name := fm["n"].(string)
		if r, _ := fm["r"].(bool); r {
			name += "!"
		}
		out = append(out, name)
	}
	sort.Strings(out)
	return out
}

func TestFieldAllOfRequestContributesEveryMember(t *testing.T) {
	got := allofFields(t, "create", "POST",
		map[string]any{"type": "object", "properties": allofProps("id")},
		map[string]any{"allOf": []any{
			map[string]any{"type": "object", "required": []any{"url"}, "properties": allofProps("url")},
			map[string]any{"type": "object", "properties": allofProps("formats")},
		}})
	if want := []string{"formats", "id", "url!"}; !reflect.DeepEqual(got, want) {
		t.Errorf("fields = %v, want %v", got, want)
	}
}

func TestFieldAllOfResponseKeepsMembersBesideRequestBody(t *testing.T) {
	got := allofFields(t, "create", "POST",
		map[string]any{"allOf": []any{
			map[string]any{"type": "object", "properties": allofProps("id", "status")},
		}},
		map[string]any{"type": "object", "properties": allofProps("url")})
	if want := []string{"id", "status", "url"}; !reflect.DeepEqual(got, want) {
		t.Errorf("fields = %v, want %v", got, want)
	}
}

func TestFieldAllOfNestedMemberContributes(t *testing.T) {
	got := allofFields(t, "load", "GET",
		map[string]any{"allOf": []any{
			map[string]any{"allOf": []any{
				map[string]any{"type": "object", "properties": allofProps("id")},
			}},
			map[string]any{"type": "object", "properties": allofProps("status")},
		}}, nil)
	if want := []string{"id", "status"}; !reflect.DeepEqual(got, want) {
		t.Errorf("fields = %v, want %v", got, want)
	}
}

func TestFieldAllOfBesidePropertiesAndRequired(t *testing.T) {
	got := allofFields(t, "create", "POST",
		map[string]any{"type": "object", "properties": allofProps("id")},
		map[string]any{
			"type":       "object",
			"required":   []any{"url", "name"},
			"properties": allofProps("name"),
			"allOf": []any{
				map[string]any{"type": "object", "properties": allofProps("url", "formats")},
			},
		})
	if want := []string{"formats", "id", "name!", "url!"}; !reflect.DeepEqual(got, want) {
		t.Errorf("fields = %v, want %v", got, want)
	}
}

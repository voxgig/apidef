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

// allofRun runs FieldTransform over one operation on /jobs and returns the
// entity's fields.
func allofRun(t *testing.T, opname, method string, response, request any) map[string]any {
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
	return ent["fields"].(map[string]any)
}

// allofFields returns the entity's field names, each marked with ! when
// required.
func allofFields(t *testing.T, opname, method string, response, request any) []string {
	t.Helper()
	var out []string
	for _, f := range allofRun(t, opname, method, response, request) {
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

func TestFieldAllOfSiblingRequiresName(t *testing.T) {
	got := allofFields(t, "create", "POST",
		map[string]any{"type": "object", "properties": allofProps("id")},
		map[string]any{"allOf": []any{
			map[string]any{"type": "object", "properties": allofProps("url", "formats")},
			map[string]any{"required": []any{"url"}},
			map[string]any{"allOf": []any{map[string]any{"required": []any{"formats"}}}},
		}})
	if want := []string{"formats!", "id", "url!"}; !reflect.DeepEqual(got, want) {
		t.Errorf("fields = %v, want %v", got, want)
	}
}

func TestFieldAllOfDeclaredTwiceIsOneField(t *testing.T) {
	fields := allofRun(t, "load", "GET", map[string]any{
		"type": "object",
		"properties": map[string]any{
			"payload": map[string]any{"description": "What the job carries."},
		},
		"allOf": []any{map[string]any{
			"type":     "object",
			"required": []any{"payload"},
			"properties": map[string]any{
				"payload": map[string]any{"type": "object", "format": "job-payload"},
			},
		}},
	}, nil)
	payload, _ := fields["payload"].(map[string]any)
	got := map[string]any{
		"t": payload["t"], "r": payload["r"], "sh": payload["sh"], "fo": payload["fo"], "op": payload["op"],
	}
	want := map[string]any{
		"t": "`$OBJECT`", "r": true, "sh": "What the job carries.", "fo": "job-payload", "op": map[string]any{},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("payload = %v, want %v", got, want)
	}
}

func TestFieldAllOfKeepsUnion(t *testing.T) {
	branch := func(key string) any {
		return map[string]any{"type": "object", "properties": map[string]any{key: map[string]any{"type": "number"}}}
	}
	union := map[string]any{"oneOf": []any{branch("radius"), branch("side")}}
	id := map[string]any{"type": "string"}
	for name, response := range map[string]any{
		"once": map[string]any{"type": "object", "properties": map[string]any{"id": id, "shape": union}},
		"twice": map[string]any{
			"type": "object",
			"properties": map[string]any{
				"id":    id,
				"shape": map[string]any{"description": "One of two shapes."},
			},
			"allOf": []any{map[string]any{"type": "object", "properties": map[string]any{"shape": union}}},
		},
	} {
		shape, _ := allofRun(t, "load", "GET", response, nil)["shape"].(map[string]any)
		got, _ := shape["union"].(map[string]any)
		if got == nil || got["count"] != 1 || got["branches"] != 2 {
			t.Errorf("%s: shape union = %v, want one union of 2 branches", name, shape["union"])
		}
	}
}

func TestFieldAllOfBlankFactLeavesRoom(t *testing.T) {
	fields := allofRun(t, "load", "GET", map[string]any{"allOf": []any{
		map[string]any{"type": "object", "properties": map[string]any{
			"id":    map[string]any{"type": "string"},
			"notes": map[string]any{"type": "string", "description": " ", "format": ""},
		}},
		map[string]any{"type": "object", "properties": map[string]any{
			"notes": map[string]any{"description": "Free text about the job.", "format": "markdown"},
		}},
	}}, nil)
	notes, _ := fields["notes"].(map[string]any)
	if notes["sh"] != "Free text about the job." || notes["fo"] != "markdown" {
		t.Errorf("notes sh = %v, fo = %v, want the second declaration's", notes["sh"], notes["fo"])
	}
}

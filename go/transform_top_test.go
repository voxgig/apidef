/* Copyright (c) 2026 Voxgig Ltd, MIT License */

package apidef

import (
	"encoding/json"
	"reflect"
	"testing"
)

// Mirrors the `transform-top security` cases in ts/test/transform/top.test.ts.

func topInfo(t *testing.T, defsrc string) (map[string]any, map[string]any) {
	t.Helper()
	var def map[string]any
	if err := json.Unmarshal([]byte(defsrc), &def); err != nil {
		t.Fatal(err)
	}
	ctx := &ApiDefContext{
		Def: def,
		ApiModel: map[string]any{"main": map[string]any{
			KIT: map[string]any{"info": map[string]any{}},
		}},
	}
	if _, err := TopTransform(ctx); err != nil {
		t.Fatal(err)
	}
	info, _ := getKit(ctx)["info"].(map[string]any)
	return info, def
}

func setNames(security map[string]any, key string) [][]string {
	out := [][]string{}
	sets, _ := security["alternatives"].([]any)
	for _, set := range sets {
		names := []string{}
		for _, scheme := range set.([]any) {
			names = append(names, scheme.(map[string]any)[key].(string))
		}
		out = append(out, names)
	}
	return out
}

const cfSchemes = `"components":{"securitySchemes":{
	"api_email":{"type":"apiKey","in":"header","name":"X-Auth-Email"},
	"api_key":{"type":"apiKey","in":"header","name":"X-Auth-Key"},
	"api_token":{"type":"http","scheme":"bearer"}}}`

func TestTopSecuritySchemeSetGivesWay(t *testing.T) {
	info, _ := topInfo(t, `{"info":{},
		"security":[{"api_email":[],"api_key":[]},{"api_token":[]}],
		"paths":{"/zones":{"get":{}}},`+cfSchemes+`}`)
	security, _ := info["security"].(map[string]any)
	got := []any{security["scheme"], security["in"], security["name"], security["prefix"]}
	if want := []any{"api_token", "header", "Authorization", "Bearer"}; !reflect.DeepEqual(got, want) {
		t.Errorf("security = %v, want %v", got, want)
	}
	if got, want := setNames(security, "name"), [][]string{{"X-Auth-Email", "X-Auth-Key"}}; !reflect.DeepEqual(got, want) {
		t.Errorf("alternatives = %v, want %v", got, want)
	}
}

func TestTopSecurityOperationsOutrankDefinition(t *testing.T) {
	ops := `{"security":[{"api_token":[]},{"api_email":[],"api_key":[]}]}`
	info, _ := topInfo(t, `{"info":{},
		"security":[{"api_email":[]}],
		"paths":{"/zones":{"get":`+ops+`,"post":`+ops+`}},`+cfSchemes+`}`)
	security, _ := info["security"].(map[string]any)
	if security["scheme"] != "api_token" {
		t.Errorf("scheme = %v, want api_token", security["scheme"])
	}
	if got, want := setNames(security, "scheme"), [][]string{{"api_email", "api_key"}}; !reflect.DeepEqual(got, want) {
		t.Errorf("alternatives = %v, want %v", got, want)
	}
}

func TestTopSecurityUnappliedSchemeIsCredential(t *testing.T) {
	info, _ := topInfo(t, `{"info":{},"paths":{"/api/gettext":{"get":{}}},
		"components":{"securitySchemes":{
			"ApiKeyAuth":{"type":"apiKey","in":"query","name":"apikey"},
			"SubscriberAuth":{"type":"http","scheme":"basic"}}}}`)
	if _, ok := info["auth"]; ok {
		t.Errorf("auth = %v, want unset", info["auth"])
	}
	want := map[string]any{
		"scheme": "ApiKeyAuth", "type": "apiKey", "in": "query", "name": "apikey", "prefix": "",
	}
	if !reflect.DeepEqual(info["security"], want) {
		t.Errorf("security = %v, want %v", info["security"], want)
	}
}

func TestTopSecurityNoAuthIsPublic(t *testing.T) {
	info, _ := topInfo(t, `{"info":{},"paths":{"/x":{"get":{}}}}`)
	if info["auth"] != false {
		t.Errorf("auth = %v, want false", info["auth"])
	}
	if _, ok := info["security"]; ok {
		t.Errorf("security = %v, want unset", info["security"])
	}
}

func TestTopSecurityExchangeBesideScheme(t *testing.T) {
	info, def := topInfo(t, `{"info":{"title":"T"},
		"security":[{"bearerAuth":[]}],
		"paths":{"/auth/token":{"post":{"security":[],"responses":{"200":{"content":{
			"application/json":{"schema":{"type":"object",
				"properties":{"access_token":{"type":"string"}}}}}}}}}},
		"components":{"securitySchemes":{"bearerAuth":{"type":"http","scheme":"bearer"}}}}`)
	want := map[string]any{
		"scheme": "bearerAuth", "type": "http", "in": "header", "name": "Authorization", "prefix": "Bearer",
		"exchange": map[string]any{"path": "auth/token", "method": "POST", "response": "access_token"},
	}
	if !reflect.DeepEqual(info["security"], want) {
		t.Errorf("security = %v, want %v", info["security"], want)
	}
	if got := sortedKeys(def["info"].(map[string]any)); !reflect.DeepEqual(got, []string{"title"}) {
		t.Errorf("the definition's info keys = %v, want [title]", got)
	}
}

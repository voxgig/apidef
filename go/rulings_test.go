/* Copyright (c) 2026 Voxgig Ltd, MIT License */

package apidef

import (
	"strings"
	"testing"
)

// Mirrors ts/test/rulings.test.ts: each fixture shows one ruling on the
// manual corpus, and the port must classify it as the TypeScript guide does.

// The entity and operation of each route, keyed `METHOD path`.
func rulingOwners(guide map[string]any) map[string]string {
	out := map[string]string{}
	entities, _ := guide["entity"].(map[string]any)
	for _, ename := range sortedKeys(entities) {
		ent, _ := entities[ename].(map[string]any)
		paths, _ := ent["path"].(map[string]any)
		for _, p := range sortedKeys(paths) {
			gp, _ := paths[p].(map[string]any)
			ops, _ := gp["op"].(map[string]any)
			actions, _ := gp["action"].(map[string]any)
			names := sortedKeys(actions)
			for _, opname := range sortedKeys(ops) {
				op, _ := ops[opname].(map[string]any)
				owner := ename + " " + opname
				if 0 < len(names) {
					owner += " " + strings.Join(names, ",")
				}
				out[safeStr(op["method"])+" "+p] = owner
			}
		}
	}
	return out
}

func TestRulings(t *testing.T) {
	rulings := []struct {
		def    string
		expect map[string]string
	}{
		{
			def: "tag-noun-def.json",
			expect: map[string]string{
				"GET /folders/":                               "folder list",
				"POST /folders/":                              "folder create",
				"GET /folders/{folder_id}":                    "folder load",
				"DELETE /folders/{folder_id}":                 "folder remove",
				"GET /reference-data/locations/pois/{poisId}": "poi load",
				"GET /{id}":                                   "thing load",
			},
		},
		{
			def: "wrapper-cmp-def.json",
			expect: map[string]string{
				"GET /templates":           "template list",
				"POST /templates":          "template create",
				"GET /templates/{id}":      "template load",
				"DELETE /templates/{id}":   "template remove",
				"GET /templates/{id}/file": "template load file",
			},
		},
		{
			def: "key-param-def.json",
			expect: map[string]string{
				"GET /b":                     "bucket list",
				"POST /b":                    "bucket create",
				"GET /b/{bucket}":            "bucket load",
				"PATCH /b/{bucket}":          "bucket patch",
				"DELETE /b/{bucket}":         "bucket remove",
				"GET /b/{bucket}/o":          "object list",
				"GET /b/{bucket}/o/{object}": "object load",
			},
		},
		{
			def: "placeholder-ext-def.json",
			expect: map[string]string{
				"GET /lists.{format}":       "list list",
				"GET /lists/names.{format}": "name list",
				"GET /reviews.{format}":     "review list",
			},
		},
		{
			def: "sub-read-def.json",
			expect: map[string]string{
				"GET /districts":              "district list",
				"GET /districts/{id}":         "district load",
				"GET /districts/{id}/status":  "district load status",
				"GET /districts/{id}/profile": "profile load",
			},
		},
		{
			def: "projection-def.json",
			expect: map[string]string{
				"GET /teachers":                   "teacher list",
				"GET /teachers/{id}":              "teacher load",
				"GET /teachers/{id}/grade_levels": "teacher load grade_level",
				"GET /teachers/{id}/students":     "student list",
			},
		},
		{
			def: "command-def.json",
			expect: map[string]string{
				"POST /#Action=AssumeRole":          "assume_role create",
				"GET /keys":                         "key list",
				"POST /keys/{keyName}/requestToken": "token create",
				"GET /account":                      "account load",
				"POST /account":                     "account create",
			},
		},
		{
			def: "post-read-def.json",
			expect: map[string]string{
				"POST /listRecurringDetails": "recurring_detail list",
				"GET /things":                "thing list",
				"POST /things/search":        "thing list search",
				"POST /things/count":         "thing create count",
			},
		},
		{
			def: "module-affix-def.json",
			expect: map[string]string{
				"GET /v1/ProductsApi":              "product list",
				"POST /v1/ProductsApi":             "product create",
				"GET /v1/ProductsApi/{serial}":     "product load",
				"DELETE /v1/ProductsApi/{serial}":  "product remove",
				"POST /v1/ProductsApi/Find":        "product list find",
				"GET /v1/KeysApi/Current/{serial}": "key load",
			},
		},
		{
			def: "prefix-tag-def.json",
			expect: map[string]string{
				"GET /push/deviceRegistrations":                "device_registration list",
				"POST /push/deviceRegistrations":               "device_registration create",
				"GET /push/deviceRegistrations/{device_id}":    "device_registration load",
				"DELETE /push/deviceRegistrations/{device_id}": "device_registration remove",
				"GET /gifs":                     "gif list",
				"GET /gifs/{gif_id}":            "gif load",
				"GET /gifs/random":              "gif load random",
				"GET /user/{user_id}/followers": "user load follower",
			},
		},
		{
			def: "body-media-def.json",
			expect: map[string]string{
				"POST /#Action=AssumeRole":                        "assume_role create",
				"GET /#Action=AssumeRole":                         "assume_role load",
				"GET /keys":                                       "key list",
				"POST /keys/{keyName}/requestToken":               "token create",
				"POST /authn/{service_id}/{account}/authenticate": "authenticate create",
			},
		},
		{
			def: "path-syntax-def.json",
			expect: map[string]string{
				"GET /api/articles{mediaTypeExtension}": "article list",
				"GET /{pageName}{mediaTypeExtension}":   "page load",
				"GET /search/nearbySearch/.{ext}":       "nearby_search load",
				"GET /templates":                        "template list",
				"GET /templates/{id}":                   "template load",
				"POST /templates?desc=html":             "template create",
			},
		},
		{
			def: "record-name-def.json",
			expect: map[string]string{
				"GET /b/{bucket}":                        "bucket load",
				"GET /b/{bucket}/acl":                    "bucket_access_control list",
				"POST /b/{bucket}/acl":                   "bucket_access_control create",
				"GET /b/{bucket}/acl/{entity}":           "bucket_access_control load",
				"PUT /b/{bucket}/acl/{entity}":           "bucket_access_control update",
				"DELETE /b/{bucket}/acl/{entity}":        "bucket_access_control remove",
				"GET /hotels/{hotelId}/rateplans":        "rateplan list",
				"GET /hotels/{hotelId}/rateplans/{code}": "rateplan load",
			},
		},
		{
			def: "deep-view-def.json",
			expect: map[string]string{
				"GET /companies":             "company list",
				"GET /companies/{companyId}": "company load",
				"GET /meta/companies/{companyId}/sync/commerce/status": "company load sync_commerce_status",
				"GET /authn-gcp/{account}/status":                      "authn_gcp load status",
				"GET /servers/{server_id}/statistics":                  "server_statistic list",
			},
		},
		{
			def: "embedded-def.json",
			expect: map[string]string{
				"GET /students/{id}":                "student load",
				"GET /students/{id}/contacts":       "student_contact list",
				"GET /word.json/{word}":             "word load",
				"GET /word.json/{word}/definitions": "word list definition",
			},
		},
	}

	for _, ruling := range rulings {
		t.Run(ruling.def, func(t *testing.T) {
			folder := stageGuideEntry(t, t.TempDir(), "")
			res, err := NewApiDef(ApiDefOptions{Folder: folder, Strategy: "heuristic01"}).Generate(map[string]any{
				"model": map[string]any{"name": "rulings", "def": ruling.def},
				"build": map[string]any{"spec": map[string]any{"base": "../ts/test/rulings"}},
				"ctrl": map[string]any{"step": map[string]any{
					"parse": true, "guide": true, "transformers": false,
					"builders": false, "generate": false,
				}},
			})
			if err != nil || res == nil || !res.OK {
				t.Fatalf("generate failed: err=%v res=%+v", err, res)
			}
			got := rulingOwners(res.Guide)
			for route, want := range ruling.expect {
				if got[route] != want {
					t.Errorf("%s = %q, want %q", route, got[route], want)
				}
			}
		})
	}
}

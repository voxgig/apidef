/* Copyright (c) 2026 Voxgig Ltd, MIT License */

package apidef

import (
	"strings"
	"testing"
)

// Mirrors ts/test/rulings.test.ts: each fixture shows one of the maintainer's
// classification rulings, and the port must classify it as the TypeScript
// guide does.

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
				"GET /drawers/":                             "drawer list",
				"POST /drawers/":                            "drawer create",
				"GET /drawers/{drawer_id}":                  "drawer load",
				"DELETE /drawers/{drawer_id}":               "drawer remove",
				"GET /catalog-data/regions/spots/{spotsId}": "spot load",
				"GET /{id}":                                 "thing load",
			},
		},
		{
			def: "wrapper-cmp-def.json",
			expect: map[string]string{
				"GET /widgets":           "widget list",
				"POST /widgets":          "widget create",
				"GET /widgets/{id}":      "widget load",
				"DELETE /widgets/{id}":   "widget remove",
				"GET /widgets/{id}/file": "widget load file",
			},
		},
		{
			def: "key-param-def.json",
			expect: map[string]string{
				"GET /s":                  "shelf list",
				"POST /s":                 "shelf create",
				"GET /s/{shelf}":          "shelf load",
				"PATCH /s/{shelf}":        "shelf patch",
				"DELETE /s/{shelf}":       "shelf remove",
				"GET /s/{shelf}/k":        "book list",
				"GET /s/{shelf}/k/{book}": "book load",
			},
		},
		{
			def: "placeholder-ext-def.json",
			expect: map[string]string{
				"GET /pets.{format}":       "pet list",
				"GET /pets/names.{format}": "name list",
				"GET /toys.{format}":       "toy list",
			},
		},
		{
			def: "sub-read-def.json",
			expect: map[string]string{
				"GET /stores":              "store list",
				"GET /stores/{id}":         "store load",
				"GET /stores/{id}/status":  "store load status",
				"GET /stores/{id}/profile": "profile load",
			},
		},
		{
			def: "projection-def.json",
			expect: map[string]string{
				"GET /owners":                 "owner list",
				"GET /owners/{id}":            "owner load",
				"GET /owners/{id}/nick_names": "owner load nick_name",
				"GET /owners/{id}/pets":       "pet list",
			},
		},
		{
			def: "command-def.json",
			expect: map[string]string{
				"POST /#Action=StartSession":         "start_session create",
				"GET /keys":                          "key list",
				"POST /keys/{keyName}/requestTicket": "ticket create",
				"GET /account":                       "account load",
				"POST /account":                      "account create",
			},
		},
		{
			def: "post-read-def.json",
			expect: map[string]string{
				"POST /listSavedCards": "saved_card list",
				"GET /things":          "thing list",
				"POST /things/search":  "thing list search",
				"POST /things/count":   "thing create count",
			},
		},
		{
			def: "module-affix-def.json",
			expect: map[string]string{
				"GET /v1/GadgetsApi":                 "gadget list",
				"POST /v1/GadgetsApi":                "gadget create",
				"GET /v1/GadgetsApi/{serial}":        "gadget load",
				"DELETE /v1/GadgetsApi/{serial}":     "gadget remove",
				"POST /v1/GadgetsApi/Find":           "gadget list find",
				"GET /v1/BadgesApi/Active/{serial}": "badge load",
			},
		},
		{
			def: "prefix-tag-def.json",
			expect: map[string]string{
				"GET /alerts/deviceSubscriptions":                "device_subscription list",
				"POST /alerts/deviceSubscriptions":               "device_subscription create",
				"GET /alerts/deviceSubscriptions/{device_id}":    "device_subscription load",
				"DELETE /alerts/deviceSubscriptions/{device_id}": "device_subscription remove",
				"GET /tiles":                "tile list",
				"GET /tiles/{tile_id}":   "tile load",
				"GET /tiles/random":         "tile load random",
				"GET /member/{member_id}/fans": "member load fan",
			},
		},
		{
			def: "body-media-def.json",
			expect: map[string]string{
				"POST /#Action=StartSession":                       "start_session create",
				"GET /#Action=StartSession":                        "start_session load",
				"GET /keys":                                        "key list",
				"POST /keys/{keyName}/requestTicket":               "ticket create",
				"POST /signin/{service_id}/{account}/authenticate": "authenticate create",
			},
		},
		{
			def: "path-syntax-def.json",
			expect: map[string]string{
				"GET /api/notes{fileExtension}":   "note list",
				"GET /{sheetName}{fileExtension}": "sheet load",
				"GET /search/localSearch/.{ext}":  "local_search list",
				"GET /widgets":                    "widget list",
				"GET /widgets/{id}":               "widget load",
				"POST /widgets?desc=html":         "widget create",
			},
		},
		{
			def: "record-name-def.json",
			expect: map[string]string{
				"GET /s/{shelf}":                       "shelf load",
				"GET /s/{shelf}/acl":                   "shelf_access_control list",
				"POST /s/{shelf}/acl":                  "shelf_access_control create",
				"GET /s/{shelf}/acl/{entity}":          "shelf_access_control load",
				"PUT /s/{shelf}/acl/{entity}":          "shelf_access_control update",
				"DELETE /s/{shelf}/acl/{entity}":       "shelf_access_control remove",
				"GET /farms/{farmId}/croptypes":        "croptype list",
				"GET /farms/{farmId}/croptypes/{code}": "croptype load",
			},
		},
		{
			def: "deep-view-def.json",
			expect: map[string]string{
				"GET /teams":          "team list",
				"GET /teams/{teamId}": "team load",
				"GET /meta/teams/{teamId}/sync/billing/status": "team load sync_billing_status",
				"GET /node-eu/{account}/status":                "node_eu load status",
				"GET /hosts/{host_id}/statistics":              "host_statistic list",
			},
		},
		{
			def: "embedded-def.json",
			expect: map[string]string{
				"GET /owners/{id}":               "owner load",
				"GET /owners/{id}/pets":          "owner_pet list",
				"GET /term.json/{term}":          "term load",
				"GET /term.json/{term}/meanings": "term list meaning",
			},
		},
		{
			def: "shared-record-def.json",
			expect: map[string]string{
				"GET /s/{shelf}":                            "shelf load",
				"GET /s/{shelf}/k/{book}":                   "book load",
				"GET /s/{shelf}/defaultBookAcl":             "book_access_control list default_book_acl",
				"POST /s/{shelf}/defaultBookAcl":            "book_access_control create default_book_acl",
				"GET /s/{shelf}/defaultBookAcl/{entity}":    "book_access_control load default_book_acl",
				"DELETE /s/{shelf}/defaultBookAcl/{entity}": "book_access_control remove default_book_acl",
				"GET /s/{shelf}/k/{book}/acl":               "book_access_control list acl",
				"POST /s/{shelf}/k/{book}/acl":              "book_access_control create acl",
				"GET /s/{shelf}/k/{book}/acl/{entity}":      "book_access_control load acl",
				"PUT /s/{shelf}/k/{book}/acl/{entity}":      "book_access_control update acl",
			},
		},
		{
			def: "verb-result-def.json",
			expect: map[string]string{
				"GET /farms/{farmId}/croptypes":        "croptype list",
				"GET /farms/{farmId}/croptypes/{code}": "croptype load",
				"GET /farms/{farmId}/croptypes/$count": "croptype load count",
				"GET /farms/{farmId}/barns":            "barn list",
				"GET /farms/{farmId}/barns/$count":     "barn load count",
				"GET /tasks/{id}":                      "task load",
				"POST /tasks/{id}/cancel":              "task create cancel",
			},
		},
		{
			def: "verb-phrase-def.json",
			expect: map[string]string{
				"GET /s/{shelf}":                               "shelf load",
				"POST /s/{shelf}/lockLendingPolicy":            "shelf create lock_lending_policy",
				"GET /s/{shelf}/rbac":                          "grant load",
				"GET /s/{shelf}/rbac/testAccess":               "shelf load rbac_test_access",
				"GET /s/{shelf}/k/{book}":                      "book load",
				"GET /s/{shelf}/k/{book}/rbac":                 "grant load",
				"GET /s/{shelf}/k/{book}/rbac/testAccess":      "book load rbac_test_access",
				"POST /node-k8s/{service_id}/inject_root_cert": "node_k8s create inject_root_cert",
				"GET /things/{id}":                             "thing load",
				"POST /things/{id}/actions/archive":            "thing create archive",
				"GET /things/{id}/labels":                      "label list",
				"POST /things/{id}/labels":                     "label create",
				"POST /things/{id}/labels/archive":             "label create archive",
			},
		},
		{
			def: "short-literal-def.json",
			expect: map[string]string{
				"GET /fr/{sheetName}{fileExtension}":         "sheet load",
				"GET /search/{versionNumber}/q/{term}.{ext}": "term load",
				"GET /x/db":         "database load",
				"GET /misc/qq":      "qqn load",
				"GET /misc/qq/{id}": "qqn load",
			},
		},
		{
			def: "response-media-def.json",
			expect: map[string]string{
				"GET /terms/{term}/meanings":      "meaning list",
				"GET /terms/{term}/usage":         "term load usage",
				"GET /rooms/{room_id}/attendance": "attendance list",
				"GET /ids/contentIds/{contentId}": "artifact load",
			},
		},
		{
			def: "namespace-prefix-def.json",
			expect: map[string]string{
				"POST /encode":    "encode create",
				"POST /check":     "check create",
				"POST /hold":      "payment create",
				"GET /safes/{id}": "safe load",
			},
		},
		{
			def: "word-break-def.json",
			expect: map[string]string{
				"GET /farms/{farmId}/croptypes":        "crop_type list",
				"GET /farms/{farmId}/croptypes/{code}": "crop_type load",
				"GET /boxsizes":                        "box_size list",
				"GET /zipcodes":                        "zipcode load",
			},
		},
		{
			def: "operation-id-def.json",
			expect: map[string]string{
				"POST /signin/{account}/{login}/authenticate":          "session_key create",
				"POST /signin-jwt/{service_id}/{account}/authenticate": "session_key create",
				"POST /ra/{account}/{service_id}/sign":                 "sign create",
			},
		},
		{
			def: "no-noun-def.json",
			expect: map[string]string{
				"GET /{vendor}.json": "plugin load",
				"GET /list.json":     "plugin load",
				"GET /history":       "placed_order list",
				"GET /aq":            "aq_index_result load",
				"POST /deactivate":   "deactivate create",
			},
		},
		{
			def: "sub-path-def.json",
			expect: map[string]string{
				"GET /teams/{teamId}/sync/config":  "preference load",
				"POST /teams/{teamId}/sync/config": "preference create",
				"GET /clubs/{name}/settings":       "club_setting load",
				"PUT /clubs/{name}/settings":       "club_setting update",
				"PUT /parcels/{id}/address":        "parcel update address",
			},
		},
		{
			def: "record-key-def.json",
			expect: map[string]string{
				"GET /homes":                   "offer list",
				"GET /homes/{homeRef}":         "offer load",
				"GET /regions/spots":           "place list",
				"GET /regions/spots/{spotsId}": "place load",
				"GET /regions/spots/by-circle": "place list by_circle",
			},
		},
		{
			def: "async-result-def.json",
			expect: map[string]string{
				"POST /report/render":                  "render_operation_result create report",
				"GET /report/renderResults/{resultId}": "render_operation_result load",
				"POST /devices/{deviceId}/render":      "render_operation_result create device",
			},
		},
		{
			def: "relationship-def.json",
			expect: map[string]string{
				"GET /expenses/{expenseId}":                          "expense load",
				"POST /expenses/{expenseId}/relationships/tags":      "expense create tags",
				"DELETE /expenses/{expenseId}/relationships/tags":    "expense remove tags",
				"PATCH /expenses/{expenseId}/relationships/category": "expense patch category",
			},
		},
		{
			def: "key-noun-def.json",
			expect: map[string]string{
				"GET /tsp/answer/{jobId}":  "job load tsp_answer",
				"GET /grid/answer/{jobId}": "job load grid_answer",
				"GET /wiki/{sheetName}":    "wiki load",
				"PATCH /portal/{storeKey}": "portal patch",
			},
		},
		{
			def: "ruling-gaps-def.json",
			expect: map[string]string{
				"GET /catalog/{vendor}/{plugin}.json":   "plugin load",
				"POST /LedgerLinks/ArchiveEntries":    "ledger_link create archive_entries",
				"GET /alerts/topics":                  "topic list",
				"GET /search/notes":                   "search list note",
				"GET /journal/{journal_id}/digest":    "digest load",
				"GET /journal/{journal_id}/following": "journal list following",
			},
		},
		{
			def: "command-action-def.json",
			expect: map[string]string{
				"GET /api/doc":                                    "doc load",
				"POST /api/doc/mdconvert":                         "doc create mdconvert",
				"POST /api/doc/docmerge":                          "doc create docmerge",
				"GET /projects/{id}/packages":                     "package list",
				"PUT /projects/{id}/packages/nuget":               "package update nuget",
				"PUT /projects/{id}/packages/nuget/symbolpackage": "package update symbolpackage",
				"GET /widgets/{id}":                               "widget load",
				"POST /widgets/{id}/labels":                       "widget create labels",
			},
		},
		{
			def: "keyed-verb-def.json",
			expect: map[string]string{
				"GET /v3/notes/{bookId}":             "note list",
				"GET /v3/notes/{bookId}/{id}":        "note load",
				"POST /v3/notes/{bookId}/{id}/_pin":  "note create pin",
				"POST /v3/notes/{bookId}/{id}/_mute": "note create mute",
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

/* Copyright (c) 2026 Voxgig Ltd, MIT License */

// The maintainer's classification rulings: each fixture shows one, and both
// strategies must classify it the same way.

import * as Fs from 'node:fs'
import * as Os from 'node:os'
import * as Path from 'node:path'

import { test, describe, after } from 'node:test'
import assert from 'node:assert'

import { Pino } from '@voxgig/util'

import { ApiDef } from '../dist/apidef'


const DEFDIR = Path.join(__dirname, '..', 'test', 'def')

const SILENT = Pino({ level: 'silent' })

const staged: string[] = []


async function guide(def: string, strategy: string): Promise<any> {
  const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'apidef-rulings-'))
  staged.push(dir)
  const folder = Path.join(dir, 'model')
  Fs.mkdirSync(Path.join(folder, 'guide'), { recursive: true })
  Fs.mkdirSync(Path.join(dir, 'def'))
  Fs.copyFileSync(Path.join(DEFDIR, def), Path.join(dir, 'def', def))
  Fs.writeFileSync(Path.join(folder, 'guide', 'guide.aontu'),
    '@"@voxgig/apidef/model/guide.aontu"\n@"./base-guide.aontu"\n')
  const build = await ApiDef.makeBuild({ folder, strategy })
  const bres = await build({ name: 'rulings', def }, {
    log: SILENT,
    spec: {
      base: folder,
      buildargs: {
        apidef: {
          ctrl: {
            step: {
              parse: true, guide: true, transformers: false, builders: false, generate: false,
            }
          }
        }
      }
    }
  }, {})
  assert.strictEqual(bres.ok, true, def + ': ' + String(bres.err?.message))
  return bres.guide
}


// The entity and operation of each route, keyed `METHOD path`.
function owners(g: any): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [ename, ent] of Object.entries(g.entity) as [string, any][]) {
    for (const [p, gp] of Object.entries(ent.path ?? {}) as [string, any][]) {
      for (const [opname, op] of Object.entries(gp.op ?? {}) as [string, any][]) {
        const actions = Object.keys(gp.action ?? {}).sort()
        out[op.method + ' ' + p] = ename + ' ' + opname + (0 < actions.length ? ' ' + actions.join(',') : '')
      }
    }
  }
  return out
}


const RULINGS: { def: string, expect: Record<string, string> }[] = [
  {
    def: 'tag-noun-def.json',
    expect: {
      'GET /drawers/': 'drawer list',
      'POST /drawers/': 'drawer create',
      'GET /drawers/{drawer_id}': 'drawer load',
      'DELETE /drawers/{drawer_id}': 'drawer remove',
      'GET /catalog-data/regions/spots/{spotsId}': 'spot load',
      'GET /{id}': 'thing load',
    },
  },
  {
    def: 'wrapper-cmp-def.json',
    expect: {
      'GET /widgets': 'widget list',
      'POST /widgets': 'widget create',
      'GET /widgets/{id}': 'widget load',
      'DELETE /widgets/{id}': 'widget remove',
      'GET /widgets/{id}/file': 'widget load file',
    },
  },
  {
    def: 'key-param-def.json',
    expect: {
      'GET /s': 'shelf list',
      'POST /s': 'shelf create',
      'GET /s/{shelf}': 'shelf load',
      'PATCH /s/{shelf}': 'shelf patch',
      'DELETE /s/{shelf}': 'shelf remove',
      'GET /s/{shelf}/k': 'book list',
      'GET /s/{shelf}/k/{book}': 'book load',
    },
  },
  {
    def: 'placeholder-ext-def.json',
    expect: {
      'GET /pets.{format}': 'pet list',
      'GET /pets/names.{format}': 'name list',
      'GET /toys.{format}': 'toy list',
    },
  },
  {
    def: 'sub-read-def.json',
    expect: {
      'GET /stores': 'store list',
      'GET /stores/{id}': 'store load',
      'GET /stores/{id}/status': 'store load status',
      'GET /stores/{id}/profile': 'profile load',
    },
  },
  {
    def: 'projection-def.json',
    expect: {
      'GET /owners': 'owner list',
      'GET /owners/{id}': 'owner load',
      'GET /owners/{id}/nick_names': 'owner load nick_name',
      'GET /owners/{id}/pets': 'pet list',
    },
  },
  {
    def: 'command-def.json',
    expect: {
      'POST /#Action=StartSession': 'start_session create',
      'GET /keys': 'key list',
      'POST /keys/{keyName}/requestTicket': 'ticket create',
      'GET /account': 'account load',
      'POST /account': 'account create',
    },
  },
  {
    def: 'post-read-def.json',
    expect: {
      'POST /listSavedCards': 'saved_card list',
      'GET /things': 'thing list',
      'POST /things/search': 'thing list search',
      'POST /things/count': 'thing create count',
    },
  },
  {
    def: 'module-affix-def.json',
    expect: {
      'GET /v1/GadgetsApi': 'gadget list',
      'POST /v1/GadgetsApi': 'gadget create',
      'GET /v1/GadgetsApi/{serial}': 'gadget load',
      'DELETE /v1/GadgetsApi/{serial}': 'gadget remove',
      'POST /v1/GadgetsApi/Find': 'gadget list find',
      'GET /v1/BadgesApi/Active/{serial}': 'badge load',
    },
  },
  {
    def: 'prefix-tag-def.json',
    expect: {
      'GET /alerts/deviceSubscriptions': 'device_subscription list',
      'POST /alerts/deviceSubscriptions': 'device_subscription create',
      'GET /alerts/deviceSubscriptions/{device_id}': 'device_subscription load',
      'DELETE /alerts/deviceSubscriptions/{device_id}': 'device_subscription remove',
      'GET /tiles': 'tile list',
      'GET /tiles/{tile_id}': 'tile load',
      'GET /tiles/random': 'tile load random',
      'GET /member/{member_id}/fans': 'member load fan',
    },
  },
  {
    def: 'body-media-def.json',
    expect: {
      'POST /#Action=StartSession': 'start_session create',
      'GET /#Action=StartSession': 'start_session load',
      'GET /keys': 'key list',
      'POST /keys/{keyName}/requestTicket': 'ticket create',
      'POST /signin/{service_id}/{account}/authenticate': 'authenticate create',
    },
  },
  {
    def: 'path-syntax-def.json',
    expect: {
      'GET /api/notes{fileExtension}': 'note list',
      'GET /{sheetName}{fileExtension}': 'sheet load',
      'GET /search/localSearch/.{ext}': 'local_search list',
      'GET /widgets': 'widget list',
      'GET /widgets/{id}': 'widget load',
      'POST /widgets?desc=html': 'widget create',
    },
  },
  {
    def: 'record-name-def.json',
    expect: {
      'GET /s/{shelf}': 'shelf load',
      'GET /s/{shelf}/acl': 'shelf_access_control list',
      'POST /s/{shelf}/acl': 'shelf_access_control create',
      'GET /s/{shelf}/acl/{entity}': 'shelf_access_control load',
      'PUT /s/{shelf}/acl/{entity}': 'shelf_access_control update',
      'DELETE /s/{shelf}/acl/{entity}': 'shelf_access_control remove',
      'GET /farms/{farmId}/croptypes': 'croptype list',
      'GET /farms/{farmId}/croptypes/{code}': 'croptype load',
    },
  },
  {
    def: 'deep-view-def.json',
    expect: {
      'GET /teams': 'team list',
      'GET /teams/{teamId}': 'team load',
      'GET /meta/teams/{teamId}/sync/billing/status': 'team load sync_billing_status',
      'GET /node-eu/{account}/status': 'node_eu load status',
      'GET /hosts/{host_id}/statistics': 'host_statistic list',
    },
  },
  {
    def: 'embedded-def.json',
    expect: {
      'GET /owners/{id}': 'owner load',
      'GET /owners/{id}/pets': 'owner_pet list',
      'GET /term.json/{term}': 'term load',
      'GET /term.json/{term}/meanings': 'term list meaning',
    },
  },
  {
    def: 'shared-record-def.json',
    expect: {
      'GET /s/{shelf}': 'shelf load',
      'GET /s/{shelf}/k/{book}': 'book load',
      'GET /s/{shelf}/defaultBookAcl': 'book_access_control list default_book_acl',
      'POST /s/{shelf}/defaultBookAcl': 'book_access_control create default_book_acl',
      'GET /s/{shelf}/defaultBookAcl/{entity}': 'book_access_control load default_book_acl',
      'DELETE /s/{shelf}/defaultBookAcl/{entity}': 'book_access_control remove default_book_acl',
      'GET /s/{shelf}/k/{book}/acl': 'book_access_control list acl',
      'POST /s/{shelf}/k/{book}/acl': 'book_access_control create acl',
      'GET /s/{shelf}/k/{book}/acl/{entity}': 'book_access_control load acl',
      'PUT /s/{shelf}/k/{book}/acl/{entity}': 'book_access_control update acl',
    },
  },
  {
    def: 'verb-result-def.json',
    expect: {
      'GET /farms/{farmId}/croptypes': 'croptype list',
      'GET /farms/{farmId}/croptypes/{code}': 'croptype load',
      'GET /farms/{farmId}/croptypes/$count': 'croptype load count',
      'GET /farms/{farmId}/barns': 'barn list',
      'GET /farms/{farmId}/barns/$count': 'barn load count',
      'GET /tasks/{id}': 'task load',
      'POST /tasks/{id}/cancel': 'task create cancel',
    },
  },
  {
    def: 'verb-phrase-def.json',
    expect: {
      'GET /s/{shelf}': 'shelf load',
      'POST /s/{shelf}/lockLendingPolicy': 'shelf create lock_lending_policy',
      'GET /s/{shelf}/rbac': 'grant load',
      'GET /s/{shelf}/rbac/testAccess': 'shelf load rbac_test_access',
      'GET /s/{shelf}/k/{book}': 'book load',
      'GET /s/{shelf}/k/{book}/rbac': 'grant load',
      'GET /s/{shelf}/k/{book}/rbac/testAccess': 'book load rbac_test_access',
      'POST /node-k8s/{service_id}/inject_root_cert': 'node_k8s create inject_root_cert',
      'GET /things/{id}': 'thing load',
      'POST /things/{id}/actions/archive': 'thing create archive',
      'GET /things/{id}/labels': 'label list',
      'POST /things/{id}/labels': 'label create',
      'POST /things/{id}/labels/archive': 'label create archive',
    },
  },
  {
    def: 'short-literal-def.json',
    expect: {
      'GET /fr/{sheetName}{fileExtension}': 'sheet load',
      'GET /search/{versionNumber}/q/{term}.{ext}': 'term load',
      'GET /x/db': 'database load',
      'GET /misc/qq': 'qqn load',
      'GET /misc/qq/{id}': 'qqn load',
    },
  },
  {
    def: 'response-media-def.json',
    expect: {
      'GET /terms/{term}/meanings': 'meaning list',
      'GET /terms/{term}/usage': 'term load usage',
      'GET /rooms/{room_id}/attendance': 'attendance list',
      'GET /ids/contentIds/{contentId}': 'artifact load',
    },
  },
  {
    def: 'namespace-prefix-def.json',
    expect: {
      'POST /encode': 'encode create',
      'POST /check': 'check create',
      'POST /hold': 'payment create',
      'GET /safes/{id}': 'safe load',
    },
  },
  {
    def: 'word-break-def.json',
    expect: {
      'GET /farms/{farmId}/croptypes': 'crop_type list',
      'GET /farms/{farmId}/croptypes/{code}': 'crop_type load',
      'GET /boxsizes': 'box_size list',
      'GET /zipcodes': 'zipcode load',
    },
  },
  {
    def: 'operation-id-def.json',
    expect: {
      'POST /signin/{account}/{login}/authenticate': 'session_key create',
      'POST /signin-jwt/{service_id}/{account}/authenticate': 'session_key create',
      'POST /ra/{account}/{service_id}/sign': 'sign create',
    },
  },
  {
    def: 'no-noun-def.json',
    expect: {
      'GET /{vendor}.json': 'plugin load',
      'GET /list.json': 'plugin load',
      'GET /history': 'placed_order list',
      'GET /aq': 'aq_index_result load',
      'POST /deactivate': 'deactivate create',
    },
  },
  {
    def: 'sub-path-def.json',
    expect: {
      'GET /teams/{teamId}/sync/config': 'preference load',
      'POST /teams/{teamId}/sync/config': 'preference create',
      'GET /clubs/{name}/settings': 'club_setting load',
      'PUT /clubs/{name}/settings': 'club_setting update',
      'PUT /parcels/{id}/address': 'parcel update address',
    },
  },
  {
    def: 'record-key-def.json',
    expect: {
      'GET /homes': 'offer list',
      'GET /homes/{homeRef}': 'offer load',
      'GET /regions/spots': 'place list',
      'GET /regions/spots/{spotsId}': 'place load',
      'GET /regions/spots/by-circle': 'place list by_circle',
    },
  },
  {
    def: 'async-result-def.json',
    expect: {
      'POST /report/render': 'render_operation_result create report',
      'GET /report/renderResults/{resultId}': 'render_operation_result load',
      'POST /devices/{deviceId}/render': 'render_operation_result create device',
    },
  },
  {
    def: 'relationship-def.json',
    expect: {
      'GET /expenses/{expenseId}': 'expense load',
      'POST /expenses/{expenseId}/relationships/tags': 'expense create tags',
      'DELETE /expenses/{expenseId}/relationships/tags': 'expense remove tags',
      'PATCH /expenses/{expenseId}/relationships/category': 'expense patch category',
    },
  },
  {
    def: 'key-noun-def.json',
    expect: {
      'GET /tsp/answer/{jobId}': 'job load tsp_answer',
      'GET /grid/answer/{jobId}': 'job load grid_answer',
      'GET /wiki/{sheetName}': 'wiki load',
      'PATCH /portal/{storeKey}': 'portal patch',
    },
  },
  {
    def: 'ruling-gaps-def.json',
    expect: {
      'GET /catalog/{vendor}/{plugin}.json': 'plugin load',
      'POST /LedgerLinks/ArchiveEntries': 'ledger_link create archive_entries',
      'GET /alerts/topics': 'topic list',
      'GET /search/notes': 'search list note',
      'GET /journal/{journal_id}/digest': 'digest load',
      'GET /journal/{journal_id}/following': 'journal list following',
    },
  },
  {
    def: 'command-action-def.json',
    expect: {
      'GET /api/doc': 'doc load',
      'POST /api/doc/mdconvert': 'doc create mdconvert',
      'POST /api/doc/docmerge': 'doc create docmerge',
      'GET /projects/{id}/packages': 'package list',
      'PUT /projects/{id}/packages/nuget': 'package update nuget',
      'PUT /projects/{id}/packages/nuget/symbolpackage': 'package update symbolpackage',
      'GET /widgets/{id}': 'widget load',
      'POST /widgets/{id}/labels': 'widget create labels',
    },
  },
  {
    def: 'keyed-verb-def.json',
    expect: {
      'GET /v3/notes/{bookId}': 'note list',
      'GET /v3/notes/{bookId}/{id}': 'note load',
      'POST /v3/notes/{bookId}/{id}/_pin': 'note create pin',
      'POST /v3/notes/{bookId}/{id}/_mute': 'note create mute',
    },
  },
  // Readings both strategies share: a POST that reads beneath an item, a record
  // that holds lists, names that carry no entity, route syntax, a method with
  // no component of its own, verb words, and a verb after a run of keys.
  {
    def: 'read-verb-item-def.json',
    expect: {
      'GET /gadgets': 'gadget list',
      'GET /gadgets/{gadgetId}': 'gadget load',
      'POST /gadgets/{gadgetId}/getLinkedTags': 'gadget list get_linked_tags',
    },
  },
  {
    def: 'record-array-def.json',
    expect: {
      'GET /boards': 'board list',
      'GET /boards/{boardId}': 'board load',
      'GET /boards/{boardId}/acl': 'board load acl',
      'GET /me': 'account load',
      'GET /reports/latest': 'report load latest',
    },
  },
  {
    def: 'generic-name-def.json',
    expect: {
      'GET /boards/{boardId}': 'board load',
      'POST /boards/{boardId}/rules/check': 'board create rule_check',
      'POST /notices/{noticeId}/pin{format}': 'notice create pin',
      'POST /notices/{noticeId}/retract{format}': 'notice create retract',
      'GET /notices/{noticeId}{format}': 'notice load',
      'GET /units/{unitId}/teamgroups': 'team_group list',
      'POST /units/{unitId}/teamgroups': 'team_group create',
      'POST /v1/gadgets/validate': 'gadget create validate',
      'GET /v1/gadgets/{gadget}': 'gadget load',
      'PATCH /v1/gadgets/{gadget}/owners': 'gadget patch owners',
      'GET /v2/kinds': 'kind list',
      'GET /v2/readings': 'reading list',
      'GET /v2/readings/{readingId}': 'reading load',
      'GET /v2/sensors': 'sensor list',
      'GET /v2/zones': 'zone list',
    },
  },
  {
    def: 'route-syntax-def.json',
    expect: {
      'GET /echo': 'echo load',
      'TRACE /echo': 'echo TRACE',
      'GET /labels/{labelId}': 'label load',
      'DELETE /labels/{labelId}#keys': 'label remove',
      'GET /lines/{lineId}': 'line load',
      'GET /lines/{lineId}/stop/{stopId}': 'stop load',
      'DELETE /owners/{ownerId}/pets/${petId}': 'pet remove',
      'GET /owners/{ownerId}/pets/${petId}': 'pet load',
      'POST /walkers/{walkerId}/send_to_front{format}': 'walker create send_to_front',
      'POST /walkers/{walkerId}/walks/reset{format}': 'walker create walk_reset',
      'GET /walkers/{walkerId}/walks{format}': 'walker load walk',
      'GET /walkers/{walkerId}{format}': 'walker load',
    },
  },
  {
    def: 'same-path-record-def.json',
    expect: {
      'GET /colors': 'color list',
      'GET /colors/{colorId}': 'color load',
      'DELETE /gardens/{gardenId}/plot/{plotId}': 'garden_plot remove',
      'GET /gardens/{gardenId}/plot/{plotId}': 'garden_plot load',
      'PUT /gardens/{gardenId}/plot/{plotId}': 'garden_plot update',
      'GET /shapes': 'shape list',
      'GET /shapes/{shapeId}': 'shape load',
      'GET /sizes': 'size list',
      'GET /sizes/{sizeId}': 'size load',
      'GET /staff/holidays': 'holiday load',
      'DELETE /staff/holidays/{id}': 'holiday remove',
      'GET /staff/holidays/{id}': 'holiday load',
    },
  },
  {
    def: 'verb-word-def.json',
    expect: {
      'GET /books': 'book list',
      'GET /books/autocomplete': 'book list autocomplete',
      'GET /books/contains': 'book list contains',
      'GET /messages/{messageId}': 'message load',
      'PUT /messages/{messageId}/bypass': 'message update bypass',
      'GET /queues/{queueId}': 'queue load',
      'POST /queues/{queueId}/reorder': 'queue create reorder',
      'POST /queues/{queueId}/shuffle': 'queue create shuffle',
      'GET /uploads/{uploadId}': 'upload load',
      'POST /uploads/{uploadId}/finish': 'upload create finish',
    },
  },
  {
    def: 'keyed-verb-3-def.json',
    expect: {
      'GET /shops/{owner}/{shop}': 'shop list',
      'GET /shops/{owner}/{shop}/{orderNum}': 'order_detail load',
      'POST /shops/{owner}/{shop}/{orderNum}/cancel': 'shop create cancel',
      'POST /shops/{owner}/{shop}/{orderNum}/retry': 'shop create retry',
    },
  },
  {
    def: 'tag-key-def.json',
    expect: {
      'GET /teams/{teamId}': 'team load',
      'DELETE /teams/{teamId}/players/{playerId}': 'player remove',
      'POST /teams/{teamId}/players/{playerId}/activate': 'player create activate',
      'GET /vaults/{vaultId}/o/{entry}': 'object load',
    },
  },
]


describe('rulings', () => {

  after(() => {
    for (const dir of staged) {
      Fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  for (const ruling of RULINGS) {
    for (const strategy of ['heuristic01', 'neural01']) {
      test(ruling.def + ' under ' + strategy, async () => {
        const got = owners(await guide(ruling.def, strategy))
        for (const [route, expect] of Object.entries(ruling.expect)) {
          assert.strictEqual(got[route], expect, route)
        }
      })
    }
  }
})

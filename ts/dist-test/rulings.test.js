"use strict";
/* Copyright (c) 2026 Voxgig Ltd, MIT License */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// The rulings on the manual corpus: each fixture shows one, and both
// strategies must classify it the same way.
const Fs = __importStar(require("node:fs"));
const Os = __importStar(require("node:os"));
const Path = __importStar(require("node:path"));
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const util_1 = require("@voxgig/util");
const apidef_1 = require("../dist/apidef");
const DEFDIR = Path.join(__dirname, '..', 'test', 'def');
const SILENT = (0, util_1.Pino)({ level: 'silent' });
const staged = [];
async function guide(def, strategy) {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'apidef-rulings-'));
    staged.push(dir);
    const folder = Path.join(dir, 'model');
    Fs.mkdirSync(Path.join(folder, 'guide'), { recursive: true });
    Fs.mkdirSync(Path.join(dir, 'def'));
    Fs.copyFileSync(Path.join(DEFDIR, def), Path.join(dir, 'def', def));
    Fs.writeFileSync(Path.join(folder, 'guide', 'guide.aontu'), '@"@voxgig/apidef/model/guide.aontu"\n@"./base-guide.aontu"\n');
    const build = await apidef_1.ApiDef.makeBuild({ folder, strategy });
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
    }, {});
    node_assert_1.default.strictEqual(bres.ok, true, def + ': ' + String(bres.err?.message));
    return bres.guide;
}
// The entity and operation of each route, keyed `METHOD path`.
function owners(g) {
    const out = {};
    for (const [ename, ent] of Object.entries(g.entity)) {
        for (const [p, gp] of Object.entries(ent.path ?? {})) {
            for (const [opname, op] of Object.entries(gp.op ?? {})) {
                const actions = Object.keys(gp.action ?? {}).sort();
                out[op.method + ' ' + p] = ename + ' ' + opname + (0 < actions.length ? ' ' + actions.join(',') : '');
            }
        }
    }
    return out;
}
const RULINGS = [
    {
        def: 'tag-noun-def.json',
        expect: {
            'GET /folders/': 'folder list',
            'POST /folders/': 'folder create',
            'GET /folders/{folder_id}': 'folder load',
            'DELETE /folders/{folder_id}': 'folder remove',
            'GET /reference-data/locations/pois/{poisId}': 'poi load',
            'GET /{id}': 'thing load',
        },
    },
    {
        def: 'wrapper-cmp-def.json',
        expect: {
            'GET /templates': 'template list',
            'POST /templates': 'template create',
            'GET /templates/{id}': 'template load',
            'DELETE /templates/{id}': 'template remove',
            'GET /templates/{id}/file': 'template load file',
        },
    },
    {
        def: 'key-param-def.json',
        expect: {
            'GET /b': 'bucket list',
            'POST /b': 'bucket create',
            'GET /b/{bucket}': 'bucket load',
            'PATCH /b/{bucket}': 'bucket patch',
            'DELETE /b/{bucket}': 'bucket remove',
            'GET /b/{bucket}/o': 'object list',
            'GET /b/{bucket}/o/{object}': 'object load',
        },
    },
    {
        def: 'placeholder-ext-def.json',
        expect: {
            'GET /lists.{format}': 'list list',
            'GET /lists/names.{format}': 'name list',
            'GET /reviews.{format}': 'review list',
        },
    },
    {
        def: 'sub-read-def.json',
        expect: {
            'GET /districts': 'district list',
            'GET /districts/{id}': 'district load',
            'GET /districts/{id}/status': 'district load status',
            'GET /districts/{id}/profile': 'profile load',
        },
    },
    {
        def: 'projection-def.json',
        expect: {
            'GET /teachers': 'teacher list',
            'GET /teachers/{id}': 'teacher load',
            'GET /teachers/{id}/grade_levels': 'teacher load grade_level',
            'GET /teachers/{id}/students': 'student list',
        },
    },
    {
        def: 'command-def.json',
        expect: {
            'POST /#Action=AssumeRole': 'assume_role create',
            'GET /keys': 'key list',
            'POST /keys/{keyName}/requestToken': 'token create',
            'GET /account': 'account load',
            'POST /account': 'account create',
        },
    },
    {
        def: 'post-read-def.json',
        expect: {
            'POST /listRecurringDetails': 'recurring_detail list',
            'GET /things': 'thing list',
            'POST /things/search': 'thing list search',
            'POST /things/count': 'thing create count',
        },
    },
    {
        def: 'module-affix-def.json',
        expect: {
            'GET /v1/ProductsApi': 'product list',
            'POST /v1/ProductsApi': 'product create',
            'GET /v1/ProductsApi/{serial}': 'product load',
            'DELETE /v1/ProductsApi/{serial}': 'product remove',
            'POST /v1/ProductsApi/Find': 'product list find',
            'GET /v1/KeysApi/Current/{serial}': 'key load',
        },
    },
    {
        def: 'prefix-tag-def.json',
        expect: {
            'GET /push/deviceRegistrations': 'device_registration list',
            'POST /push/deviceRegistrations': 'device_registration create',
            'GET /push/deviceRegistrations/{device_id}': 'device_registration load',
            'DELETE /push/deviceRegistrations/{device_id}': 'device_registration remove',
            'GET /gifs': 'gif list',
            'GET /gifs/{gif_id}': 'gif load',
            'GET /gifs/random': 'gif load random',
            'GET /user/{user_id}/followers': 'user load follower',
        },
    },
    {
        def: 'body-media-def.json',
        expect: {
            'POST /#Action=AssumeRole': 'assume_role create',
            'GET /#Action=AssumeRole': 'assume_role load',
            'GET /keys': 'key list',
            'POST /keys/{keyName}/requestToken': 'token create',
            'POST /authn/{service_id}/{account}/authenticate': 'authenticate create',
        },
    },
    {
        def: 'path-syntax-def.json',
        expect: {
            'GET /api/articles{mediaTypeExtension}': 'article list',
            'GET /{pageName}{mediaTypeExtension}': 'page load',
            'GET /search/nearbySearch/.{ext}': 'nearby_search load',
            'GET /templates': 'template list',
            'GET /templates/{id}': 'template load',
            'POST /templates?desc=html': 'template create',
        },
    },
    {
        def: 'record-name-def.json',
        expect: {
            'GET /b/{bucket}': 'bucket load',
            'GET /b/{bucket}/acl': 'bucket_access_control list',
            'POST /b/{bucket}/acl': 'bucket_access_control create',
            'GET /b/{bucket}/acl/{entity}': 'bucket_access_control load',
            'PUT /b/{bucket}/acl/{entity}': 'bucket_access_control update',
            'DELETE /b/{bucket}/acl/{entity}': 'bucket_access_control remove',
            'GET /hotels/{hotelId}/rateplans': 'rateplan list',
            'GET /hotels/{hotelId}/rateplans/{code}': 'rateplan load',
        },
    },
    {
        def: 'deep-view-def.json',
        expect: {
            'GET /companies': 'company list',
            'GET /companies/{companyId}': 'company load',
            'GET /meta/companies/{companyId}/sync/commerce/status': 'company load sync_commerce_status',
            'GET /authn-gcp/{account}/status': 'authn_gcp load status',
            'GET /servers/{server_id}/statistics': 'server_statistic list',
        },
    },
    {
        def: 'embedded-def.json',
        expect: {
            'GET /students/{id}': 'student load',
            'GET /students/{id}/contacts': 'student_contact list',
            'GET /word.json/{word}': 'word load',
            'GET /word.json/{word}/definitions': 'word list definition',
        },
    },
];
(0, node_test_1.describe)('rulings', () => {
    (0, node_test_1.after)(() => {
        for (const dir of staged) {
            Fs.rmSync(dir, { recursive: true, force: true });
        }
    });
    for (const ruling of RULINGS) {
        for (const strategy of ['heuristic01', 'neural01']) {
            (0, node_test_1.test)(ruling.def + ' under ' + strategy, async () => {
                const got = owners(await guide(ruling.def, strategy));
                for (const [route, expect] of Object.entries(ruling.expect)) {
                    node_assert_1.default.strictEqual(got[route], expect, route);
                }
            });
        }
    }
});
//# sourceMappingURL=rulings.test.js.map
"use strict";
/* Copyright (c) 2024 Voxgig Ltd, MIT License */
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
const Fs = __importStar(require("node:fs"));
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const aontu_1 = require("aontu");
const apidef_1 = require("../dist/apidef");
// TODO: remove all sdk refs or rename to api
const aontu = new aontu_1.Aontu({ fs: Fs });
(0, node_test_1.describe)('apidef', () => {
    (0, node_test_1.test)('exist', async () => {
        node_assert_1.default.ok(apidef_1.ApiDef);
    });
    // aontu resolves @-includes through @tabnas/multisource, which picks POSIX
    // vs native path semantics purely from whether an fs was injected:
    //   const P = null != ctx.meta?.fs ? Path.posix : Path
    // apidef used to forward ctx.fs unconditionally, but ctx.fs defaults to the
    // real node:fs — so on Windows the guide path was parsed with Path.posix,
    // 'D:\...\guide\x.aon' yielded an empty base dir, and every sibling
    // include failed with `source not found: <prefix>base-guide.aontu`. Linux
    // and macOS never saw it because there Path and Path.posix are identical.
    //
    // Pin the contract: forward fs only when the caller actually supplied one.
    // Asserted on the flag rather than on behaviour so it fails on any platform.
    (0, node_test_1.test)('fs-injected-flag', async () => {
        const outprefix = 'solar-1.0.0-openapi-3.0.0-';
        const folder = __dirname + '/../test/solar';
        const spec = {
            spec: {
                base: folder,
                buildargs: {
                    apidef: {
                        ctrl: { step: { parse: true, guide: true, transformers: false } }
                    }
                }
            }
        };
        // ctx.work.guideAontuFs records what was actually put on the aontu opts,
        // so reverting to an unconditional `opts.fs = ctx.fs` fails this.
        const defaultBuild = await apidef_1.ApiDef.makeBuild({ folder, outprefix });
        const defaultRes = await defaultBuild({ name: 'solar', def: outprefix + 'def.yaml' }, spec, {});
        node_assert_1.default.strictEqual(defaultRes.ctx.fsInjected, false);
        node_assert_1.default.strictEqual(defaultRes.ctx.work.guideAontuFs, false, 'default node:fs must NOT be forwarded to aontu — it makes multisource ' +
            'parse Windows paths with Path.posix and every @-include fails');
        const customFs = { ...Fs };
        const injectedBuild = await apidef_1.ApiDef.makeBuild({ folder, outprefix, fs: customFs });
        const injectedRes = await injectedBuild({ name: 'solar', def: outprefix + 'def.yaml' }, spec, {});
        node_assert_1.default.strictEqual(injectedRes.ctx.fsInjected, true);
        node_assert_1.default.strictEqual(injectedRes.ctx.work.guideAontuFs, true, 'an explicitly supplied fs (e.g. memfs) must still be forwarded');
    });
    (0, node_test_1.test)('guide-solar', async () => {
        const outprefix = 'solar-1.0.0-openapi-3.0.0-';
        const folder = __dirname + '/../test/solar';
        const build = await apidef_1.ApiDef.makeBuild({
            folder,
            debug: 'debug',
            outprefix,
        });
        const bres = await build({
            name: 'solar',
            def: outprefix + 'def.yaml'
        }, {
            spec: {
                base: __dirname + '/../test/solar',
                buildargs: {
                    apidef: {
                        ctrl: {
                            step: {
                                parse: true,
                                guide: true,
                                transformers: false,
                                builders: false,
                                generate: false,
                            }
                        }
                    }
                }
            }
        }, {});
        node_assert_1.default.deepStrictEqual(bres.guide.entity, SOLAR_GUIDE.entity);
        node_assert_1.default.deepStrictEqual(bres.guide.metrics.count.entity, SOLAR_GUIDE.metrics.count.entity);
        node_assert_1.default.deepStrictEqual(bres.guide.metrics.count.path, SOLAR_GUIDE.metrics.count.path);
        node_assert_1.default.deepStrictEqual(bres.guide.metrics.count.method, SOLAR_GUIDE.metrics.count.method);
    });
    // GitHub-style compound key: two path params in a row, no literal
    // between them. GET must classify as load, not merge into list.
    (0, node_test_1.test)('guide-compound-key-load', async () => {
        const folder = __dirname + '/../test/compound';
        const build = await apidef_1.ApiDef.makeBuild({ folder });
        const bres = await build({ name: 'compound', def: 'compound-def.json' }, {
            spec: {
                base: folder,
                buildargs: {
                    apidef: {
                        ctrl: { step: {
                                parse: true, guide: true, transformers: false,
                                builders: false, generate: false,
                            } }
                    }
                }
            }
        }, {});
        const ops = Object.keys(bres.guide.entity.repo.path['/repos/{owner}/{repo}'].op);
        node_assert_1.default.ok(ops.includes('load'), 'GET /repos/{owner}/{repo} did not classify as load');
        node_assert_1.default.ok(!ops.includes('list'), 'GET /repos/{owner}/{repo} wrongly classified as list');
    });
    (0, node_test_1.test)('field-required-solar', async () => {
        const outprefix = 'solar-1.0.0-openapi-3.0.0-';
        const folder = __dirname + '/../test/solar';
        const build = await apidef_1.ApiDef.makeBuild({
            folder,
            debug: 'debug',
            outprefix,
        });
        const bres = await build({
            name: 'solar',
            def: outprefix + 'def.yaml'
        }, {
            spec: {
                base: __dirname + '/../test/solar',
                buildargs: {
                    apidef: {
                        ctrl: {
                            step: {
                                parse: true,
                                guide: true,
                                transformers: true,
                                builders: true,
                                generate: true,
                            }
                        }
                    }
                }
            }
        }, {});
        // console.log('BRES-KEYS', JSON.stringify(Object.keys(bres)))
        const planet = bres.apimodel.main.kit.entity.planet;
        const moon = bres.apimodel.main.kit.entity.moon;
        // Planet schema has required: [id, name, kind, diameter]
        const planetFields = {};
        for (const f of planet.fields) {
            planetFields[f.name] = f;
        }
        node_assert_1.default.strictEqual(planetFields.id.req, true);
        node_assert_1.default.strictEqual(planetFields.name.req, true);
        node_assert_1.default.strictEqual(planetFields.kind.req, true);
        node_assert_1.default.strictEqual(planetFields.diameter.req, true);
        // A property's `description` becomes the field's `short`. Every generated
        // per-entity table has a Description column, and every cell was blank
        // because nothing read this. Only Planet.diameter carries one in the
        // fixture, which is the point: the fields WITHOUT a description must not
        // acquire an invented one.
        node_assert_1.default.strictEqual(planetFields.diameter.short, 'Mean equatorial diameter in kilometres.');
        node_assert_1.default.strictEqual(planetFields.id.short, undefined);
        node_assert_1.default.strictEqual(planetFields.name.short, undefined);
        node_assert_1.default.strictEqual(planetFields.kind.short, undefined);
        // Moon schema has required: [id, name, planet_id, kind, diameter]
        const moonFields = {};
        for (const f of moon.fields) {
            moonFields[f.name] = f;
        }
        node_assert_1.default.strictEqual(moonFields.id.req, true);
        node_assert_1.default.strictEqual(moonFields.name.req, true);
        node_assert_1.default.strictEqual(moonFields.planet_id.req, true);
        node_assert_1.default.strictEqual(moonFields.kind.req, true);
        node_assert_1.default.strictEqual(moonFields.diameter.req, true);
    });
    (0, node_test_1.test)('query-verb-book', async () => {
        // RFC 10008 QUERY verb: a safe, idempotent read carrying its filter in the
        // request body. apidef maps it onto load/list. This fixture exercises a
        // `query:` operation on a collection path returning an array of Book, with
        // a separate BookQuery filter schema in the request body.
        const outprefix = 'query-book-';
        const folder = __dirname + '/../test/query';
        const build = await apidef_1.ApiDef.makeBuild({
            folder,
            debug: 'debug',
            outprefix,
        });
        const bres = await build({
            name: 'book',
            def: outprefix + 'def.yaml'
        }, {
            spec: {
                base: __dirname + '/../test/query',
                buildargs: {
                    apidef: {
                        ctrl: {
                            step: {
                                parse: true,
                                guide: true,
                                transformers: true,
                                builders: true,
                                generate: true,
                            }
                        }
                    }
                }
            }
        }, {});
        // The QUERY method is counted like any other method.
        node_assert_1.default.strictEqual(bres.guide.metrics.count.method, 2);
        // The collection QUERY is classified as a `list` op (array response),
        // carrying the QUERY method through to the guide.
        const bookGuide = bres.guide.entity.book;
        node_assert_1.default.ok(bookGuide, 'book entity discovered');
        node_assert_1.default.strictEqual(bookGuide.path['/api/book'].op.list.method, 'QUERY');
        // The QUERY method flows through to the model op point.
        const book = bres.apimodel.main.kit.entity.book;
        node_assert_1.default.strictEqual(book.op.list.points[0].method, 'QUERY');
        // The Book response schema supplies the entity fields...
        const fieldNames = book.fields.map((f) => f.name).sort();
        node_assert_1.default.deepStrictEqual(fieldNames, ['author', 'id', 'title']);
        // ...and the QUERY filter body (BookQuery: q, page) must NOT leak into them.
        node_assert_1.default.ok(!fieldNames.includes('q'), 'filter field q must not leak');
        node_assert_1.default.ok(!fieldNames.includes('page'), 'filter field page must not leak');
    });
    // DISABLED, and honestly: this asserted nothing at all.
    //
    // The body used to begin with a bare `return;`, so the test reported `ok`
    // on every run while never reaching its assertion — SOLAR_MODEL could be
    // replaced with garbage and the suite stayed green (verified). A test that
    // passes without checking is worse than one that is skipped, because the
    // suite count says it is covering the canonical end-to-end pipeline.
    //
    // Re-enabling it fails on drift that has nothing to do with the path
    // representation: every field now comes back `req: true` where SOLAR_MODEL
    // says `req: false`, and each op carries an `input` key the expectation
    // predates. Whether that is correct is a question for whoever changed it —
    // blessing it in a snapshot here would bury it. SOLAR_MODEL's `segments`
    // ARE up to date, so re-enabling is only about those two questions.
    (0, node_test_1.test)('full-solar', { skip: 'SOLAR_MODEL has drifted: field `req` and op `input`' }, async () => {
        const outprefix = 'solar-1.0.0-openapi-3.0.0-';
        const folder = __dirname + '/../test/solar';
        const build = await apidef_1.ApiDef.makeBuild({
            folder,
            debug: 'debug',
            outprefix,
            why: {
                show: false
            }
        });
        const modelSrcQ = `
# apidef test: ${outprefix}

name: solar

@"@voxgig/apidef/model/apidef.aon"

def: '${outprefix}def.yaml'
`;
        const modelSrc = `
# apidef test: ${outprefix}

@"@voxgig/apidef/model/apidef.aon"

name: solar

def: '${outprefix}def.yaml'

`;
        const modelinit = aontu.generate(modelSrc);
        const buildspec = {
            spec: {
                base: __dirname + '/../test/solar'
            }
        };
        const bres = await build(modelinit, buildspec, {});
        node_assert_1.default.strictEqual(bres.ok, true);
        const model = aontu.generate(`@"test/solar/solar.aon"`, {
            base: __dirname + '/..'
        });
        node_assert_1.default.deepStrictEqual(model.main.kit, SOLAR_MODEL.main.kit);
    });
    // The entity builders only ever WRITE: a spec change that removes or
    // renames a derived entity used to leave the old <name>.aontu behind on
    // every regen (12 orphaned list_*.aontu on the dingconnect build). The GC
    // removes exactly those — and nothing a user could own.
    (0, node_test_1.describe)('entity-gc', () => {
        const Os = require('node:os');
        const PathMod = require('node:path');
        function tmpModel(files) {
            const dir = Fs.mkdtempSync(PathMod.join(Os.tmpdir(), 'apidef-gc-'));
            Fs.mkdirSync(PathMod.join(dir, 'entity'));
            for (const [name, content] of Object.entries(files)) {
                Fs.writeFileSync(PathMod.join(dir, 'entity', name), content);
            }
            return dir;
        }
        const GEN = (name) => `# Entity: ${name}\n\nmain: kit: entity: ${name}: {}\n`;
        const listing = (dir) => Fs.readdirSync(PathMod.join(dir, 'entity')).sort();
        (0, node_test_1.test)('removes generated files for entities no longer derived', () => {
            const dir = tmpModel({
                'country.aon': GEN('country'),
                'list_country.aon': GEN('list_country'), // orphan
                'entity-index.aon': '# Entity Models\n',
            });
            const removed = (0, apidef_1.gcEntityFiles)(Fs, null, dir, undefined, ['country']);
            node_assert_1.default.deepStrictEqual(removed, ['list_country.aon']);
            node_assert_1.default.deepStrictEqual(listing(dir), ['country.aon', 'entity-index.aon']);
        });
        (0, node_test_1.test)('never touches a file apidef did not write', () => {
            const dir = tmpModel({
                'country.aon': GEN('country'),
                'custom.aon': '# my hand-written model fragment\nfoo: 1\n', // no generated header
                'notes.txt': 'not aontu at all',
            });
            const removed = (0, apidef_1.gcEntityFiles)(Fs, null, dir, undefined, ['country']);
            node_assert_1.default.deepStrictEqual(removed, []);
            node_assert_1.default.deepStrictEqual(listing(dir), ['country.aon', 'custom.aon', 'notes.txt']);
        });
        (0, node_test_1.test)('respects outprefix — another def sharing the folder is not collected', () => {
            const dir = tmpModel({
                'solar-planet.aon': GEN('planet'),
                'solar-moon.aon': GEN('moon'), // orphan of the solar def
                'solar-entity-index.aon': '# Entity Models\n',
                'lunar-crater.aon': GEN('crater'), // belongs to a DIFFERENT def
            });
            const removed = (0, apidef_1.gcEntityFiles)(Fs, null, dir, 'solar-', ['planet']);
            node_assert_1.default.deepStrictEqual(removed, ['solar-moon.aon']);
            node_assert_1.default.deepStrictEqual(listing(dir), ['lunar-crater.aon', 'solar-entity-index.aon', 'solar-planet.aon']);
        });
        (0, node_test_1.test)('keeps the index and the whole current set; missing folder is a no-op', () => {
            const dir = tmpModel({
                'a.aon': GEN('a'), 'b.aon': GEN('b'),
                'entity-index.aon': '# Entity Models\n',
            });
            node_assert_1.default.deepStrictEqual((0, apidef_1.gcEntityFiles)(Fs, null, dir, undefined, ['a', 'b']), []);
            node_assert_1.default.deepStrictEqual(listing(dir), ['a.aon', 'b.aon', 'entity-index.aon']);
            // No entity folder at all: return empty, do not throw.
            const empty = Fs.mkdtempSync(PathMod.join(Os.tmpdir(), 'apidef-gc-'));
            node_assert_1.default.deepStrictEqual((0, apidef_1.gcEntityFiles)(Fs, null, empty, undefined, ['a']), []);
        });
    });
});
const SOLAR_GUIDE = {
    entity: {
        moon: {
            path: {
                '/api/planet/{planet_id}/moon': {
                    op: {
                        create: { method: 'POST' },
                        list: { method: 'GET' }
                    }
                },
                '/api/planet/{planet_id}/moon/{moon_id}': {
                    rename: { param: { moon_id: 'id' } },
                    op: {
                        load: { method: 'GET' },
                        remove: { method: 'DELETE' },
                        update: { method: 'PUT' }
                    }
                }
            },
            name: 'moon'
        },
        planet: {
            path: {
                '/api/planet': {
                    op: {
                        create: { method: 'POST' },
                        list: { method: 'GET' }
                    }
                },
                '/api/planet/{planet_id}': {
                    rename: { param: { planet_id: 'id' } },
                    op: {
                        load: { method: 'GET' },
                        remove: { method: 'DELETE' },
                        update: { method: 'PUT' }
                    }
                },
                '/api/planet/{planet_id}/forbid': {
                    action: { forbid: {} },
                    rename: { param: { planet_id: 'id' } },
                    op: { create: { method: 'POST' } }
                },
                '/api/planet/{planet_id}/terraform': {
                    action: { terraform: {} },
                    rename: { param: { planet_id: 'id' } },
                    op: { create: { method: 'POST' } }
                }
            },
            name: 'planet'
        }
    },
    metrics: { count: { entity: 2, path: 6, method: 12 } }
};
const SOLAR_MODEL = {
    main: {
        kit: {
            entity: {
                moon: {
                    alias: { field: {} },
                    fields: [
                        {
                            name: 'diameter',
                            req: false,
                            type: '`$NUMBER`',
                            active: true
                        },
                        { name: 'id', req: false, type: '`$STRING`', active: true },
                        {
                            name: 'kind',
                            req: false,
                            type: '`$STRING`',
                            active: true
                        },
                        {
                            name: 'name',
                            req: false,
                            type: '`$STRING`',
                            active: true
                        },
                        {
                            name: 'planet_id',
                            req: false,
                            type: '`$STRING`',
                            active: true
                        }
                    ],
                    id: { field: 'id', name: 'id' },
                    name: 'moon',
                    op: {
                        create: {
                            points: [
                                {
                                    args: {
                                        params: [
                                            {
                                                kind: 'param',
                                                name: 'planet_id',
                                                orig: 'planet_id',
                                                reqd: true,
                                                type: '`$STRING`',
                                                active: true
                                            }
                                        ]
                                    },
                                    method: 'POST',
                                    orig: '/api/planet/{planet_id}/moon',
                                    segments: [{ lit: 'api' }, { lit: 'planet' }, { var: 'planet_id' }, { lit: 'moon' }],
                                    select: { exist: ['planet_id'] },
                                    transform: { req: '`reqdata`', res: '`body`' },
                                    active: true,
                                    relations: []
                                }
                            ],
                            name: 'create'
                        },
                        list: {
                            points: [
                                {
                                    args: {
                                        params: [
                                            {
                                                kind: 'param',
                                                name: 'planet_id',
                                                orig: 'planet_id',
                                                reqd: true,
                                                type: '`$STRING`',
                                                active: true
                                            }
                                        ]
                                    },
                                    method: 'GET',
                                    orig: '/api/planet/{planet_id}/moon',
                                    segments: [{ lit: 'api' }, { lit: 'planet' }, { var: 'planet_id' }, { lit: 'moon' }],
                                    select: { exist: ['planet_id'] },
                                    transform: { req: '`reqdata`', res: '`body`' },
                                    active: true,
                                    relations: []
                                }
                            ],
                            name: 'list'
                        },
                        load: {
                            points: [
                                {
                                    args: {
                                        params: [
                                            {
                                                kind: 'param',
                                                name: 'id',
                                                orig: 'moon_id',
                                                reqd: true,
                                                type: '`$STRING`',
                                                active: true
                                            },
                                            {
                                                kind: 'param',
                                                name: 'planet_id',
                                                orig: 'planet_id',
                                                reqd: true,
                                                type: '`$STRING`',
                                                active: true
                                            }
                                        ]
                                    },
                                    method: 'GET',
                                    orig: '/api/planet/{planet_id}/moon/{moon_id}',
                                    segments: [{ lit: 'api' }, { lit: 'planet' }, { var: 'planet_id' }, { lit: 'moon' }, { var: 'id' }],
                                    rename: { param: { moon_id: 'id' } },
                                    select: { exist: ['id', 'planet_id'] },
                                    transform: { req: '`reqdata`', res: '`body`' },
                                    active: true,
                                    relations: []
                                }
                            ],
                            name: 'load'
                        },
                        remove: {
                            points: [
                                {
                                    args: {
                                        params: [
                                            {
                                                kind: 'param',
                                                name: 'id',
                                                orig: 'moon_id',
                                                reqd: true,
                                                type: '`$STRING`',
                                                active: true
                                            },
                                            {
                                                kind: 'param',
                                                name: 'planet_id',
                                                orig: 'planet_id',
                                                reqd: true,
                                                type: '`$STRING`',
                                                active: true
                                            }
                                        ]
                                    },
                                    method: 'DELETE',
                                    orig: '/api/planet/{planet_id}/moon/{moon_id}',
                                    segments: [{ lit: 'api' }, { lit: 'planet' }, { var: 'planet_id' }, { lit: 'moon' }, { var: 'id' }],
                                    select: { exist: ['id', 'planet_id'] },
                                    transform: { req: '`reqdata`', res: '`body`' },
                                    active: true,
                                    relations: []
                                }
                            ],
                            name: 'remove'
                        },
                        update: {
                            points: [
                                {
                                    args: {
                                        params: [
                                            {
                                                kind: 'param',
                                                name: 'id',
                                                orig: 'moon_id',
                                                reqd: true,
                                                type: '`$STRING`',
                                                active: true
                                            },
                                            {
                                                kind: 'param',
                                                name: 'planet_id',
                                                orig: 'planet_id',
                                                reqd: true,
                                                type: '`$STRING`',
                                                active: true
                                            }
                                        ]
                                    },
                                    method: 'PUT',
                                    orig: '/api/planet/{planet_id}/moon/{moon_id}',
                                    segments: [{ lit: 'api' }, { lit: 'planet' }, { var: 'planet_id' }, { lit: 'moon' }, { var: 'id' }],
                                    select: { exist: ['id', 'planet_id'] },
                                    transform: { req: '`reqdata`', res: '`body`' },
                                    active: true,
                                    relations: []
                                }
                            ],
                            name: 'update'
                        }
                    },
                    relations: { ancestors: [['planet']] },
                    active: true
                },
                planet: {
                    alias: { field: {} },
                    fields: [
                        {
                            name: 'diameter',
                            req: false,
                            type: '`$NUMBER`',
                            active: true
                        },
                        {
                            name: 'forbid',
                            req: false,
                            type: '`$BOOLEAN`',
                            active: true
                        },
                        { name: 'id', req: false, type: '`$STRING`', active: true },
                        {
                            name: 'kind',
                            req: false,
                            type: '`$STRING`',
                            active: true
                        },
                        {
                            name: 'name',
                            req: false,
                            type: '`$STRING`',
                            active: true
                        },
                        {
                            name: 'ok',
                            req: false,
                            type: '`$BOOLEAN`',
                            active: true
                        },
                        {
                            name: 'start',
                            req: false,
                            type: '`$BOOLEAN`',
                            active: true
                        },
                        {
                            name: 'state',
                            req: false,
                            type: '`$STRING`',
                            active: true
                        },
                        {
                            name: 'stop',
                            req: false,
                            type: '`$BOOLEAN`',
                            active: true
                        },
                        {
                            name: 'why',
                            req: false,
                            type: '`$STRING`',
                            active: true
                        }
                    ],
                    id: { field: 'id', name: 'id' },
                    name: 'planet',
                    op: {
                        create: {
                            points: [
                                {
                                    args: {
                                        params: [
                                            {
                                                kind: 'param',
                                                name: 'id',
                                                orig: 'planet_id',
                                                reqd: true,
                                                type: '`$STRING`',
                                                active: true
                                            }
                                        ]
                                    },
                                    method: 'POST',
                                    orig: '/api/planet/{planet_id}/forbid',
                                    segments: [{ lit: 'api' }, { lit: 'planet' }, { var: 'id' }, { lit: 'forbid' }],
                                    rename: { param: { planet_id: 'id' } },
                                    select: { '$action': 'forbid', exist: ['id'] },
                                    transform: { req: '`reqdata`', res: '`body`' },
                                    active: true,
                                    relations: []
                                },
                                {
                                    args: {
                                        params: [
                                            {
                                                kind: 'param',
                                                name: 'id',
                                                orig: 'planet_id',
                                                reqd: true,
                                                type: '`$STRING`',
                                                active: true
                                            }
                                        ]
                                    },
                                    method: 'POST',
                                    orig: '/api/planet/{planet_id}/terraform',
                                    segments: [{ lit: 'api' }, { lit: 'planet' }, { var: 'id' }, { lit: 'terraform' }],
                                    rename: { param: { planet_id: 'id' } },
                                    select: { '$action': 'terraform', exist: ['id'] },
                                    transform: { req: '`reqdata`', res: '`body`' },
                                    active: true,
                                    relations: []
                                },
                                {
                                    method: 'POST',
                                    orig: '/api/planet',
                                    segments: [{ lit: 'api' }, { lit: 'planet' }],
                                    transform: { req: '`reqdata`', res: '`body`' },
                                    active: true,
                                    args: { params: [] },
                                    relations: [],
                                    select: {}
                                }
                            ],
                            name: 'create'
                        },
                        list: {
                            points: [
                                {
                                    method: 'GET',
                                    orig: '/api/planet',
                                    segments: [{ lit: 'api' }, { lit: 'planet' }],
                                    transform: { req: '`reqdata`', res: '`body`' },
                                    active: true,
                                    args: { params: [] },
                                    relations: [],
                                    select: {}
                                }
                            ],
                            name: 'list'
                        },
                        load: {
                            points: [
                                {
                                    args: {
                                        params: [
                                            {
                                                kind: 'param',
                                                name: 'id',
                                                orig: 'planet_id',
                                                reqd: true,
                                                type: '`$STRING`',
                                                active: true
                                            }
                                        ]
                                    },
                                    method: 'GET',
                                    orig: '/api/planet/{planet_id}',
                                    segments: [{ lit: 'api' }, { lit: 'planet' }, { var: 'id' }],
                                    rename: { param: { planet_id: 'id' } },
                                    select: { exist: ['id'] },
                                    transform: { req: '`reqdata`', res: '`body`' },
                                    active: true,
                                    relations: []
                                }
                            ],
                            name: 'load'
                        },
                        remove: {
                            points: [
                                {
                                    args: {
                                        params: [
                                            {
                                                kind: 'param',
                                                name: 'id',
                                                orig: 'planet_id',
                                                reqd: true,
                                                type: '`$STRING`',
                                                active: true
                                            }
                                        ]
                                    },
                                    method: 'DELETE',
                                    orig: '/api/planet/{planet_id}',
                                    segments: [{ lit: 'api' }, { lit: 'planet' }, { var: 'id' }],
                                    select: { exist: ['id'] },
                                    transform: { req: '`reqdata`', res: '`body`' },
                                    active: true,
                                    relations: []
                                }
                            ],
                            name: 'remove'
                        },
                        update: {
                            points: [
                                {
                                    args: {
                                        params: [
                                            {
                                                kind: 'param',
                                                name: 'id',
                                                orig: 'planet_id',
                                                reqd: true,
                                                type: '`$STRING`',
                                                active: true
                                            }
                                        ]
                                    },
                                    method: 'PUT',
                                    orig: '/api/planet/{planet_id}',
                                    segments: [{ lit: 'api' }, { lit: 'planet' }, { var: 'id' }],
                                    select: { exist: ['id'] },
                                    transform: { req: '`reqdata`', res: '`body`' },
                                    active: true,
                                    relations: []
                                }
                            ],
                            name: 'update'
                        }
                    },
                    active: true
                }
            },
            flow: {
                BasicMoonFlow: {
                    entity: 'moon',
                    kind: 'basic',
                    name: 'BasicMoonFlow',
                    step: [
                        {
                            data: { id: 'moon_n01', planet_id: 'planet01' },
                            input: { id: 'moon_n01' },
                            op: 'create',
                            active: true,
                            match: {}
                        },
                        {
                            match: { planet_id: 'planet01' },
                            op: 'list',
                            valid: [{ apply: 'ItemExists', spec: { id: 'moon_n01' } }],
                            active: true,
                            data: {}
                        },
                        {
                            data: { id: 'moon_n01', planet_id: 'planet01' },
                            input: { id: 'moon_n01' },
                            op: 'update',
                            spec: [
                                {
                                    apply: 'TextFieldMark',
                                    def: { mark: 'Mark01-moon_n01' }
                                }
                            ],
                            active: true,
                            match: {}
                        },
                        {
                            input: { id: 'moon_n01' },
                            match: { id: 'moon_n01', planet_id: 'planet01' },
                            op: 'load',
                            valid: [
                                {
                                    apply: 'TextFieldMark',
                                    def: { mark: 'Mark01-moon_n01' }
                                }
                            ],
                            active: true,
                            data: {}
                        },
                        {
                            input: { id: 'moon_n01' },
                            match: { id: 'moon_n01', planet_id: 'planet01' },
                            op: 'remove',
                            active: true,
                            data: {}
                        },
                        {
                            match: { planet_id: 'planet01' },
                            op: 'list',
                            valid: [{ apply: 'ItemNotExists', def: { id: 'moon_n01' } }],
                            active: true,
                            data: {}
                        }
                    ],
                    'key$': 'BasicMoonFlow',
                    active: true,
                    param: {}
                },
                BasicPlanetFlow: {
                    entity: 'planet',
                    kind: 'basic',
                    name: 'BasicPlanetFlow',
                    step: [
                        {
                            data: { id: 'planet_n01' },
                            input: { id: 'planet_n01' },
                            op: 'create',
                            active: true,
                            match: {}
                        },
                        {
                            op: 'list',
                            valid: [{ apply: 'ItemExists', spec: { id: 'planet_n01' } }],
                            active: true,
                            match: {},
                            data: {}
                        },
                        {
                            data: { id: 'planet_n01' },
                            input: { id: 'planet_n01' },
                            op: 'update',
                            spec: [
                                {
                                    apply: 'TextFieldMark',
                                    def: { mark: 'Mark01-planet_n01' }
                                }
                            ],
                            active: true,
                            match: {}
                        },
                        {
                            input: { id: 'planet_n01' },
                            match: { id: 'planet_n01' },
                            op: 'load',
                            valid: [
                                {
                                    apply: 'TextFieldMark',
                                    def: { mark: 'Mark01-planet_n01' }
                                }
                            ],
                            active: true,
                            data: {}
                        },
                        {
                            input: { id: 'planet_n01' },
                            match: { id: 'planet_n01' },
                            op: 'remove',
                            active: true,
                            data: {}
                        },
                        {
                            op: 'list',
                            valid: [{ apply: 'ItemNotExists', def: { id: 'planet_n01' } }],
                            active: true,
                            match: {},
                            data: {}
                        }
                    ],
                    'key$': 'BasicPlanetFlow',
                    active: true,
                    param: {}
                }
            },
            info: { title: 'Solar System API', version: '1.0.0' }
        }
    }
};
//# sourceMappingURL=apidef.test.js.map
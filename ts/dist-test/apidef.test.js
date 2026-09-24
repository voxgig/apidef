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
const aontu = new aontu_1.Aontu({ fs: Fs });
(0, node_test_1.describe)('apidef', () => {
    (0, node_test_1.test)('exist', async () => {
        node_assert_1.default.ok(apidef_1.ApiDef);
    });
    (0, node_test_1.test)('migrate-legacy-guide', () => {
        const Os = require('node:os');
        const Path = require('node:path');
        const { migrateLegacyGuide } = require('../dist/guide/guide');
        const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'apidef-guide-'));
        Fs.mkdirSync(Path.join(dir, 'guide'), { recursive: true });
        const legacy = Path.join(dir, 'guide', 'x-guide.aon');
        Fs.writeFileSync(legacy, [
            '@"@voxgig/apidef/model/guide.aon"',
            '',
            '@"x-base-guide.aon"',
            '',
            '@"./x-base-guide.aon"',
            '',
            // A user's OWN include that merely ENDS in base-guide.aon. Nothing
            // renamed this file, so rewriting it would point the guide at a path
            // that does not exist — while deleting the original.
            '@"shared-base-guide.aon"',
            '',
            'guide: { entity: { thing: { note: "see guide.aon notes" } } }',
            '',
        ].join('\n'));
        migrateLegacyGuide(Fs, dir, 'x-');
        node_assert_1.default.ok(!Fs.existsSync(legacy), 'legacy file should be gone');
        const out = Fs.readFileSync(Path.join(dir, 'guide', 'x-guide.aontu'), 'utf8');
        node_assert_1.default.ok(out.includes('@"@voxgig/apidef/model/guide.aontu"'), 'package include not migrated: ' + out);
        node_assert_1.default.ok(out.includes('@"x-base-guide.aontu"'), 'base-guide include not migrated: ' + out);
        node_assert_1.default.ok(out.includes('@"./x-base-guide.aontu"'), './ base-guide include not migrated: ' + out);
        node_assert_1.default.ok(!out.includes('x-base-guide.aon"'), 'a base-guide include still names the legacy file: ' + out);
        node_assert_1.default.ok(out.includes('@"shared-base-guide.aon"'), 'a user-owned base-guide include was rewritten: ' + out);
        node_assert_1.default.ok(out.includes('note: "see guide.aon notes"'), 'user content was rewritten: ' + out);
    });
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
    (0, node_test_1.test)('guide-verb-on-parent', async () => {
        const folder = __dirname + '/../test/verb';
        const build = await apidef_1.ApiDef.makeBuild({ folder });
        const bres = await build({ name: 'verb', def: 'verb-def.json' }, {
            spec: {
                base: folder,
                buildargs: {
                    apidef: {
                        ctrl: { step: {
                                parse: true, guide: true, transformers: true,
                                builders: false, generate: false,
                            } }
                    }
                }
            }
        }, {});
        node_assert_1.default.ok(bres.ok, 'build failed: ' + bres.err?.message);
        const gents = Object.keys(bres.guide.entity).sort();
        node_assert_1.default.deepStrictEqual(gents, ['note', 'thing'], 'expected thing + note only, got ' + gents.join(','));
        const merge = bres.guide.entity.thing.path['/things/{thing_number}/merge'];
        node_assert_1.default.ok(null != merge, 'merge path did not join thing');
        node_assert_1.default.deepStrictEqual(Object.keys(merge.action ?? {}), ['merge']);
        node_assert_1.default.deepStrictEqual(Object.keys(merge.op).sort(), ['load', 'update']);
        node_assert_1.default.strictEqual(merge.rename.param.thing_number?.target ?? merge.rename.param.thing_number, 'id');
        const item = bres.guide.entity.thing.path['/things/{thing_number}'];
        node_assert_1.default.strictEqual(item.rename.param.thing_number?.target ?? item.rename.param.thing_number, 'id');
        // The nested collection is still its own entity, with its parent key kept.
        const notes = bres.guide.entity.note.path['/things/{thing_number}/notes'];
        node_assert_1.default.ok(null != notes, 'nested collection lost');
        node_assert_1.default.ok(null == notes.action || 0 === Object.keys(notes.action).length, 'nested collection wrongly became an action');
        // Model: PATCH promoted to update; the merge PUT rides along as an action point.
        const thing = bres.apimodel.main.kit.entity.thing;
        node_assert_1.default.strictEqual(thing.op.patch, undefined, 'patch should have been promoted');
        const update = thing.op.update.points.map((pt) => [pt.m, pt.o, pt.q.$action]);
        node_assert_1.default.deepStrictEqual(update, [
            ['PATCH', '/things/{thing_number}', undefined],
            ['PUT', '/things/{thing_number}/merge', 'merge'],
        ]);
        const load = thing.op.load.points.map((pt) => [pt.m, pt.o, pt.q.$action]);
        node_assert_1.default.deepStrictEqual(load.sort(), [
            ['GET', '/things/{thing_number}', undefined],
            ['GET', '/things/{thing_number}/merge', 'merge'],
        ]);
        // Both item and verb points address the thing by the renamed key.
        for (const pt of [...thing.op.update.points, ...thing.op.load.points]) {
            const names = (pt.g.params ?? []).map((a) => a.n);
            node_assert_1.default.ok(names.includes('id') && !names.includes('thing_number'), pt.o + ' params ' + names.join(','));
        }
    });
    // The Go port pins the same renames in TestGuideRenameGuards.
    (0, node_test_1.test)('guide-rename-guards', async () => {
        const folder = __dirname + '/../test/rename-guard';
        const build = await apidef_1.ApiDef.makeBuild({ folder });
        const bres = await build({ name: 'rename-guard', def: 'rename-guard-def.json' }, {
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
        node_assert_1.default.ok(bres.ok, 'build failed: ' + bres.err?.message);
        const paths = {};
        for (const ent of Object.values(bres.guide.entity))
            Object.assign(paths, ent.path);
        const renames = (path) => Object.fromEntries(Object.entries(paths[path].rename?.param ?? {})
            .map(([k, v]) => [k, v?.target ?? v]));
        // Each `revisions` parent would rename its key to `revision_id`; the later one keeps its name.
        node_assert_1.default.deepStrictEqual(renames('/things/{thing_id}/revisions/{recipe_revision}' +
            '/packages/{package_ref}/revisions/{package_revision}/files/{file_name}'), { file_name: 'id', package_ref: 'package_id', recipe_revision: 'revision_id' });
        // `2fa_id` is not an identifier, so `code` keeps its name.
        node_assert_1.default.deepStrictEqual(renames('/things/{thing_id}/2fa/{code}/checks/{check_id}'), { check_id: 'id' });
    });
    (0, node_test_1.test)('guide-verb-on-parent-edges', async () => {
        const folder = __dirname + '/../test/verb-edge';
        const build = await apidef_1.ApiDef.makeBuild({ folder });
        const bres = await build({ name: 'verb-edge', def: 'verb-edge-def.json' }, {
            spec: {
                base: folder,
                buildargs: {
                    apidef: {
                        ctrl: { step: {
                                parse: true, guide: true, transformers: true,
                                builders: false, generate: false,
                            } }
                    }
                }
            }
        }, {});
        node_assert_1.default.ok(bres.ok, 'build failed: ' + bres.err?.message);
        const gents = bres.guide.entity;
        // The verb joins the entity the item's GET returns, not the one that
        // sorts first (`ack` < `widget`), and the key spelling does not matter.
        const merge = gents.widget?.path['/widgets/{widget_number}/merge'];
        node_assert_1.default.ok(null != merge, 'merge did not join widget: ' + Object.keys(gents).join(','));
        node_assert_1.default.deepStrictEqual(Object.keys(merge.action ?? {}), ['merge']);
        node_assert_1.default.strictEqual(merge.rename.param.widget_number?.target ?? merge.rename.param.widget_number, 'id');
        node_assert_1.default.ok(null == gents.ack?.path['/widgets/{widget_number}/merge'], 'merge wrongly joined ack');
        // A create-only nested collection keeps its entity and its create.
        node_assert_1.default.ok(null != gents.label, 'label entity lost: ' + Object.keys(gents).join(','));
        node_assert_1.default.deepStrictEqual(Object.keys(gents.label.path['/widgets/{id}/labels'].op), ['create']);
        node_assert_1.default.ok(null == gents.widget.path['/widgets/{id}/labels'], 'labels wrongly became a verb on widget');
        const aks = gents.widget_access_key_set;
        node_assert_1.default.ok(null != aks, 'access_keys entity lost: ' + Object.keys(gents).join(','));
        node_assert_1.default.deepStrictEqual(Object.keys(aks.path['/widgets/{id}/access_keys'].op), ['create']);
        node_assert_1.default.ok(null == gents.widget.path['/widgets/{id}/access_keys'], 'a plural collection wrongly became a verb on widget');
        // A verb that suffixes its parent's name is still recorded as an action.
        const archive = gents.email_archive?.path['/email-archives/{email_archive_id}/archive'];
        node_assert_1.default.ok(null != archive, 'archive did not join email_archive: ' + Object.keys(gents).join(','));
        node_assert_1.default.deepStrictEqual(Object.keys(archive.action ?? {}), ['archive']);
        const ea = bres.apimodel.main.kit.entity.email_archive;
        const archivePt = ea.op.update.points.find((pt) => pt.o.endsWith('/archive'));
        node_assert_1.default.strictEqual(archivePt?.q?.$action, 'archive');
    });
    // One page wrapper serves both collections through a shared response. Counted
    // per use it is frequent, so each list takes its name from its path.
    (0, node_test_1.test)('guide-shared-wrapper', async () => {
        const folder = __dirname + '/../test/shared-wrapper';
        const build = await apidef_1.ApiDef.makeBuild({ folder });
        const bres = await build({ name: 'shared-wrapper', def: 'shared-wrapper-def.json' }, {
            spec: {
                base: folder,
                buildargs: {
                    apidef: {
                        ctrl: { step: {
                                parse: true, guide: true, transformers: true,
                                builders: false, generate: false,
                            } }
                    }
                }
            }
        }, {});
        node_assert_1.default.ok(bres.ok, 'build failed: ' + bres.err?.message);
        const entities = bres.apimodel.main.kit.entity;
        const ops = Object.fromEntries(Object.keys(entities).sort()
            .map((name) => [name, Object.keys(entities[name].op ?? {}).sort()]));
        node_assert_1.default.deepStrictEqual(ops, {
            domain: ['list', 'load'],
            kingdom: ['list', 'load'],
        });
    });
    // An envelope never names its entity; the item it carries is judged instead,
    // so each list of the rare shared page keeps its path's name. No envelope:
    // a record with one nested object, a list beside other data (census), a
    // wrapper an operation does not unwrap (crew members, returned whole by a
    // create; the vault's 201), an item another wrapper carries too (metrics).
    (0, node_test_1.test)('guide-envelope', async () => {
        const folder = __dirname + '/../test/envelope';
        const build = await apidef_1.ApiDef.makeBuild({ folder });
        const bres = await build({ name: 'envelope', def: 'envelope-def.json' }, {
            spec: {
                base: folder,
                buildargs: {
                    apidef: {
                        ctrl: { step: {
                                parse: true, guide: true, transformers: true,
                                builders: false, generate: false,
                            } }
                    }
                }
            }
        }, {});
        node_assert_1.default.ok(bres.ok, 'build failed: ' + bres.err?.message);
        const entities = bres.apimodel.main.kit.entity;
        const ops = Object.fromEntries(Object.keys(entities).sort()
            .map((name) => [name, Object.keys(entities[name].op ?? {}).sort()]));
        node_assert_1.default.deepStrictEqual(ops, {
            census: ['list'],
            crew_member: ['create', 'list'],
            deposit: ['create'],
            domain: ['list', 'load', 'update'],
            fossil: ['load'],
            kingdom: ['create', 'list', 'load'],
            // Its 200 has no JSON schema, and still decides over the 201 list.
            ledger: ['load'],
            observation: ['list'],
            package: ['load'],
            sample: ['load'],
            site: ['load'],
            token: ['load'],
        });
        const listpt = entities.observation.op.list.points[0];
        node_assert_1.default.strictEqual(listpt.o, '/{year}/observation');
        node_assert_1.default.ok(null != entities.observation.fields.observedAt, 'observation fields not unwrapped: ' + Object.keys(entities.observation.fields));
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
        for (const f of Object.values(planet.fields)) {
            planetFields[f.n] = f;
        }
        node_assert_1.default.strictEqual(planetFields.id.r, true);
        node_assert_1.default.strictEqual(planetFields.name.r, true);
        node_assert_1.default.strictEqual(planetFields.kind.r, true);
        node_assert_1.default.strictEqual(planetFields.diameter.r, true);
        // A property's `description` becomes the field's `short`. Every generated
        // per-entity table has a Description column, and every cell was blank
        // because nothing read this. Only Planet.diameter carries one in the
        // fixture, which is the point: the fields WITHOUT a description must not
        // acquire an invented one.
        node_assert_1.default.strictEqual(planetFields.diameter.sh, 'Mean equatorial diameter in kilometres.');
        node_assert_1.default.strictEqual(planetFields.id.sh, undefined);
        node_assert_1.default.strictEqual(planetFields.name.sh, undefined);
        node_assert_1.default.strictEqual(planetFields.kind.sh, undefined);
        // Moon schema has required: [id, name, planet_id, kind, diameter]
        const moonFields = {};
        for (const f of Object.values(moon.fields)) {
            moonFields[f.n] = f;
        }
        node_assert_1.default.strictEqual(moonFields.id.r, true);
        node_assert_1.default.strictEqual(moonFields.name.r, true);
        node_assert_1.default.strictEqual(moonFields.planet_id.r, true);
        node_assert_1.default.strictEqual(moonFields.kind.r, true);
        node_assert_1.default.strictEqual(moonFields.diameter.r, true);
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
        node_assert_1.default.strictEqual(book.op.list.points[0].m, 'QUERY');
        // The Book response schema supplies the entity fields...
        const fieldNames = Object.keys(book.fields).sort();
        node_assert_1.default.deepStrictEqual(fieldNames, ['author', 'id', 'title']);
        // ...and the QUERY filter body (BookQuery: q, page) must NOT leak into them.
        node_assert_1.default.ok(!fieldNames.includes('q'), 'filter field q must not leak');
        node_assert_1.default.ok(!fieldNames.includes('page'), 'filter field page must not leak');
    });
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

@"@voxgig/apidef/model/apidef.aontu"

def: '${outprefix}def.yaml'
`;
        const modelSrc = `
# apidef test: ${outprefix}

@"@voxgig/apidef/model/apidef.aontu"

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
        const model = aontu.generate(`@"test/solar/solar.aontu"`, {
            base: __dirname + '/..'
        });
        node_assert_1.default.deepStrictEqual(model.main.kit, SOLAR_MODEL.main.kit);
    });
    (0, node_test_1.describe)('guide entity allowlist', () => {
        const PathMod = require('node:path');
        (0, node_test_1.test)('`active` has no default, so a project can supply one', () => {
            const src = Fs.readFileSync(PathMod.join(__dirname, '..', '..', 'model', 'guide.aontu'), 'utf8');
            const line = src.split('\n').find((l) => /^\s*active\??\s*:/.test(l));
            node_assert_1.default.ok(null != line, 'the guide model must declare `active`');
            node_assert_1.default.match(String(line), /active\?\s*:\s*boolean\s*$/, 'active must stay OPTIONAL with no default: a default here is the ' +
                'same rank as the project\'s and they clash - ' + line);
        });
        (0, node_test_1.test)('the base guide writes no `active`, leaving the slot free', () => {
            // Generated on every run, so a builder that started stamping
            // `active: true` would take the allowlist away silently.
            const built = PathMod.join(__dirname, '..', '..', '..', '..', 'voxgig-sdk', 'univec-sdk', '.sdk', 'model', 'guide', 'base-guide.aontu');
            if (!Fs.existsSync(built)) {
                return; // no sibling checkout here; the unit facts above still hold
            }
            const src = Fs.readFileSync(built, 'utf8');
            node_assert_1.default.strictEqual(/\bactive\s*:/.test(src), false, 'the base guide must not write `active` - it would occupy the slot ' +
                'a project narrows with');
        });
    });
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
                'country.aontu': GEN('country'),
                'list_country.aontu': GEN('list_country'), // orphan
                'entity-index.aontu': '# Entity Models\n',
            });
            const removed = (0, apidef_1.gcEntityFiles)(Fs, null, dir, undefined, ['country']);
            node_assert_1.default.deepStrictEqual(removed, ['list_country.aontu']);
            node_assert_1.default.deepStrictEqual(listing(dir), ['country.aontu', 'entity-index.aontu']);
        });
        (0, node_test_1.test)('never touches a file apidef did not write', () => {
            const dir = tmpModel({
                'country.aontu': GEN('country'),
                'custom.aontu': '# my hand-written model fragment\nfoo: 1\n', // no generated header
                'notes.txt': 'not aontu at all',
            });
            const removed = (0, apidef_1.gcEntityFiles)(Fs, null, dir, undefined, ['country']);
            node_assert_1.default.deepStrictEqual(removed, []);
            node_assert_1.default.deepStrictEqual(listing(dir), ['country.aontu', 'custom.aontu', 'notes.txt']);
        });
        (0, node_test_1.test)('respects outprefix — another def sharing the folder is not collected', () => {
            const dir = tmpModel({
                'solar-planet.aontu': GEN('planet'),
                'solar-moon.aontu': GEN('moon'), // orphan of the solar def
                'solar-entity-index.aontu': '# Entity Models\n',
                'lunar-crater.aontu': GEN('crater'), // belongs to a DIFFERENT def
            });
            const removed = (0, apidef_1.gcEntityFiles)(Fs, null, dir, 'solar-', ['planet']);
            node_assert_1.default.deepStrictEqual(removed, ['solar-moon.aontu']);
            node_assert_1.default.deepStrictEqual(listing(dir), ['lunar-crater.aontu', 'solar-entity-index.aontu', 'solar-planet.aontu']);
        });
        (0, node_test_1.test)('collects legacy .aon files, including one named for a kept entity', () => {
            const dir = tmpModel({
                'solar-planet.aontu': GEN('planet'),
                'solar-planet.aon': GEN('planet'),
                'solar-old.aon': GEN('old'),
                'solar-notes.aon': '# my notes\n',
                'solar-entity-index.aontu': '# Entity Models\n',
            });
            const removed = (0, apidef_1.gcEntityFiles)(Fs, null, dir, 'solar-', ['planet']);
            node_assert_1.default.deepStrictEqual(removed.sort(), ['solar-old.aon', 'solar-planet.aon']);
            node_assert_1.default.deepStrictEqual(listing(dir), ['solar-entity-index.aontu', 'solar-notes.aon', 'solar-planet.aontu']);
        });
        (0, node_test_1.test)('keeps the index and the whole current set; missing folder is a no-op', () => {
            const dir = tmpModel({
                'a.aontu': GEN('a'), 'b.aontu': GEN('b'),
                'entity-index.aontu': '# Entity Models\n',
            });
            node_assert_1.default.deepStrictEqual((0, apidef_1.gcEntityFiles)(Fs, null, dir, undefined, ['a', 'b']), []);
            node_assert_1.default.deepStrictEqual(listing(dir), ['a.aontu', 'b.aontu', 'entity-index.aontu']);
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
                    fields: {
                        diameter: {
                            n: 'diameter', h: 'Diameter',
                            r: false,
                            t: '`$NUMBER`',
                            a: true
                        },
                        id: { n: 'id', h: 'Id', r: false, t: '`$STRING`', a: true },
                        kind: {
                            n: 'kind', h: 'Kind',
                            r: false,
                            t: '`$STRING`',
                            a: true
                        },
                        name: {
                            n: 'name', h: 'Name',
                            r: false,
                            t: '`$STRING`',
                            a: true
                        },
                        planet_id: {
                            n: 'planet_id', h: 'Planet Id',
                            r: false,
                            t: '`$STRING`',
                            a: true
                        }
                    },
                    id: { field: 'id', name: 'id' },
                    name: 'moon',
                    op: {
                        create: {
                            points: [
                                {
                                    g: {
                                        params: [
                                            {
                                                k: 'param',
                                                n: 'planet_id',
                                                or: 'planet_id',
                                                r: true,
                                                t: '`$STRING`',
                                                a: true
                                            }
                                        ]
                                    },
                                    m: 'POST',
                                    o: '/api/planet/{planet_id}/moon',
                                    s: [{ lit: 'api' }, { lit: 'planet' }, { var: 'planet_id' }, { lit: 'moon' }],
                                    q: { exist: ['planet_id'] },
                                    t: { req: '`reqdata`', res: '`body`' },
                                    a: true,
                                    rl: []
                                }
                            ],
                            name: 'create'
                        },
                        list: {
                            points: [
                                {
                                    g: {
                                        params: [
                                            {
                                                k: 'param',
                                                n: 'planet_id',
                                                or: 'planet_id',
                                                r: true,
                                                t: '`$STRING`',
                                                a: true
                                            }
                                        ]
                                    },
                                    m: 'GET',
                                    o: '/api/planet/{planet_id}/moon',
                                    s: [{ lit: 'api' }, { lit: 'planet' }, { var: 'planet_id' }, { lit: 'moon' }],
                                    q: { exist: ['planet_id'] },
                                    t: { req: '`reqdata`', res: '`body`' },
                                    a: true,
                                    rl: []
                                }
                            ],
                            name: 'list'
                        },
                        load: {
                            points: [
                                {
                                    g: {
                                        params: [
                                            {
                                                k: 'param',
                                                n: 'id',
                                                or: 'moon_id',
                                                r: true,
                                                t: '`$STRING`',
                                                a: true
                                            },
                                            {
                                                k: 'param',
                                                n: 'planet_id',
                                                or: 'planet_id',
                                                r: true,
                                                t: '`$STRING`',
                                                a: true
                                            }
                                        ]
                                    },
                                    m: 'GET',
                                    o: '/api/planet/{planet_id}/moon/{moon_id}',
                                    s: [{ lit: 'api' }, { lit: 'planet' }, { var: 'planet_id' }, { lit: 'moon' }, { var: 'id' }],
                                    r: { param: { moon_id: 'id' } },
                                    q: { exist: ['id', 'planet_id'] },
                                    t: { req: '`reqdata`', res: '`body`' },
                                    a: true,
                                    rl: []
                                }
                            ],
                            name: 'load'
                        },
                        remove: {
                            points: [
                                {
                                    g: {
                                        params: [
                                            {
                                                k: 'param',
                                                n: 'id',
                                                or: 'moon_id',
                                                r: true,
                                                t: '`$STRING`',
                                                a: true
                                            },
                                            {
                                                k: 'param',
                                                n: 'planet_id',
                                                or: 'planet_id',
                                                r: true,
                                                t: '`$STRING`',
                                                a: true
                                            }
                                        ]
                                    },
                                    m: 'DELETE',
                                    o: '/api/planet/{planet_id}/moon/{moon_id}',
                                    s: [{ lit: 'api' }, { lit: 'planet' }, { var: 'planet_id' }, { lit: 'moon' }, { var: 'id' }],
                                    q: { exist: ['id', 'planet_id'] },
                                    t: { req: '`reqdata`', res: '`body`' },
                                    a: true,
                                    rl: []
                                }
                            ],
                            name: 'remove'
                        },
                        update: {
                            points: [
                                {
                                    g: {
                                        params: [
                                            {
                                                k: 'param',
                                                n: 'id',
                                                or: 'moon_id',
                                                r: true,
                                                t: '`$STRING`',
                                                a: true
                                            },
                                            {
                                                k: 'param',
                                                n: 'planet_id',
                                                or: 'planet_id',
                                                r: true,
                                                t: '`$STRING`',
                                                a: true
                                            }
                                        ]
                                    },
                                    m: 'PUT',
                                    o: '/api/planet/{planet_id}/moon/{moon_id}',
                                    s: [{ lit: 'api' }, { lit: 'planet' }, { var: 'planet_id' }, { lit: 'moon' }, { var: 'id' }],
                                    q: { exist: ['id', 'planet_id'] },
                                    t: { req: '`reqdata`', res: '`body`' },
                                    a: true,
                                    rl: []
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
                    fields: {
                        diameter: {
                            n: 'diameter', h: 'Diameter',
                            r: false,
                            t: '`$NUMBER`',
                            a: true
                        },
                        forbid: {
                            n: 'forbid', h: 'Forbid',
                            r: false,
                            t: '`$BOOLEAN`',
                            a: true
                        },
                        id: { n: 'id', h: 'Id', r: false, t: '`$STRING`', a: true },
                        kind: {
                            n: 'kind', h: 'Kind',
                            r: false,
                            t: '`$STRING`',
                            a: true
                        },
                        name: {
                            n: 'name', h: 'Name',
                            r: false,
                            t: '`$STRING`',
                            a: true
                        },
                        ok: {
                            n: 'ok', h: 'Ok',
                            r: false,
                            t: '`$BOOLEAN`',
                            a: true
                        },
                        start: {
                            n: 'start', h: 'Start',
                            r: false,
                            t: '`$BOOLEAN`',
                            a: true
                        },
                        state: {
                            n: 'state', h: 'State',
                            r: false,
                            t: '`$STRING`',
                            a: true
                        },
                        stop: {
                            n: 'stop', h: 'Stop',
                            r: false,
                            t: '`$BOOLEAN`',
                            a: true
                        },
                        why: {
                            n: 'why', h: 'Why',
                            r: false,
                            t: '`$STRING`',
                            a: true
                        }
                    },
                    id: { field: 'id', name: 'id' },
                    name: 'planet',
                    op: {
                        create: {
                            points: [
                                {
                                    g: {
                                        params: [
                                            {
                                                k: 'param',
                                                n: 'id',
                                                or: 'planet_id',
                                                r: true,
                                                t: '`$STRING`',
                                                a: true
                                            }
                                        ]
                                    },
                                    m: 'POST',
                                    o: '/api/planet/{planet_id}/forbid',
                                    s: [{ lit: 'api' }, { lit: 'planet' }, { var: 'id' }, { lit: 'forbid' }],
                                    r: { param: { planet_id: 'id' } },
                                    q: { '$action': 'forbid', exist: ['id'] },
                                    t: { req: '`reqdata`', res: '`body`' },
                                    a: true,
                                    rl: []
                                },
                                {
                                    g: {
                                        params: [
                                            {
                                                k: 'param',
                                                n: 'id',
                                                or: 'planet_id',
                                                r: true,
                                                t: '`$STRING`',
                                                a: true
                                            }
                                        ]
                                    },
                                    m: 'POST',
                                    o: '/api/planet/{planet_id}/terraform',
                                    s: [{ lit: 'api' }, { lit: 'planet' }, { var: 'id' }, { lit: 'terraform' }],
                                    r: { param: { planet_id: 'id' } },
                                    q: { '$action': 'terraform', exist: ['id'] },
                                    t: { req: '`reqdata`', res: '`body`' },
                                    a: true,
                                    rl: []
                                },
                                {
                                    m: 'POST',
                                    o: '/api/planet',
                                    s: [{ lit: 'api' }, { lit: 'planet' }],
                                    t: { req: '`reqdata`', res: '`body`' },
                                    a: true,
                                    g: { params: [] },
                                    rl: [],
                                    q: {}
                                }
                            ],
                            name: 'create'
                        },
                        list: {
                            points: [
                                {
                                    m: 'GET',
                                    o: '/api/planet',
                                    s: [{ lit: 'api' }, { lit: 'planet' }],
                                    t: { req: '`reqdata`', res: '`body`' },
                                    a: true,
                                    g: { params: [] },
                                    rl: [],
                                    q: {}
                                }
                            ],
                            name: 'list'
                        },
                        load: {
                            points: [
                                {
                                    g: {
                                        params: [
                                            {
                                                k: 'param',
                                                n: 'id',
                                                or: 'planet_id',
                                                r: true,
                                                t: '`$STRING`',
                                                a: true
                                            }
                                        ]
                                    },
                                    m: 'GET',
                                    o: '/api/planet/{planet_id}',
                                    s: [{ lit: 'api' }, { lit: 'planet' }, { var: 'id' }],
                                    r: { param: { planet_id: 'id' } },
                                    q: { exist: ['id'] },
                                    t: { req: '`reqdata`', res: '`body`' },
                                    a: true,
                                    rl: []
                                }
                            ],
                            name: 'load'
                        },
                        remove: {
                            points: [
                                {
                                    g: {
                                        params: [
                                            {
                                                k: 'param',
                                                n: 'id',
                                                or: 'planet_id',
                                                r: true,
                                                t: '`$STRING`',
                                                a: true
                                            }
                                        ]
                                    },
                                    m: 'DELETE',
                                    o: '/api/planet/{planet_id}',
                                    s: [{ lit: 'api' }, { lit: 'planet' }, { var: 'id' }],
                                    q: { exist: ['id'] },
                                    t: { req: '`reqdata`', res: '`body`' },
                                    a: true,
                                    rl: []
                                }
                            ],
                            name: 'remove'
                        },
                        update: {
                            points: [
                                {
                                    g: {
                                        params: [
                                            {
                                                k: 'param',
                                                n: 'id',
                                                or: 'planet_id',
                                                r: true,
                                                t: '`$STRING`',
                                                a: true
                                            }
                                        ]
                                    },
                                    m: 'PUT',
                                    o: '/api/planet/{planet_id}',
                                    s: [{ lit: 'api' }, { lit: 'planet' }, { var: 'id' }],
                                    q: { exist: ['id'] },
                                    t: { req: '`reqdata`', res: '`body`' },
                                    a: true,
                                    rl: []
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
                            d: { id: 'moon_n01', planet_id: 'planet01' },
                            i: { id: 'moon_n01' },
                            o: 'create',
                            a: true,
                            m: {}
                        },
                        {
                            m: { planet_id: 'planet01' },
                            o: 'list',
                            v: [{ apply: 'ItemExists', spec: { id: 'moon_n01' } }],
                            a: true,
                            d: {}
                        },
                        {
                            d: { id: 'moon_n01', planet_id: 'planet01' },
                            i: { id: 'moon_n01' },
                            o: 'update',
                            s: [
                                {
                                    apply: 'TextFieldMark',
                                    def: { mark: 'Mark01-moon_n01' }
                                }
                            ],
                            a: true,
                            m: {}
                        },
                        {
                            i: { id: 'moon_n01' },
                            m: { id: 'moon_n01', planet_id: 'planet01' },
                            o: 'load',
                            v: [
                                {
                                    apply: 'TextFieldMark',
                                    def: { mark: 'Mark01-moon_n01' }
                                }
                            ],
                            a: true,
                            d: {}
                        },
                        {
                            i: { id: 'moon_n01' },
                            m: { id: 'moon_n01', planet_id: 'planet01' },
                            o: 'remove',
                            a: true,
                            d: {}
                        },
                        {
                            m: { planet_id: 'planet01' },
                            o: 'list',
                            v: [{ apply: 'ItemNotExists', def: { id: 'moon_n01' } }],
                            a: true,
                            d: {}
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
                            d: { id: 'planet_n01' },
                            i: { id: 'planet_n01' },
                            o: 'create',
                            a: true,
                            m: {}
                        },
                        {
                            o: 'list',
                            v: [{ apply: 'ItemExists', spec: { id: 'planet_n01' } }],
                            a: true,
                            m: {},
                            d: {}
                        },
                        {
                            d: { id: 'planet_n01' },
                            i: { id: 'planet_n01' },
                            o: 'update',
                            s: [
                                {
                                    apply: 'TextFieldMark',
                                    def: { mark: 'Mark01-planet_n01' }
                                }
                            ],
                            a: true,
                            m: {}
                        },
                        {
                            i: { id: 'planet_n01' },
                            m: { id: 'planet_n01' },
                            o: 'load',
                            v: [
                                {
                                    apply: 'TextFieldMark',
                                    def: { mark: 'Mark01-planet_n01' }
                                }
                            ],
                            a: true,
                            d: {}
                        },
                        {
                            i: { id: 'planet_n01' },
                            m: { id: 'planet_n01' },
                            o: 'remove',
                            a: true,
                            d: {}
                        },
                        {
                            o: 'list',
                            v: [{ apply: 'ItemNotExists', def: { id: 'planet_n01' } }],
                            a: true,
                            m: {},
                            d: {}
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
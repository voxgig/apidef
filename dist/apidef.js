"use strict";
/* Copyright (c) 2024-2025 Voxgig, MIT License */
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
exports.getModelPath = exports.formatJSONIC = exports.parse = exports.KIT = void 0;
exports.ApiDef = ApiDef;
const Fs = __importStar(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const jostraca_1 = require("jostraca");
const util_1 = require("@voxgig/util");
const decircular_1 = __importDefault(require("decircular"));
const types_1 = require("./types");
Object.defineProperty(exports, "KIT", { enumerable: true, get: function () { return types_1.KIT; } });
const guide_1 = require("./guide/guide");
const parse_1 = require("./parse");
Object.defineProperty(exports, "parse", { enumerable: true, get: function () { return parse_1.parse; } });
const transform_1 = require("./transform");
const utility_1 = require("./utility");
Object.defineProperty(exports, "formatJSONIC", { enumerable: true, get: function () { return utility_1.formatJSONIC; } });
Object.defineProperty(exports, "getModelPath", { enumerable: true, get: function () { return utility_1.getModelPath; } });
const top_1 = require("./transform/top");
const entity_1 = require("./transform/entity");
const operation_1 = require("./transform/operation");
const args_1 = require("./transform/args");
const select_1 = require("./transform/select");
const field_1 = require("./transform/field");
const flow_1 = require("./transform/flow");
const flowstep_1 = require("./transform/flowstep");
const clean_1 = require("./transform/clean");
const entity_2 = require("./builder/entity");
const flow_2 = require("./builder/flow");
// Log non-fatal wierdness.
const dlog = (0, utility_1.getdlog)('apidef', __filename);
function ApiDef(opts) {
    // TODO: gubu opts!
    const fs = opts.fs || Fs;
    const pino = (0, util_1.prettyPino)('apidef', opts);
    const log = pino.child({ cmp: 'apidef' });
    const warn = (0, utility_1.makeWarner)({ point: 'warning', log });
    opts.strategy = opts.strategy || 'heuristic01';
    async function generate(spec) {
        const start = Date.now();
        const steps = [];
        let ctx = undefined;
        let ctrl = undefined;
        let jres = undefined;
        try {
            ctrl = (0, types_1.OpenControlShape)(spec.ctrl || {});
            const model = (0, types_1.OpenModelShape)(spec.model || {});
            const build = (0, types_1.OpenBuildShape)(spec.build || {});
            // Step: parse (API spec).
            if (!ctrl.step.parse) {
                return { ok: true, steps, start, end: Date.now(), ctrl };
            }
            (0, jostraca_1.names)(model, model.name);
            const apimodel = {
                main: {
                    [types_1.KIT]: {
                        info: {},
                        entity: {},
                        flow: {},
                    },
                },
            };
            const buildspec = build.spec;
            let defpath = model.def;
            // TOOD: defpath should be independently defined
            defpath = node_path_1.default.join(buildspec.base, '..', 'def', defpath);
            log.info({
                point: 'generate-start',
                note: (0, utility_1.relativizePath)(defpath),
                defpath,
                start
            });
            // TODO: Validate spec
            ctx = {
                fs,
                log,
                spec,
                opts,
                util: { fixName: transform_1.fixName },
                defpath: node_path_1.default.dirname(defpath),
                model,
                apimodel,
                guide: {},
                def: undefined,
                note: {},
                warn,
                // TODO: remove (moved to guide)
                metrics: {
                    count: {
                        path: 0,
                        method: 0,
                        origcmprefs: {},
                        cmp: 0,
                        tag: 0,
                        entity: 0,
                    },
                    found: {
                        cmp: {},
                        tag: {}
                    }
                },
                work: {}
            };
            const defsrc = (0, utility_1.loadFile)(defpath, 'def', fs, log);
            const def = await (0, parse_1.parse)('OpenAPI', defsrc, { file: defpath });
            const defkeys = Object.keys(def);
            log.info({
                point: 'root-keys',
                defpath,
                note: defkeys.join(', ')
            });
            const safedef = (0, decircular_1.default)(def);
            const fullsrc = JSON.stringify(safedef, null, 2);
            fs.writeFileSync(defpath + '.full.json', fullsrc);
            ctx.def = safedef;
            steps.push('parse');
            // Step: guide (derive).
            if (!ctrl.step.guide) {
                return { ok: false, steps, start, end: Date.now(), ctrl };
            }
            const guideModel = await (0, guide_1.buildGuide)(ctx);
            if (null == guideModel) {
                throw new Error('Unable to build guide.');
            }
            ctx.guide = guideModel.guide;
            steps.push('guide');
            // Step: transformers (transform spec and guide into core structures).
            if (!ctrl.step.transformers) {
                return { ok: true, steps, start, end: Date.now(), ctrl, guide: ctx.guide };
            }
            await (0, top_1.topTransform)(ctx);
            await (0, entity_1.entityTransform)(ctx);
            await (0, operation_1.operationTransform)(ctx);
            await (0, args_1.argsTransform)(ctx);
            await (0, select_1.selectTransform)(ctx);
            await (0, field_1.fieldTransform)(ctx);
            await (0, flow_1.flowTransform)(ctx);
            await (0, flowstep_1.flowstepTransform)(ctx);
            await (0, clean_1.cleanTransform)(ctx);
            steps.push('transformers');
            // Step: builders (build generated sub models).
            if (!ctrl.step.builders) {
                return { ok: true, steps, start, end: Date.now(), ctrl, guide: ctx.guide };
            }
            const builders = [
                await (0, entity_2.makeEntityBuilder)(ctx),
                // TODO: move to sdkgen
                await (0, flow_2.makeFlowBuilder)(ctx),
            ];
            steps.push('builders');
            // Step: generate (generate model files).
            if (!ctrl.step.generate) {
                return { ok: true, steps, start, end: Date.now(), ctrl, guide: ctx.guide };
            }
            const jostraca = (0, jostraca_1.Jostraca)({
                now: spec.now,
                fs: () => fs,
                log,
            });
            const jmodel = {};
            const root = () => (0, jostraca_1.Project)({ folder: '.' }, async () => {
                for (let builder of builders) {
                    builder();
                }
            });
            jres = await jostraca.generate({
                // folder: Path.dirname(opts.folder as string),
                folder: opts.folder,
                model: jmodel,
                existing: { txt: { merge: true } }
            }, root);
            const dlogs = dlog.log();
            if (0 < dlogs.length) {
                for (let dlogentry of dlogs) {
                    log.debug({ point: 'generate-debug', dlogentry, note: String(dlogentry) });
                }
            }
            steps.push('generate');
            const hasWarnings = 0 < warn.history.length;
            const endnote = hasWarnings ? `PARTIAL BUILD! There were ${warn.history.length} warnings (see above).` :
                'success';
            log[hasWarnings ? 'warn' : 'info']({ point: 'generate-end', note: endnote, break: true });
            if (hasWarnings) {
                (0, utility_1.writeFileSyncWarn)(warn, fs, './apidef-warnings.txt', warn.history.map(n => (0, utility_1.formatJSONIC)(n)).join('\n\n'));
            }
            return {
                ok: true,
                err: null,
                start,
                end: Date.now(),
                steps,
                ctrl,
                guide: ctx.guide,
                apimodel: ctx.apimodel,
                ctx,
                jres,
            };
        }
        catch (err) {
            const endnote = '!! BUILD FAILED !! ' + err.message;
            log.error({ point: 'generate-end', err, note: endnote, break: true });
            warn.history.push({
                point: warn.point,
                when: Date.now(),
                err,
                note: endnote
            });
            (0, utility_1.writeFileSyncWarn)(warn, fs, './apidef-warnings.txt', warn.history.map(n => (0, utility_1.formatJSONIC)(n)).join('\n\n'));
            return {
                ok: false,
                err,
                start,
                end: Date.now(),
                steps,
                ctrl,
                guide: ctx?.guide,
                apimodel: ctx?.apimodel,
                ctx,
                jres,
            };
        }
    }
    return {
        generate,
    };
}
ApiDef.makeBuild = async function (opts) {
    let apidef = undefined;
    const config = {
        def: opts.def || 'no-def',
        kind: 'openapi3',
        meta: opts.meta || {},
    };
    const build = async function (model, build, _ctx) {
        if (null == apidef) {
            apidef = ApiDef({
                def: opts.def,
                fs: opts.fs,
                debug: opts.debug,
                folder: opts.folder,
                meta: opts.meta,
                outprefix: opts.outprefix,
                strategy: opts.strategy,
                pino: build.log,
                why: opts.why,
            });
        }
        const ctrl = build.spec.buildargs?.apidef?.ctrl || {};
        return await apidef.generate({ model, build, config, ctrl });
    };
    build.step = 'pre';
    return build;
};
//# sourceMappingURL=apidef.js.map
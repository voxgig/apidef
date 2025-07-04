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
exports.parse = void 0;
exports.ApiDef = ApiDef;
const Fs = __importStar(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const jostraca_1 = require("jostraca");
const util_1 = require("@voxgig/util");
const types_1 = require("./types");
const guide_1 = require("./guide");
const parse_1 = require("./parse");
Object.defineProperty(exports, "parse", { enumerable: true, get: function () { return parse_1.parse; } });
const transform_1 = require("./transform");
const resolver_1 = require("./resolver");
const utility_1 = require("./utility");
const top_1 = require("./transform/top");
const entity_1 = require("./transform/entity");
const operation_1 = require("./transform/operation");
const field_1 = require("./transform/field");
const entity_2 = require("./builder/entity");
const flow_1 = require("./builder/flow");
function ApiDef(opts) {
    // TODO: gubu opts!
    const fs = opts.fs || Fs;
    const pino = (0, util_1.prettyPino)('apidef', opts);
    const log = pino.child({ cmp: 'apidef' });
    opts.strategy = opts.strategy || 'heuristic01';
    async function generate(spec) {
        const start = Date.now();
        const model = (0, types_1.OpenModelShape)(spec.model);
        const build = (0, types_1.OpenBuildShape)(spec.build);
        (0, jostraca_1.names)(model, model.name);
        const apimodel = {
            main: {
                api: {
                    entity: {}
                },
                def: {},
            },
        };
        const buildspec = build.spec;
        let defpath = model.def;
        // TOOD: defpath should be independently defined
        defpath = node_path_1.default.join(buildspec.base, '..', 'def', defpath);
        log.info({
            point: 'generate-start',
            note: defpath.replace(process.cwd(), '.'), defpath, start
        });
        // TODO: Validate spec
        const ctx = {
            fs,
            log,
            spec,
            opts,
            util: { fixName: transform_1.fixName },
            defpath: node_path_1.default.dirname(defpath),
            model,
            apimodel,
            def: undefined
        };
        const defsrc = (0, utility_1.loadFile)(defpath, 'def', fs, log);
        const def = await (0, parse_1.parse)('OpenAPI', defsrc, { file: defpath });
        ctx.def = def;
        const guideBuilder = await (0, guide_1.resolveGuide)(ctx);
        // const transformSpec = await resolveTransforms(ctx)
        const transforms = await (0, resolver_1.resolveElements)(ctx, 'transform', 'openapi', {
            top: top_1.topTransform,
            entity: entity_1.entityTransform,
            operation: operation_1.operationTransform,
            field: field_1.fieldTransform,
        });
        const builders = await (0, resolver_1.resolveElements)(ctx, 'builder', 'standard', {
            entity: entity_2.makeEntityBuilder,
            flow: flow_1.makeFlowBuilder,
        });
        const jostraca = (0, jostraca_1.Jostraca)({
            now: spec.now,
            fs: () => fs,
            log,
        });
        const jmodel = {};
        const root = () => (0, jostraca_1.Project)({ folder: '.' }, async () => {
            guideBuilder();
            // entityBuilder()
            // flowBuilder()
            for (let builder of builders) {
                builder();
            }
        });
        const jres = await jostraca.generate({
            // folder: Path.dirname(opts.folder as string),
            folder: opts.folder,
            model: jmodel,
            existing: { txt: { merge: true } }
        }, root);
        log.info({ point: 'generate-end', note: 'success', break: true });
        return {
            ok: true,
            name: 'apidef',
            apimodel,
        };
    }
    return {
        generate,
    };
}
ApiDef.makeBuild = async function (opts) {
    let apidef = undefined;
    // const outprefix = null == opts.outprefix ? '' : opts.outprefix
    const config = {
        def: opts.def || 'no-def',
        kind: 'openapi3',
        meta: opts.meta || {},
    };
    const build = async function (model, build, ctx) {
        if (null == apidef) {
            apidef = ApiDef({
                ...opts,
                pino: build.log,
            });
        }
        return await apidef.generate({ model, build, config });
    };
    build.step = 'pre';
    return build;
};
//# sourceMappingURL=apidef.js.map
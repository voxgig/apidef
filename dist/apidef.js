"use strict";
/* Copyright (c) 2024 Voxgig, MIT License */
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
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiDef = ApiDef;
const Fs = __importStar(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const openapi_core_1 = require("@redocly/openapi-core");
const chokidar_1 = require("chokidar");
const aontu_1 = require("aontu");
const pino_1 = __importDefault(require("pino"));
const pino_pretty_1 = __importDefault(require("pino-pretty"));
const transform_1 = require("./transform");
function ApiDef(opts = {}) {
    const fs = opts.fs || Fs;
    let pino = opts.pino;
    if (null == pino) {
        let pretty = (0, pino_pretty_1.default)({ sync: true });
        const level = null == opts.debug ? 'info' :
            true === opts.debug ? 'debug' :
                'string' == typeof opts.debug ? opts.debug :
                    'info';
        pino = (0, pino_1.default)({
            name: 'apidef',
            level,
        }, pretty);
    }
    const log = pino.child({ cmp: 'apidef' });
    async function watch(spec) {
        log.info({ point: 'watch-start' });
        log.debug({ point: 'watch-spec', spec });
        await generate(spec);
        const fsw = new chokidar_1.FSWatcher();
        fsw.on('change', (...args) => {
            log.trace({ watch: 'change', file: args[0] });
            generate(spec);
        });
        log.trace({ watch: 'add', what: 'def', file: spec.def });
        fsw.add(spec.def);
        log.trace({ watch: 'add', what: 'guide', file: spec.guilde });
        fsw.add(spec.guide);
    }
    async function generate(spec) {
        const start = Date.now();
        log.info({ point: 'generate-start' });
        log.debug({ point: 'generate-spec', spec });
        // TODO: Validate spec
        const ctx = {
            spec,
            guide: {},
            opts,
            util: { fixName: transform_1.fixName },
            defpath: node_path_1.default.dirname(spec.def)
        };
        const guide = await resolveGuide(spec, opts);
        log.debug({ point: 'guide', guide });
        ctx.guide = guide;
        const transformSpec = await (0, transform_1.resolveTransforms)(ctx);
        log.debug({ point: 'transform', spec: transformSpec });
        let source;
        try {
            source = fs.readFileSync(spec.def, 'utf8');
        }
        catch (err) {
            log.error({ read: 'fail', what: 'def', file: spec.def, err });
            throw err;
        }
        const config = await (0, openapi_core_1.createConfig)({});
        let bundle;
        try {
            bundle = await (0, openapi_core_1.bundleFromString)({
                source,
                config,
                dereference: true,
            });
        }
        catch (err) {
            log.error({ parse: 'fail', what: 'openapi', file: spec.def, err });
            throw err;
        }
        const model = {
            main: {
                api: {
                    entity: {}
                },
                def: {},
            },
        };
        try {
            const def = bundle.bundle.parsed;
            const processResult = await (0, transform_1.processTransforms)(ctx, transformSpec, model, def);
            if (!processResult.ok) {
                log.error({ process: 'fail', what: 'transform', result: processResult });
                throw new Error('Transform failed: ' + processResult.msg);
            }
        }
        catch (err) {
            log.error({ process: 'fail', what: 'transform', err });
            throw err;
        }
        const modelapi = { main: { api: model.main.api } };
        let modelSrc = JSON.stringify(modelapi, null, 2);
        modelSrc = modelSrc.substring(1, modelSrc.length - 1);
        writeChanged(spec.model, modelSrc);
        const modelBasePath = node_path_1.default.dirname(spec.model);
        const defFilePath = node_path_1.default.join(modelBasePath, 'def.jsonic');
        const modelDef = { main: { def: model.main.def } };
        let modelDefSrc = JSON.stringify(modelDef, null, 2);
        modelDefSrc = modelDefSrc.substring(1, modelDefSrc.length - 1);
        let existingSrc = '';
        if (fs.existsSync(defFilePath)) {
            existingSrc = fs.readFileSync(defFilePath, 'utf8');
        }
        let writeModelDef = existingSrc !== modelDefSrc;
        // console.log('APIDEF', writeModelDef)
        // Only write the model def if it has changed
        if (writeModelDef) {
            fs.writeFileSync(defFilePath, modelDefSrc);
        }
        return {
            ok: true,
            model,
        };
    }
    function writeChanged(path, content) {
        let exists = false;
        let changed = false;
        try {
            let existingContent = '';
            exists = fs.existsSync(path);
            if (exists) {
                existingContent = fs.readFileSync(path, 'utf8');
            }
            changed = existingContent !== content;
            log.info({
                write: 'file', skip: !changed, exists, changed,
                contentLength: content.length, file: path
            });
            if (changed) {
                fs.writeFileSync(path, content);
            }
        }
        catch (err) {
            log.error({
                fail: 'write', file: path, exists, changed,
                contentLength: content.length, err
            });
            throw err;
        }
    }
    async function resolveGuide(spec, _opts) {
        if (null == spec.guide) {
            spec.guide = spec.def + '-guide.jsonic';
        }
        const path = node_path_1.default.normalize(spec.guide);
        let src;
        // console.log('APIDEF resolveGuide', path)
        if (fs.existsSync(path)) {
            src = fs.readFileSync(path, 'utf8');
        }
        else {
            src = `
# API Specification Transform Guide

@"@voxgig/apidef/model/guide.jsonic"

guide: entity: {

}

`;
            fs.writeFileSync(path, src);
        }
        // console.log('GUIDE SRC', src)
        const aopts = {};
        const root = (0, aontu_1.Aontu)(src, aopts);
        const hasErr = root.err && 0 < root.err.length;
        // TODO: collect all errors
        if (hasErr) {
            // console.log('RESOLVE-GUIDE PARSE', root.err)
            throw root.err[0].err;
        }
        let genctx = new aontu_1.Context({ root });
        const guide = spec.guideModel = root.gen(genctx);
        // TODO: collect all errors
        if (genctx.err && 0 < genctx.err.length) {
            // console.log('RESOLVE-GUIDE GEN', genctx.err)
            throw new Error(JSON.stringify(genctx.err[0]));
        }
        // console.log('GUIDE')
        // console.dir(guide, { depth: null })
        const pathParts = node_path_1.default.parse(path);
        spec.guideModelPath = node_path_1.default.join(pathParts.dir, pathParts.name + '.json');
        const updatedSrc = JSON.stringify(guide, null, 2);
        // console.log('APIDEF resolveGuide write', spec.guideModelPath, src !== updatedSrc)
        let existingSrc = '';
        if (fs.existsSync(spec.guideModelPath)) {
            existingSrc = fs.readFileSync(spec.guideModelPath, 'utf8');
        }
        if (existingSrc !== updatedSrc) {
            fs.writeFileSync(spec.guideModelPath, updatedSrc);
        }
        return guide;
    }
    return {
        watch,
        generate,
    };
}
//# sourceMappingURL=apidef.js.map
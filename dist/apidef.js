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
const util_1 = require("@voxgig/util");
const transform_1 = require("./transform");
function ApiDef(opts = {}) {
    const fs = opts.fs || Fs;
    const pino = (0, util_1.prettyPino)('apidef', opts);
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
        log.trace({ watch: 'add', what: 'guide', file: spec.guide });
        fsw.add(spec.guide);
    }
    async function generate(spec) {
        const start = Date.now();
        // TODO: validate spec
        const defpath = node_path_1.default.normalize(spec.def);
        log.info({ point: 'generate-start', note: 'defpath', defpath, start });
        log.debug({ point: 'generate-spec', spec });
        // TODO: Validate spec
        const ctx = {
            log,
            spec,
            guide: {},
            opts,
            util: { fixName: transform_1.fixName },
            defpath: node_path_1.default.dirname(defpath)
        };
        const guide = await resolveGuide(spec, opts);
        if (null == guide) {
            return;
        }
        log.debug({ point: 'guide', guide });
        ctx.guide = guide;
        const transformSpec = await (0, transform_1.resolveTransforms)(ctx);
        log.debug({ point: 'transform', spec: transformSpec });
        let source;
        try {
            source = fs.readFileSync(spec.def, 'utf8');
        }
        catch (err) {
            log.error({ read: 'fail', what: 'def', file: defpath, err });
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
            log.error({ parse: 'fail', what: 'openapi', file: defpath, err });
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
            else {
                log.debug({ process: 'result', what: 'transform', result: processResult });
            }
        }
        catch (err) {
            log.error({ process: 'fail', what: 'transform', err });
            throw err;
        }
        const modelapi = { main: { api: model.main.api } };
        let modelSrc = JSON.stringify(modelapi, null, 2);
        modelSrc = modelSrc.substring(1, modelSrc.length - 1);
        writeChanged('api-model', spec.model, modelSrc);
        const modelBasePath = node_path_1.default.dirname(spec.model);
        const defFilePath = node_path_1.default.join(modelBasePath, 'def.jsonic');
        const modelDef = { main: { def: model.main.def } };
        let modelDefSrc = JSON.stringify(modelDef, null, 2);
        modelDefSrc = modelDefSrc.substring(1, modelDefSrc.length - 1);
        writeChanged('def-model', defFilePath, modelDefSrc);
        log.info({ point: 'generate-end', note: 'success', break: true });
        return {
            ok: true,
            model,
        };
    }
    function writeChanged(what, path, content) {
        let exists = false;
        let changed = false;
        let action = '';
        try {
            let existingContent = '';
            path = node_path_1.default.normalize(path);
            exists = fs.existsSync(path);
            if (exists) {
                action = 'read';
                existingContent = fs.readFileSync(path, 'utf8');
            }
            changed = existingContent !== content;
            log.info({
                point: 'write-' + what,
                note: 'changed,file',
                write: 'file', what, skip: !changed, exists, changed,
                contentLength: content.length, file: path
            });
            if (changed) {
                action = 'write';
                fs.writeFileSync(path, content);
            }
        }
        catch (err) {
            log.error({
                fail: action, what, file: path, exists, changed,
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
        let action = '';
        let exists = false;
        try {
            action = 'exists';
            let exists = fs.existsSync(path);
            log.debug({ read: 'file', what: 'guide', file: path, exists });
            if (exists) {
                action = 'read';
                src = fs.readFileSync(path, 'utf8');
            }
            else {
                src = `
# API Specification Transform Guide

@"@voxgig/apidef/model/guide.jsonic"

guide: entity: {

}

guide: control: transform: openapi: order: \`
  top,
  entity,
  operation,
  field,
  manual,
  \`

`;
                action = 'write';
                fs.writeFileSync(path, src);
            }
        }
        catch (err) {
            log.error({ fail: action, what: 'guide', file: path, exists, err });
            throw err;
        }
        const aopts = { path };
        const root = (0, aontu_1.Aontu)(src, aopts);
        const hasErr = root.err && 0 < root.err.length;
        if (hasErr) {
            for (let serr of root.err) {
                let err = new Error('Guide model: ' + serr.msg);
                err.cause$ = [serr];
                if ('syntax' === serr.why) {
                    err.uxmsg$ = true;
                }
                log.error({ fail: 'parse', point: 'guide-parse', file: path, err });
                if (err.uxmsg$) {
                    return;
                }
                else {
                    err.rooterrs$ = root.err;
                    throw err;
                }
            }
        }
        let genctx = new aontu_1.Context({ root });
        const guide = spec.guideModel = root.gen(genctx);
        // TODO: collect all errors
        if (genctx.err && 0 < genctx.err.length) {
            const err = new Error('Guide build error:\n' +
                (genctx.err.map((pe) => pe.msg)).join('\n'));
            log.error({ fail: 'build', what: 'guide', file: path, err });
            err.errs = () => genctx.err;
            throw err;
        }
        const pathParts = node_path_1.default.parse(path);
        spec.guideModelPath = node_path_1.default.join(pathParts.dir, pathParts.name + '.json');
        const updatedSrc = JSON.stringify(guide, null, 2);
        writeChanged('guide-model', spec.guideModelPath, updatedSrc);
        return guide;
    }
    return {
        watch,
        generate,
    };
}
//# sourceMappingURL=apidef.js.map
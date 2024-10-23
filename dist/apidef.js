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
const transform_1 = require("./transform");
function ApiDef(opts = {}) {
    const fs = opts.fs || Fs;
    async function watch(spec) {
        await generate(spec);
        const fsw = new chokidar_1.FSWatcher();
        fsw.on('change', (...args) => {
            // console.log('APIDEF CHANGE', args)
            generate(spec);
        });
        // console.log('APIDEF-WATCH', spec.def)
        fsw.add(spec.def);
        // console.log('APIDEF-WATCH', spec.guide)
        fsw.add(spec.guide);
    }
    async function generate(spec) {
        const start = Date.now();
        // TODO: Validate spec
        const ctx = {
            spec,
            guide: {},
            opts,
            util: { fixName: transform_1.fixName },
            defpath: node_path_1.default.dirname(spec.def)
        };
        if (opts.debug) {
            console.log('@voxgig/apidef =============', start, new Date(start));
            console.dir(spec, { depth: null });
        }
        const guide = await resolveGuide(spec, opts);
        console.log('APIDEF.guide');
        console.dir(guide, { depth: null });
        ctx.guide = guide;
        const transformSpec = await (0, transform_1.resolveTransforms)(ctx);
        console.log('APIDEF.transformSpec', transformSpec);
        const source = fs.readFileSync(spec.def, 'utf8');
        const modelBasePath = node_path_1.default.dirname(spec.model);
        const config = await (0, openapi_core_1.createConfig)({});
        const bundle = await (0, openapi_core_1.bundleFromString)({
            source,
            config,
            dereference: true,
        });
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
            // console.dir(def, { depth: null })
            const processResult = await (0, transform_1.processTransforms)(ctx, transformSpec, model, def);
            console.log('APIDEF.processResult', processResult);
            console.log('APIDEF.model');
            console.dir(model, { depth: null });
        }
        catch (err) {
            console.log('APIDEF ERROR', err);
            throw err;
        }
        const modelapi = { main: { api: model.main.api } };
        let modelSrc = JSON.stringify(modelapi, null, 2);
        modelSrc = modelSrc.substring(1, modelSrc.length - 1);
        /*
        console.log('WRITE', spec.model)
        fs.writeFileSync(
          spec.model,
          modelSrc
        )
        */
        writeChanged(spec.model, modelSrc);
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
        let existingContent = '';
        if (fs.existsSync(path)) {
            existingContent = fs.readFileSync(path, 'utf8');
        }
        let writeFile = existingContent !== content;
        if (writeFile) {
            console.log('WRITE-CHANGE: YES', path);
            fs.writeFileSync(path, content);
        }
        else {
            console.log('WRITE-CHANGE: NO', path);
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
            console.log('RESOLVE-GUIDE PARSE', root.err);
            throw root.err[0].err;
        }
        let genctx = new aontu_1.Context({ root });
        const guide = spec.guideModel = root.gen(genctx);
        // TODO: collect all errors
        if (genctx.err && 0 < genctx.err.length) {
            console.log('RESOLVE-GUIDE GEN', genctx.err);
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
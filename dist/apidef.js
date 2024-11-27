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
exports.ApiDef = ApiDef;
const Fs = __importStar(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_util_1 = require("node:util");
const openapi_core_1 = require("@redocly/openapi-core");
const util_1 = require("@voxgig/util");
const transform_1 = require("./transform");
function ApiDef(opts) {
    const fs = opts.fs || Fs;
    const pino = (0, util_1.prettyPino)('apidef', opts);
    const log = pino.child({ cmp: 'apidef' });
    async function generate(spec) {
        const start = Date.now();
        const buildspec = spec.build.spec;
        let defpath = spec.model.def;
        // TOOD: defpath should be independently defined
        defpath = node_path_1.default.join(buildspec.base, '..', 'def', defpath);
        log.info({
            point: 'generate-start',
            note: defpath.replace(process.cwd(), '.'), defpath, start
        });
        // TODO: Validate spec
        const ctx = {
            log,
            spec,
            opts,
            util: { fixName: transform_1.fixName },
            defpath: node_path_1.default.dirname(defpath),
            model: spec.model
        };
        const transformSpec = await (0, transform_1.resolveTransforms)(ctx);
        log.debug({
            point: 'transform', spec: transformSpec,
            note: log.levelVal <= 20 ? (0, node_util_1.inspect)(transformSpec) : ''
        });
        let source;
        try {
            source = fs.readFileSync(defpath, 'utf8');
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
        const apimodel = {
            main: {
                api: {
                    entity: {}
                },
                def: {},
            },
        };
        const def = bundle.bundle.parsed;
        const processResult = await (0, transform_1.processTransforms)(ctx, transformSpec, apimodel, def);
        if (!processResult.ok) {
            log.error({
                fail: 'process', point: 'transform-result',
                result: processResult, note: processResult.msg,
                err: processResult.results[0]?.err
            });
            return { ok: false, processResult };
        }
        const modelapi = { main: { api: apimodel.main.api } };
        let modelSrc = JSON.stringify(modelapi, null, 2);
        modelSrc =
            '# GENERATED FILE - DO NOT EDIT\n\n' +
                modelSrc.substring(1, modelSrc.length - 1).replace(/\n  /g, '\n');
        const modelPath = node_path_1.default.normalize(spec.config.model);
        // console.log('modelPath', modelPath)
        writeChanged('api-model', modelPath, modelSrc);
        const modelBasePath = node_path_1.default.dirname(modelPath);
        const defFilePath = node_path_1.default.join(modelBasePath, 'def-generated.jsonic');
        const modelDef = { main: { def: apimodel.main.def } };
        let modelDefSrc = JSON.stringify(modelDef, null, 2);
        modelDefSrc =
            '# GENERATED FILE - DO NOT EDIT\n\n' +
                modelDefSrc.substring(1, modelDefSrc.length - 1).replace(/\n  /g, '\n');
        writeChanged('def-model', defFilePath, modelDefSrc);
        log.info({ point: 'generate-end', note: 'success', break: true });
        return {
            ok: true,
            apimodel,
        };
    }
    function writeChanged(point, path, content) {
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
            // console.log('WC', changed, path, existingContent, content)
            log.info({
                point: 'write-' + point,
                note: (changed ? '' : 'not-') + 'changed ' + path,
                write: 'file', skip: !changed, exists, changed,
                contentLength: content.length, file: path
            });
            if (changed) {
                action = 'write';
                fs.writeFileSync(path, content);
            }
        }
        catch (err) {
            log.error({
                fail: action, point, file: path, exists, changed,
                contentLength: content.length, err
            });
            err.__logged__ = true;
            throw err;
        }
    }
    /*
      async function resolveGuide(spec: any, _opts: any) {
        if (null == spec.guide) {
          spec.guide = spec.def + '-guide.jsonic'
        }
    
        const path = Path.normalize(spec.guide)
        let src: string
    
        let action = ''
        let exists = false
        try {
    
          action = 'exists'
          let exists = fs.existsSync(path)
    
          log.debug({ read: 'file', what: 'guide', file: path, exists })
    
          if (exists) {
            action = 'read'
            src = fs.readFileSync(path, 'utf8')
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
    
    `
            action = 'write'
            fs.writeFileSync(path, src)
          }
        }
        catch (err: any) {
          log.error({ fail: action, what: 'guide', file: path, exists, err })
          throw err
        }
    
        const aopts = { path }
        const root = Aontu(src, aopts)
        const hasErr = root.err && 0 < root.err.length
    
        if (hasErr) {
          for (let serr of root.err) {
            let err: any = new Error('Guide model: ' + serr.msg)
            err.cause$ = [serr]
    
            if ('syntax' === serr.why) {
              err.uxmsg$ = true
            }
    
            log.error({ fail: 'parse', point: 'guide-parse', file: path, err })
    
            if (err.uxmsg$) {
              return
            }
            else {
              err.rooterrs$ = root.err
              throw err
            }
          }
        }
    
        let genctx = new Context({ root })
        const guide = spec.guideModel = root.gen(genctx)
    
        // TODO: collect all errors
        if (genctx.err && 0 < genctx.err.length) {
          const err: any = new Error('Guide build error:\n' +
            (genctx.err.map((pe: any) => pe.msg)).join('\n'))
          log.error({ fail: 'build', what: 'guide', file: path, err })
          err.errs = () => genctx.err
          throw err
        }
    
        const pathParts = Path.parse(path)
        spec.guideModelPath = Path.join(pathParts.dir, pathParts.name + '.json')
    
        const updatedSrc = JSON.stringify(guide, null, 2)
    
        writeChanged('guide-model', spec.guideModelPath, updatedSrc)
    
        return guide
      }
    */
    return {
        // watch,
        generate,
    };
}
ApiDef.makeBuild = async function (opts) {
    let apidef = undefined;
    const config = {
        def: opts.def || 'no-def',
        kind: 'openapi3',
        model: opts.folder ? (opts.folder + '/api-generated.jsonic') : 'no-model',
        meta: opts.meta || {},
    };
    const build = async function (model, build, ctx) {
        // console.log('APIDEF build')
        // console.dir(ctx, { depth: null })
        // console.dir(build, { depth: null })
        if (null == apidef) {
            apidef = ApiDef({
                ...opts,
                pino: build.log,
            });
        }
        await apidef.generate({ model, build, config });
    };
    build.step = 'pre';
    return build;
};
//# sourceMappingURL=apidef.js.map
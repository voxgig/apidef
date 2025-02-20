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
const gubu_1 = require("gubu");
const jostraca_1 = require("jostraca");
const util_1 = require("@voxgig/util");
const transform_1 = require("./transform");
const ModelShape = (0, gubu_1.Gubu)({
    def: String,
    main: {
        sdk: {},
        def: {},
        api: {},
    }
});
const OpenModelShape = (0, gubu_1.Gubu)((0, gubu_1.Open)(ModelShape));
const BuildShape = (0, gubu_1.Gubu)({
    spec: {
        base: '',
        path: '',
        debug: '',
        use: {},
        res: [],
        require: '',
        log: {},
        fs: (0, gubu_1.Any)()
    }
});
const OpenBuildShape = (0, gubu_1.Gubu)((0, gubu_1.Open)(BuildShape));
function ApiDef(opts) {
    const fs = opts.fs || Fs;
    const pino = (0, util_1.prettyPino)('apidef', opts);
    const log = pino.child({ cmp: 'apidef' });
    async function generate(spec) {
        const start = Date.now();
        const model = OpenModelShape(spec.model);
        const build = OpenBuildShape(spec.build);
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
            log,
            spec,
            opts,
            util: { fixName: transform_1.fixName },
            defpath: node_path_1.default.dirname(defpath),
            model,
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
            return { ok: false, name: 'apidef', processResult };
        }
        const modelPath = node_path_1.default.normalize(spec.config.model);
        buildModel_api(apimodel, modelPath);
        buildModel_def(apimodel, modelPath);
        buildModel_entity(apimodel, modelPath);
        log.info({ point: 'generate-end', note: 'success', break: true });
        return {
            ok: true,
            name: 'apidef',
            apimodel,
        };
    }
    function buildModel_api(apimodel, modelPath) {
        const modelapi = { main: { api: apimodel.main.api } };
        let modelSrc = JSON.stringify(modelapi, null, 2);
        modelSrc =
            '# GENERATED FILE - DO NOT EDIT\n\n' +
                modelSrc.substring(1, modelSrc.length - 1).replace(/\n  /g, '\n');
        writeChanged('api-model', modelPath, modelSrc);
        return modelPath;
    }
    function buildModel_def(apimodel, modelPath) {
        const modelBasePath = node_path_1.default.dirname(modelPath);
        const defFilePath = node_path_1.default.join(modelBasePath, (null == opts.outprefix ? '' : opts.outprefix) + 'def-generated.jsonic');
        const modelDef = { main: { def: apimodel.main.def } };
        let modelDefSrc = JSON.stringify(modelDef, null, 2);
        modelDefSrc =
            '# GENERATED FILE - DO NOT EDIT\n\n' +
                modelDefSrc.substring(1, modelDefSrc.length - 1).replace(/\n  /g, '\n');
        writeChanged('def-model', defFilePath, modelDefSrc);
    }
    function buildModel_entity(apimodel, modelPath) {
        const modelBasePath = node_path_1.default.dirname(modelPath);
        const entityIncludes = [];
        (0, jostraca_1.each)(apimodel.main.api.entity, ((entity) => {
            entityIncludes.push(entity.name);
            // HEURISTIC: id may be name_id or nameId
            const fieldAliases = (0, jostraca_1.each)(entity.op, (op) => (0, jostraca_1.each)(op.param))
                .flat()
                .reduce((a, p) => (entity.field[p.keys] ? null :
                (p.key$.toLowerCase().includes(entity.name) ?
                    (a[p.key$] = 'id', a.id = p.key$) :
                    null)
                , a), {});
            const fieldAliasesSrc = JSON.stringify(fieldAliases, null, 2)
                .replace(/\n/g, '\n  ');
            const entityFileSrc = `
# Entity ${entity.name}

main: sdk: entity: ${entity.name}: {
  alias: field: ${fieldAliasesSrc}
}

`;
            const entityFilePath = node_path_1.default.join(modelBasePath, 'entity', (null == opts.outprefix ? '' : opts.outprefix) + entity.name + '.jsonic');
            fs.mkdirSync(node_path_1.default.dirname(entityFilePath), { recursive: true });
            // TODO: diff merge
            writeChanged('entity-model', entityFilePath, entityFileSrc, { update: false });
        }));
        modifyModel(fs, node_path_1.default.join(modelBasePath, (null == opts.outprefix ? '' : opts.outprefix) + 'sdk.jsonic'), entityIncludes);
    }
    function writeChanged(point, path, content, flags) {
        let exists = false;
        let changed = false;
        flags = flags || {};
        flags.update = null == flags.update ? true : !!flags.update;
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
            action = flags.update ? 'write' : 'skip';
            log.info({
                point: 'write-' + point,
                note: (changed ? '' : 'not-') + 'changed ' + path,
                write: 'file', skip: !changed, exists, changed,
                contentLength: content.length, file: path
            });
            if (!exists || (changed && flags.update)) {
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
    return {
        generate,
    };
}
ApiDef.makeBuild = async function (opts) {
    let apidef = undefined;
    const outprefix = null == opts.outprefix ? '' : opts.outprefix;
    const config = {
        def: opts.def || 'no-def',
        kind: 'openapi3',
        model: opts.folder ?
            (opts.folder + '/' + outprefix + 'api-generated.jsonic') : 'no-model',
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
async function modifyModel(fs, path, entityIncludes) {
    // TODO: This is a kludge.
    // Aontu should provide option for as-is AST so that can be used
    // to find injection point more reliably
    let src = fs.existsSync(path) ? fs.readFileSync(path, 'utf8') :
        'main: sdk: entity: {}\n';
    let newsrc = '' + src;
    // Inject target file references into model
    entityIncludes.sort().map((entname) => {
        const lineRE = new RegExp(`@"entity/${entname}.jsonic"`);
        if (!src.match(lineRE)) {
            newsrc = newsrc.replace(/(main:\s+sdk:\s+entity:\s+\{\s*\}\n)/, '$1' +
                `@"entity/${entname}.jsonic"\n`);
        }
    });
    if (newsrc.length !== src.length) {
        fs.writeFileSync(path, newsrc);
    }
}
//# sourceMappingURL=apidef.js.map
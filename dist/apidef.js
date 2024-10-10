"use strict";
/* Copyright (c) 2024 Richard Rodger, MIT License */
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
const jostraca_1 = require("jostraca");
function ApiDef(opts = {}) {
    const fs = opts.fs || Fs;
    async function watch(spec) {
        await generate(spec);
        const fsw = new chokidar_1.FSWatcher();
        fsw.on('change', (...args) => {
            generate(spec);
        });
        fsw.add(spec.def);
    }
    async function generate(spec) {
        const guide = await resolveGuide(spec, opts);
        const transform = resolveTranform(spec, guide, opts);
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
            transform(def, model);
        }
        catch (err) {
            console.log('APIDEF ERROR', err);
            throw err;
        }
        const modelapi = { main: { api: model.main.api } };
        let modelSrc = JSON.stringify(modelapi, null, 2);
        modelSrc = modelSrc.substring(1, modelSrc.length - 1);
        fs.writeFileSync(spec.model, modelSrc);
        const defFilePath = node_path_1.default.join(modelBasePath, 'def.jsonic');
        const modelDef = { main: { def: model.main.def } };
        let modelDefSrc = JSON.stringify(modelDef, null, 2);
        modelDefSrc = modelDefSrc.substring(1, modelDefSrc.length - 1);
        fs.writeFileSync(defFilePath, modelDefSrc);
        return {
            ok: true,
            model,
        };
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

@"node_modules/@voxgig/apidef/model/guide.jsonic"

guide: entity: {

}

`;
            fs.writeFileSync(path, src);
        }
        const aopts = {};
        const root = (0, aontu_1.Aontu)(src, aopts);
        const hasErr = root.err && 0 < root.err.length;
        // TODO: collect all errors
        if (hasErr) {
            // console.log(root.err)
            // throw new Error(root.err[0])
            throw root.err[0].err;
        }
        let genctx = new aontu_1.Context({ root });
        const guide = spec.guideModel = root.gen(genctx);
        // TODO: collect all errors
        if (genctx.err && 0 < genctx.err.length) {
            // console.log(genctx.err)
            throw new Error(JSON.stringify(genctx.err[0]));
        }
        // console.log('GUIDE')
        // console.dir(guide, { depth: null })
        const pathParts = node_path_1.default.parse(path);
        spec.guideModelPath = node_path_1.default.join(pathParts.dir, pathParts.name + '.json');
        fs.writeFileSync(spec.guideModelPath, JSON.stringify(guide, null, 2));
        return guide;
    }
    return {
        watch,
        generate,
    };
}
function resolveTranform(spec, guide, opts) {
    return makeOpenAPITransform(spec, guide, opts);
}
function extractFields(properties) {
    const fieldMap = (0, jostraca_1.each)(properties)
        .reduce((a, p) => (a[p.key$] =
        { name: p.key$, kind: (0, jostraca_1.camelify)(p.type) }, a), {});
    return fieldMap;
}
function fixName(base, name, prop = 'name') {
    base[prop.toLowerCase()] = name.toLowerCase();
    base[(0, jostraca_1.camelify)(prop)] = (0, jostraca_1.camelify)(name);
    base[prop.toUpperCase()] = name.toUpperCase();
}
function makeOpenAPITransform(spec, guideModel, opts) {
    const paramBuilder = (paramMap, paramDef, entityModel, pathdef, op, path, entity, model) => {
        paramMap[paramDef.name] = {
            required: paramDef.required
        };
        fixName(paramMap[paramDef.name], paramDef.name);
        const type = paramDef.schema ? paramDef.schema.type : paramDef.type;
        fixName(paramMap[paramDef.name], type, 'type');
    };
    const queryBuilder = (queryMap, queryDef, entityModel, pathdef, op, path, entity, model) => {
        queryMap[queryDef.name] = {
            required: queryDef.required
        };
        fixName(queryMap[queryDef.name], queryDef.name);
        const type = queryDef.schema ? queryDef.schema.type : queryDef.type;
        fixName(queryMap[queryDef.name], type, 'type');
    };
    const opBuilder = {
        any: (entityModel, pathdef, op, path, entity, model) => {
            const em = entityModel.op[op.key$] = {
                path: path.key$,
                method: op.val$,
                param: {},
                query: {},
            };
            fixName(em, op.key$);
            // Params are in the path
            if (0 < path.params.length) {
                let params = (0, jostraca_1.getx)(pathdef[op.val$], 'parameters?in=path') || [];
                if (Array.isArray(params)) {
                    params.reduce((a, p) => (paramBuilder(a, p, entityModel, pathdef, op, path, entity, model), a), em.param);
                }
            }
            // Queries are after the ?
            let queries = (0, jostraca_1.getx)(pathdef[op.val$], 'parameters?in!=path') || [];
            if (Array.isArray(queries)) {
                queries.reduce((a, p) => (queryBuilder(a, p, entityModel, pathdef, op, path, entity, model), a), em.query);
            }
            return em;
        },
        list: (entityModel, pathdef, op, path, entity, model) => {
            return opBuilder.any(entityModel, pathdef, op, path, entity, model);
        },
        load: (entityModel, pathdef, op, path, entity, model) => {
            return opBuilder.any(entityModel, pathdef, op, path, entity, model);
        },
        create: (entityModel, pathdef, op, path, entity, model) => {
            return opBuilder.any(entityModel, pathdef, op, path, entity, model);
        },
        save: (entityModel, pathdef, op, path, entity, model) => {
            return opBuilder.any(entityModel, pathdef, op, path, entity, model);
        },
        remove: (entityModel, pathdef, op, path, entity, model) => {
            return opBuilder.any(entityModel, pathdef, op, path, entity, model);
        },
    };
    function fieldbuild(entityModel, pathdef, op, path, entity, model) {
        // console.log(pathdef)
        let fieldSets = (0, jostraca_1.getx)(pathdef.get, 'responses 200 content "application/json" schema');
        if (fieldSets) {
            if (Array.isArray(fieldSets.allOf)) {
                fieldSets = fieldSets.allOf;
            }
            else if (fieldSets.properties) {
                fieldSets = [fieldSets];
            }
        }
        (0, jostraca_1.each)(fieldSets, (fieldSet) => {
            (0, jostraca_1.each)(fieldSet.properties, (property) => {
                // console.log(property)
                const field = (entityModel.field[property.key$] = entityModel.field[property.key$] || {});
                field.name = property.key$;
                fixName(field, field.name);
                field.type = property.type;
                fixName(field, field.type, 'type');
                field.short = property.description;
            });
        });
    }
    return function OpenAPITransform(def, model) {
        fixName(model.main.api, spec.meta.name);
        // console.log('OpenAPITransform', guideModel)
        model.main.def.desc = def.info.description;
        (0, jostraca_1.each)(guideModel.guide.entity, (entity) => {
            // console.log('ENTITY', entity)
            const entityModel = model.main.api.entity[entity.key$] = {
                op: {},
                field: {},
                cmd: {},
            };
            fixName(entityModel, entity.key$);
            (0, jostraca_1.each)(entity.path, (path) => {
                const pathdef = def.paths[path.key$];
                if (null == pathdef) {
                    throw new Error('APIDEF: path not found in OpenAPI: ' + path.key$ +
                        ' (entity: ' + entity.name + ')');
                }
                path.parts = path.key$.split('/');
                path.params = path.parts
                    .filter((p) => p.startsWith('{'))
                    .map((p) => p.substring(1, p.length - 1));
                // console.log('ENTITY-PATH', entity, path)
                (0, jostraca_1.each)(path.op, (op) => {
                    const opbuild = opBuilder[op.key$];
                    if (opbuild) {
                        opbuild(entityModel, pathdef, op, path, entity, model);
                    }
                    if ('load' === op.key$) {
                        fieldbuild(entityModel, pathdef, op, path, entity, model);
                    }
                });
            });
        });
    };
}
//# sourceMappingURL=apidef.js.map
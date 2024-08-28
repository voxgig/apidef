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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiDef = ApiDef;
const Fs = __importStar(require("node:fs"));
const openapi_core_1 = require("@redocly/openapi-core");
const chokidar_1 = require("chokidar");
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
        const transform = resolveTranform(spec, opts);
        const source = fs.readFileSync(spec.def, 'utf8');
        const config = await (0, openapi_core_1.createConfig)({});
        const bundle = await (0, openapi_core_1.bundleFromString)({
            source,
            config,
            dereference: true,
        });
        const model = {
            main: { api: { entity: {} } }
        };
        try {
            transform(bundle.bundle.parsed, model);
        }
        catch (err) {
            console.log('APIDEF ERROR', err);
            throw err;
        }
        let vxgsrc = JSON.stringify(model, null, 2);
        vxgsrc = vxgsrc.substring(1, vxgsrc.length - 1);
        fs.writeFileSync(spec.model, vxgsrc);
        return {
            ok: true,
            model,
        };
    }
    return {
        watch,
        generate,
    };
}
function resolveTranform(spec, opts) {
    return makeOpenAPITransform(spec, opts);
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
function makeOpenAPITransform(spec, opts) {
    const paramBuilder = (paramMap, paramDef, entityModel, pathdef, op, path, entity, model) => {
        paramMap[paramDef.name] = {
            required: paramDef.required
        };
        fixName(paramMap[paramDef.name], paramDef.name);
        fixName(paramMap[paramDef.name], paramDef.schema.type, 'type');
    };
    const queryBuilder = (queryMap, queryDef, entityModel, pathdef, op, path, entity, model) => {
        queryMap[queryDef.name] = {
            required: queryDef.required
        };
        fixName(queryMap[queryDef.name], queryDef.name);
        fixName(queryMap[queryDef.name], queryDef.schema.type, 'type');
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
    return function OpenAPITransform(def, model) {
        fixName(model.main.api, spec.meta.name);
        (0, jostraca_1.each)(spec.entity, (entity) => {
            const entityModel = model.main.api.entity[entity.key$] = {
                op: {},
                field: {},
                cmd: {},
            };
            fixName(entityModel, entity.key$);
            // const firstPath: any = Object.keys(entity.path)[0]
            // const firstParts = firstPath.split('/')
            // const entityPathPrefix = firstParts[0]
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
                });
            });
        });
    };
}
//# sourceMappingURL=apidef.js.map
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
        transform(bundle.bundle.parsed, model);
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
function makeOpenAPITransform(spec, opts) {
    function extractFields(properties) {
        const fieldMap = (0, jostraca_1.each)(properties)
            .reduce((a, p) => (a[p.key$] =
            { name: p.key$, kind: (0, jostraca_1.camelify)(p.type) }, a), {});
        return fieldMap;
    }
    return function OpenAPITransform(def, model) {
        model.main.api.name = spec.meta.name;
        (0, jostraca_1.each)(spec.entity, (entity) => {
            const entityModel = model.main.api.entity[entity.key$] = {
                field: {},
                cmd: {},
            };
            const firstPath = Object.keys(entity.path)[0];
            const firstParts = firstPath.split('/');
            const entityPathPrefix = firstParts[0];
            (0, jostraca_1.each)(entity.path, (path) => {
                const pathdef = def.paths[path.key$];
                const parts = path.key$.split('/');
                // TODO: use method prop in model!!!
                // Entity Fields
                if (pathdef.get) {
                    // GET foo/{id} -> single item
                    let properties = (0, jostraca_1.getx)(pathdef.get, 'parameters=1 ^1 responses 200 content ' +
                        'application/json schema properties');
                    // GET foo -> item list
                    if (null == properties) {
                        properties = (0, jostraca_1.getx)(pathdef.get, 'parameters=null ^1 responses 200 content ' +
                            'application/json schema items properties');
                    }
                    const field = extractFields(properties);
                    Object.assign(entityModel.field, field);
                }
                // Entity Commands
                else if (pathdef.post) {
                    if (2 < parts.length && parts[0] === entityPathPrefix) {
                        const suffix = parts[parts.length - 1];
                        let param = (0, jostraca_1.getx)(pathdef.post, 'parameters?in=path') || [];
                        let query = (0, jostraca_1.getx)(pathdef.post, 'parameters?in!=path') || [];
                        let response = (0, jostraca_1.getx)(pathdef.post, 'responses 200 content ' +
                            'application/json schema properties');
                        entityModel.cmd[suffix] = {
                            query,
                            param: param.reduce((a, p) => (a[p.name] = { name: p.name, kind: (0, jostraca_1.camelify)(p.schema.type) }, a), {}),
                            response: { field: extractFields(response) }
                        };
                    }
                }
            });
        });
    };
}
//# sourceMappingURL=apidef.js.map
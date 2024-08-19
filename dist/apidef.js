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
const jostraca_1 = require("jostraca");
function ApiDef(opts) {
    const fs = opts.fs || Fs;
    // const jostraca = Jostraca()
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
        // console.log('BUNDLE', bundle.bundle)
        transform(bundle.bundle.parsed, model);
        fs.writeFileSync(spec.model, JSON.stringify(model, null, 2));
        return {
            ok: true,
            model,
        };
    }
    return {
        generate
    };
}
function resolveTranform(spec, opts) {
    return makeOpenAPITransform(spec, opts);
}
function makeOpenAPITransform(spec, opts) {
    return function OpenAPITransform(def, model) {
        console.log('DEF', def);
        model.main.api.name = spec.meta.name;
        (0, jostraca_1.each)(spec.entity, (entity) => {
            console.log('ENTITY', entity);
            (0, jostraca_1.each)(entity.path, (path) => {
                console.log('PATH', path.key$);
                // console.dir(def.paths[path.key$], { depth: null })
                const pathdef = def.paths[path.key$];
                const getdef = pathdef.get;
                if (getdef) {
                    const params = getdef.parameters;
                    if (params && 1 === params.length) {
                        const responses = getdef.responses;
                        if (responses) {
                            const res200 = responses['200'];
                            if (res200) {
                                const content = res200.content;
                                if (content) {
                                    const json = content['application/json'];
                                    if (json) {
                                        const schema = json.schema;
                                        if (schema) {
                                            const properties = schema.properties;
                                            const field = (0, jostraca_1.each)(properties)
                                                .reduce((a, p) => (a[p.key$] =
                                                { kind: (0, jostraca_1.camelify)(p.type) }, a), {});
                                            model.main.api.entity[entity.key$] = { field };
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            });
        });
    };
}
//# sourceMappingURL=apidef.js.map
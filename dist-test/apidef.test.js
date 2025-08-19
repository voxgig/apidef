"use strict";
/* Copyright (c) 2024 Voxgig Ltd, MIT License */
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
Object.defineProperty(exports, "__esModule", { value: true });
const Fs = __importStar(require("node:fs"));
const node_test_1 = require("node:test");
const code_1 = require("@hapi/code");
const aontu_1 = require("aontu");
const Diff = __importStar(require("diff"));
const __1 = require("../");
// TODO: remove all sdk refs or rename to api
(0, node_test_1.describe)('apidef', () => {
    (0, node_test_1.test)('exist', async () => {
        (0, code_1.expect)(__1.ApiDef).exist();
    });
    (0, node_test_1.test)('guide-solar', async () => {
        const outprefix = 'solar-1.0.0-openapi-3.0.0-';
        const folder = __dirname + '/../test/api';
        const build = await __1.ApiDef.makeBuild({
            folder,
            debug: 'debug',
            outprefix,
        });
        const bres = await build({
            name: 'solar',
            def: outprefix + 'def.yaml'
        }, {
            spec: {
                base: __dirname + '/../test/api',
                buildargs: {
                    apidef: {
                        ctrl: {
                            step: {
                                parse: true,
                                guide: true,
                                transformers: false,
                                builders: false,
                                generate: false,
                            }
                        }
                    }
                }
            }
        }, {});
        // console.dir(bres.guide, { depth: null })
        const matchGuide = {
            entity: {
                moon: {
                    path: {
                        '/api/planet/{planet_id}/moon': {
                            op: {
                                create: { method: 'post', transform: {} },
                                list: { method: 'get', transform: {} }
                            }
                        },
                        '/api/planet/{planet_id}/moon/{moon_id}': {
                            op: {
                                load: { method: 'get', transform: {} },
                                remove: { method: 'delete', transform: {} },
                                update: { method: 'put', transform: {} }
                            }
                        }
                    },
                    name: 'moon'
                },
                planet: {
                    path: {
                        '/api/planet': {
                            op: {
                                create: { method: 'post', transform: {} },
                                list: { method: 'get', transform: {} }
                            }
                        },
                        '/api/planet/{planet_id}': {
                            op: {
                                load: { method: 'get', transform: {} },
                                remove: { method: 'delete', transform: {} },
                                update: { method: 'put', transform: {} }
                            }
                        }
                    },
                    name: 'planet'
                }
            }
        };
        (0, code_1.expect)(bres.guide).contains(matchGuide);
    });
    (0, node_test_1.test)('full-solar', async () => {
        const outprefix = 'solar-1.0.0-openapi-3.0.0-';
        const folder = __dirname + '/../test/api';
        const build = await __1.ApiDef.makeBuild({
            folder,
            debug: 'debug',
            outprefix,
        });
        const modelSrc = `
# apidef test: ${outprefix}

name: solar

@"@voxgig/apidef/model/apidef.jsonic"

def: '${outprefix}def.yaml'
`;
        const model = (0, aontu_1.Aontu)(modelSrc).gen();
        const buildspec = {
            spec: {
                base: __dirname + '/../test/api'
            }
        };
        const bres = await build(model, buildspec, {});
        const baseGuideSrc = bres.ctx.note.guide.base;
        if (baseGuideSrc !== SOLAR_GUIDE_BASE) {
            const difflines = Diff.diffLines(baseGuideSrc, SOLAR_GUIDE_BASE);
            console.log(difflines);
            (0, code_1.expect)(bres.ctx.note.guide.base).equal(SOLAR_GUIDE_BASE);
        }
        const rootSrc = `
@"@voxgig/apidef/model/apidef.jsonic"

# @"${outprefix}guide.jsonic"

@"api/${outprefix}api-def.jsonic"
@"api/${outprefix}api-entity-index.jsonic"
@"flow/${outprefix}flow-index.jsonic"

`;
        const rootFile = folder + `/${outprefix}root.jsonic`;
        Fs.writeFileSync(rootFile, rootSrc);
        const result = (0, aontu_1.Aontu)(rootSrc, {
            path: rootFile,
            // base: folder
        }).gen();
        Fs.writeFileSync(folder + `/${outprefix}root.json`, JSON.stringify(result, null, 2));
    });
});
const SOLAR_GUIDE_BASE = `# Guide

guide: {

  entity: moon: { # name:cmp
    path: '/api/planet/{planet_id}/moon': op: { # ent:cmp:moon
      'create': method: post # not-load
      'list': method: get # array
    }
    path: '/api/planet/{planet_id}/moon/{moon_id}': op: { # ent:cmp:moon
      'load': method: get # not-list
      'remove': method: delete # not-load
      'update': method: put # not-load
    }
  }

  entity: planet: { # name:cmp
    path: '/api/planet': op: { # ent:cmp:planet
      'create': method: post # not-load
      'list': method: get # array
    }
    path: '/api/planet/{planet_id}': op: { # ent:cmp:planet
      'load': method: get # not-list
      'remove': method: delete # not-load
      'update': method: put # not-load
    }
  }

}`;
//# sourceMappingURL=apidef.test.js.map
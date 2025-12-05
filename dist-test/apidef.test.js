"use strict";
/* Copyright (c) 2024 Voxgig Ltd, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const code_1 = require("@hapi/code");
const aontu_1 = require("aontu");
const __1 = require("../");
// TODO: remove all sdk refs or rename to api
const aontu = new aontu_1.Aontu();
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
                                create: { method: 'POST' },
                                list: { method: 'GET' }
                            }
                        },
                        '/api/planet/{planet_id}/moon/{moon_id}': {
                            rename: { param: { moon_id: 'id' } },
                            op: {
                                load: { method: 'GET' },
                                remove: { method: 'DELETE' },
                                update: { method: 'PUT' }
                            }
                        }
                    },
                    name: 'moon'
                },
                planet: {
                    path: {
                        '/api/planet': {
                            op: {
                                create: { method: 'POST' },
                                list: { method: 'GET' }
                            }
                        },
                        '/api/planet/{planet_id}': {
                            rename: { param: { planet_id: 'id' } },
                            op: {
                                load: { method: 'GET' },
                                remove: { method: 'DELETE' },
                                update: { method: 'PUT' }
                            }
                        }
                    },
                    name: 'planet'
                }
            },
            metrics: { count: { entity: 2, path: 4, method: 10 } }
        };
        (0, code_1.expect)(bres.guide).contains(matchGuide);
    });
    (0, node_test_1.test)('full-solar', async () => {
        const outprefix = 'solar-1.0.0-openapi-3.0.0-';
        const folder = __dirname + '/../test/solar';
        const build = await __1.ApiDef.makeBuild({
            folder,
            debug: 'debug',
            outprefix,
            why: {
                show: false
            }
        });
        const modelSrcQ = `
# apidef test: ${outprefix}

name: solar

@"@voxgig/apidef/model/apidef.jsonic"

def: '${outprefix}def.yaml'
`;
        const modelSrc = `
# apidef test: ${outprefix}

@"@voxgig/apidef/model/apidef.jsonic"

name: solar

def: '${outprefix}def.yaml'

`;
        // const model = Aontu(modelSrc).gen()
        const modelinit = aontu.generate(modelSrc);
        const buildspec = {
            spec: {
                base: __dirname + '/../test/solar'
            }
        };
        const bres = await build(modelinit, buildspec, {});
        console.log(bres.ok);
        const model = aontu.generate(`@"test/solar/solar.jsonic"`);
        console.dir(model, { depth: null });
        // const baseGuideSrc = bres.ctx.note.guide.base
        // console.log(baseGuideSrc)
        /*
        if (baseGuideSrc !== SOLAR_GUIDE_BASE) {
          const difflines = Diff.diffLines(baseGuideSrc, SOLAR_GUIDE_BASE)
          console.log(difflines)
          expect(bres.ctx.note.guide.base).equal(SOLAR_GUIDE_BASE)
        }
        */
        /*
            const rootSrc = `
        @"@voxgig/apidef/model/apidef.jsonic"
        
        # @"${outprefix}guide.jsonic"
        
        @"api/${outprefix}api-def.jsonic"
        @"api/${outprefix}api-entity-index.jsonic"
        @"flow/${outprefix}flow-index.jsonic"
        
        `
        
            const rootFile = folder + `/${outprefix}root.jsonic`
            Fs.writeFileSync(rootFile, rootSrc)
        
            //const result = Aontu(rootSrc, {
            const result = aontu.generate(rootSrc, {
              path: rootFile,
              // base: folder
            }).gen()
        
            Fs.writeFileSync(folder + `/${outprefix}root.json`, JSON.stringify(result, null, 2))
        */
    });
});
/*
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

}`

*/
//# sourceMappingURL=apidef.test.js.map
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
const __1 = require("../");
// TODO: remove all sdk refs or rename to api
const aontu = new aontu_1.Aontu({ fs: Fs });
(0, node_test_1.describe)('apidef', () => {
    (0, node_test_1.test)('exist', async () => {
        (0, code_1.expect)(__1.ApiDef).exist();
    });
    (0, node_test_1.test)('guide-solar', async () => {
        const outprefix = 'solar-1.0.0-openapi-3.0.0-';
        const folder = __dirname + '/../test/solar';
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
                base: __dirname + '/../test/solar',
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
        (0, code_1.expect)(bres.guide).contains(SOLAR_GUIDE);
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
        // console.log(bres.ok)
        (0, code_1.expect)(bres.ok).true();
        const model = aontu.generate(`@"test/solar/solar.jsonic"`, {
            base: __dirname + '/..'
        });
        console.dir(model, { depth: null });
        (0, code_1.expect)(model).includes(SOLAR_MODEL);
    });
});
const SOLAR_GUIDE = {
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
                },
                '/api/planet/{planet_id}/forbid': {
                    action: { forbid: {} },
                    rename: { param: { planet_id: 'id' } },
                    op: { create: { method: 'POST' } }
                },
                '/api/planet/{planet_id}/terraform': {
                    action: { terraform: {} },
                    rename: { param: { planet_id: 'id' } },
                    op: { create: { method: 'POST' } }
                }
            },
            name: 'planet'
        }
    },
    metrics: { count: { entity: 2, path: 6, method: 12 } }
};
const SOLAR_MODEL = {
    main: {
        kit: {
            entity: {
                moon: {
                    alias: { field: {} },
                    fields: [
                        {
                            name: 'diameter',
                            req: false,
                            type: '`$NUMBER`',
                            active: true
                        },
                        { name: 'id', req: false, type: '`$STRING`', active: true },
                        {
                            name: 'kind',
                            req: false,
                            type: '`$STRING`',
                            active: true
                        },
                        {
                            name: 'name',
                            req: false,
                            type: '`$STRING`',
                            active: true
                        },
                        {
                            name: 'planet_id',
                            req: false,
                            type: '`$STRING`',
                            active: true
                        }
                    ],
                    id: { field: 'id', name: 'id' },
                    name: 'moon',
                    op: {
                        create: {
                            alts: [
                                {
                                    args: {
                                        param: [
                                            {
                                                kind: 'param',
                                                name: 'planet_id',
                                                req: true,
                                                type: '`$STRING`',
                                                active: true
                                            }
                                        ]
                                    },
                                    method: 'POST',
                                    orig: '/api/planet/{planet_id}/moon',
                                    parts: ['api', 'planet', '{planet_id}', 'moon'],
                                    select: { exist: ['planet_id'] },
                                    active: true,
                                    relations: []
                                }
                            ],
                            name: 'create'
                        },
                        list: {
                            alts: [
                                {
                                    args: {
                                        param: [
                                            {
                                                kind: 'param',
                                                name: 'planet_id',
                                                req: true,
                                                type: '`$STRING`',
                                                active: true
                                            }
                                        ]
                                    },
                                    method: 'GET',
                                    orig: '/api/planet/{planet_id}/moon',
                                    parts: ['api', 'planet', '{planet_id}', 'moon'],
                                    select: { exist: ['planet_id'] },
                                    active: true,
                                    relations: []
                                }
                            ],
                            name: 'list'
                        },
                        load: {
                            alts: [
                                {
                                    args: {
                                        param: [
                                            {
                                                kind: 'param',
                                                name: 'planet_id',
                                                req: true,
                                                type: '`$STRING`',
                                                active: true
                                            }
                                        ]
                                    },
                                    method: 'GET',
                                    orig: '/api/planet/{planet_id}/moon/{moon_id}',
                                    parts: ['api', 'planet', '{planet_id}', 'moon', '{id}'],
                                    select: { exist: ['planet_id'] },
                                    active: true,
                                    relations: []
                                }
                            ],
                            name: 'load'
                        },
                        update: {
                            alts: [
                                {
                                    args: {
                                        param: [
                                            {
                                                kind: 'param',
                                                name: 'planet_id',
                                                req: true,
                                                type: '`$STRING`',
                                                active: true
                                            }
                                        ]
                                    },
                                    method: 'PUT',
                                    orig: '/api/planet/{planet_id}/moon/{moon_id}',
                                    parts: ['api', 'planet', '{planet_id}', 'moon', '{id}'],
                                    select: { exist: ['planet_id'] },
                                    active: true,
                                    relations: []
                                }
                            ],
                            name: 'update'
                        }
                    },
                    relations: { ancestors: [['planet']] },
                    active: true
                },
                planet: {
                    alias: { field: {} },
                    fields: [
                        {
                            name: 'diameter',
                            req: false,
                            type: '`$NUMBER`',
                            active: true
                        },
                        {
                            name: 'forbid',
                            req: false,
                            type: '`$BOOLEAN`',
                            active: true
                        },
                        { name: 'id', req: false, type: '`$STRING`', active: true },
                        {
                            name: 'kind',
                            req: false,
                            type: '`$STRING`',
                            active: true
                        },
                        {
                            name: 'name',
                            req: false,
                            type: '`$STRING`',
                            active: true
                        },
                        {
                            name: 'ok',
                            req: false,
                            type: '`$BOOLEAN`',
                            active: true
                        },
                        {
                            name: 'start',
                            req: false,
                            type: '`$BOOLEAN`',
                            active: true
                        },
                        {
                            name: 'state',
                            req: false,
                            type: '`$STRING`',
                            active: true
                        },
                        {
                            name: 'stop',
                            req: false,
                            type: '`$BOOLEAN`',
                            active: true
                        },
                        {
                            name: 'why',
                            req: false,
                            type: '`$STRING`',
                            active: true
                        }
                    ],
                    id: { field: 'id', name: 'id' },
                    name: 'planet',
                    op: {
                        create: {
                            alts: [
                                {
                                    args: {
                                        param: [
                                            {
                                                kind: 'param',
                                                name: 'planet_id',
                                                req: true,
                                                type: '`$STRING`',
                                                active: true
                                            }
                                        ]
                                    },
                                    method: 'POST',
                                    orig: '/api/planet/{planet_id}/forbid',
                                    parts: ['api', 'planet', '{id}', 'forbid'],
                                    select: { '$action': 'forbid', exist: ['planet_id'] },
                                    active: true,
                                    relations: []
                                },
                                {
                                    args: {
                                        param: [
                                            {
                                                kind: 'param',
                                                name: 'planet_id',
                                                req: true,
                                                type: '`$STRING`',
                                                active: true
                                            }
                                        ]
                                    },
                                    method: 'POST',
                                    orig: '/api/planet/{planet_id}/terraform',
                                    parts: ['api', 'planet', '{id}', 'terraform'],
                                    select: { '$action': 'terraform', exist: ['planet_id'] },
                                    active: true,
                                    relations: []
                                },
                                {
                                    method: 'POST',
                                    orig: '/api/planet',
                                    parts: ['api', 'planet'],
                                    active: true,
                                    args: { param: [] },
                                    relations: [],
                                    select: {}
                                },
                            ],
                            name: 'create'
                        },
                        list: {
                            alts: [
                                {
                                    method: 'GET',
                                    orig: '/api/planet',
                                    parts: ['api', 'planet'],
                                    active: true,
                                    args: { param: [] },
                                    relations: [],
                                    select: {}
                                }
                            ],
                            name: 'list'
                        },
                        load: {
                            alts: [
                                {
                                    args: {
                                        param: [
                                            {
                                                kind: 'param',
                                                name: 'planet_id',
                                                req: true,
                                                type: '`$STRING`',
                                                active: true
                                            }
                                        ]
                                    },
                                    method: 'GET',
                                    orig: '/api/planet/{planet_id}',
                                    parts: ['api', 'planet', '{id}'],
                                    select: { exist: ['planet_id'] },
                                    active: true,
                                    relations: []
                                }
                            ],
                            name: 'load'
                        },
                        update: {
                            alts: [
                                {
                                    args: {
                                        param: [
                                            {
                                                kind: 'param',
                                                name: 'planet_id',
                                                req: true,
                                                type: '`$STRING`',
                                                active: true
                                            }
                                        ]
                                    },
                                    method: 'PUT',
                                    orig: '/api/planet/{planet_id}',
                                    parts: ['api', 'planet', '{id}'],
                                    select: { exist: ['planet_id'] },
                                    active: true,
                                    relations: []
                                }
                            ],
                            name: 'update'
                        }
                    },
                    active: true
                }
            },
            flow: {
                BasicMoonFlow: {
                    name: 'BasicMoonFlow',
                    active: true,
                    param: {
                        SOLAR_TEST_MOON_ENTID: { moon01: 'MOON01', moon02: 'MOON02', moon03: 'MOON03' },
                        SOLAR_TEST_LIVE: 'FALSE',
                        SOLAR_TEST_EXPLAIN: 'FALSE'
                    },
                    test: {
                        entity: {
                            moon: {
                                MOON01: {
                                    diameter: 's0',
                                    id: 'MOON01',
                                    kind: 's2',
                                    name: 's3',
                                    planet_id: 's4'
                                },
                                MOON02: {
                                    diameter: 's32',
                                    id: 'MOON02',
                                    kind: 's34',
                                    name: 's35',
                                    planet_id: 's36'
                                },
                                MOON03: {
                                    diameter: 's64',
                                    id: 'MOON03',
                                    kind: 's66',
                                    name: 's67',
                                    planet_id: 's68'
                                }
                            }
                        }
                    },
                    step: [
                        {
                            name: 'load_moon0',
                            kind: 'entity',
                            entity: 'moon',
                            action: 'load',
                            match: { id: '`dm$=p.SOLAR_TEST_MOON_ENTID.moon01`' },
                            valid: { '`$OPEN`': true, id: '`dm$=s.load_moon0.match.id`' }
                        },
                        {
                            name: 'update_moon1',
                            ref: 'load_moon0',
                            action: 'update',
                            reqdata: {},
                            valid: { '`$OPEN`': true, id: '`dm$=s.load_moon0.match.id`' }
                        },
                        {
                            name: 'load_moon2',
                            kind: 'entity',
                            entity: 'moon',
                            action: 'load',
                            match: { id: '`dm$=p.SOLAR_TEST_MOON_ENTID.moon01`' },
                            valid: { '`$OPEN`': true, id: '`dm$=s.load_moon0.match.id`' }
                        }
                    ],
                    setp: []
                },
                BasicPlanetFlow: {
                    name: 'BasicPlanetFlow',
                    active: true,
                    param: {
                        SOLAR_TEST_PLANET_ENTID: {
                            planet01: 'PLANET01',
                            planet02: 'PLANET02',
                            planet03: 'PLANET03'
                        },
                        SOLAR_TEST_LIVE: 'FALSE',
                        SOLAR_TEST_EXPLAIN: 'FALSE'
                    },
                    test: {
                        entity: {
                            planet: {
                                PLANET01: {
                                    diameter: 's0',
                                    forbid: 's1',
                                    id: 'PLANET01',
                                    kind: 's3',
                                    name: 's4',
                                    ok: 's5',
                                    start: 's6',
                                    state: 's7',
                                    stop: 's8',
                                    why: 's9'
                                },
                                PLANET02: {
                                    diameter: 's64',
                                    forbid: 's65',
                                    id: 'PLANET02',
                                    kind: 's67',
                                    name: 's68',
                                    ok: 's69',
                                    start: 's6a',
                                    state: 's6b',
                                    stop: 's6c',
                                    why: 's6d'
                                },
                                PLANET03: {
                                    diameter: 'sc8',
                                    forbid: 'sc9',
                                    id: 'PLANET03',
                                    kind: 'scb',
                                    name: 'scc',
                                    ok: 'scd',
                                    start: 'sce',
                                    state: 'scf',
                                    stop: 'sd0',
                                    why: 'sd1'
                                }
                            }
                        }
                    },
                    step: [
                        {
                            name: 'load_planet0',
                            kind: 'entity',
                            entity: 'planet',
                            action: 'load',
                            match: { id: '`dm$=p.SOLAR_TEST_PLANET_ENTID.planet01`' },
                            valid: { '`$OPEN`': true, id: '`dm$=s.load_planet0.match.id`' }
                        },
                        {
                            name: 'update_planet1',
                            ref: 'load_planet0',
                            action: 'update',
                            reqdata: {},
                            valid: { '`$OPEN`': true, id: '`dm$=s.load_planet0.match.id`' }
                        },
                        {
                            name: 'load_planet2',
                            kind: 'entity',
                            entity: 'planet',
                            action: 'load',
                            match: { id: '`dm$=p.SOLAR_TEST_PLANET_ENTID.planet01`' },
                            valid: { '`$OPEN`': true, id: '`dm$=s.load_planet0.match.id`' }
                        }
                    ],
                    setp: []
                }
            },
            info: {}
        },
        info: { title: 'Solar System API', version: '1.0.0' }
    }
};
//# sourceMappingURL=apidef.test.js.map
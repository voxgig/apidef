/* Copyright (c) 2024 Voxgig Ltd, MIT License */

import * as Fs from 'node:fs'

import { test, describe } from 'node:test'
import { expect } from '@hapi/code'

import { Aontu } from 'aontu'

import * as Diff from 'diff'


import {
  ApiDef
} from '../'


// TODO: remove all sdk refs or rename to api


const aontu = new Aontu({ fs: Fs })


describe('apidef', () => {

  test('exist', async () => {
    expect(ApiDef).exist()
  })


  test('guide-solar', async () => {
    const outprefix = 'solar-1.0.0-openapi-3.0.0-'
    const folder = __dirname + '/../test/solar'

    const build = await ApiDef.makeBuild({
      folder,
      debug: 'debug',
      outprefix,
    })

    const bres = await build(
      {
        name: 'solar',
        def: outprefix + 'def.yaml'
      },
      {
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
      },
      {}
    )

    // console.dir(bres.guide, { depth: null })

    expect(bres.guide).contains(SOLAR_GUIDE)
  })



  test('full-solar', async () => {
    const outprefix = 'solar-1.0.0-openapi-3.0.0-'
    const folder = __dirname + '/../test/solar'

    const build = await ApiDef.makeBuild({
      folder,
      debug: 'debug',
      outprefix,
      why: {
        show: false
      }
    })

    const modelSrcQ = `
# apidef test: ${outprefix}

name: solar

@"@voxgig/apidef/model/apidef.jsonic"

def: '${outprefix}def.yaml'
`

    const modelSrc = `
# apidef test: ${outprefix}

@"@voxgig/apidef/model/apidef.jsonic"

name: solar

def: '${outprefix}def.yaml'

`


    // const model = Aontu(modelSrc).gen()
    const modelinit = aontu.generate(modelSrc)

    const buildspec = {
      spec: {
        base: __dirname + '/../test/solar'
      }
    }

    const bres = await build(modelinit, buildspec, {})
    // console.log(bres.ok)
    expect(bres.ok).true()

    const model = aontu.generate(`@"test/solar/solar.jsonic"`, {
      base: __dirname + '/..'
    })
    console.dir(model, { depth: null })

    expect(model).includes(SOLAR_MODEL)
  })


})




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
}


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
}


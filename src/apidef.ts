/* Copyright (c) 2024-2025 Voxgig, MIT License */

import * as Fs from 'node:fs'
import Path from 'node:path'
import { inspect } from 'node:util'

// import { bundleFromString, createConfig } from '@redocly/openapi-core'
// import { Gubu, Open, Any } from 'gubu'
import { each } from 'jostraca'
import { prettyPino } from '@voxgig/util'


import type {
  ApiDefOptions,
  Model,
  Build,
  ApiModel,
} from './types'

import {
  OpenModelShape,
  OpenBuildShape,
} from './types'


import {
  parse
} from './parse'


import {
  resolveTransforms,
  processTransforms,
  fixName,
} from './transform'


import {
  generateModel,
} from './generate'


import {
  writeChanged
} from './utility'



function ApiDef(opts: ApiDefOptions) {
  const fs = opts.fs || Fs
  const pino = prettyPino('apidef', opts)
  const log = pino.child({ cmp: 'apidef' })


  async function generate(spec: any) {
    const start = Date.now()

    const model: Model = OpenModelShape(spec.model)
    const build: Build = OpenBuildShape(spec.build)

    const buildspec = build.spec

    let defpath = model.def

    // TOOD: defpath should be independently defined
    defpath = Path.join(buildspec.base, '..', 'def', defpath)

    log.info({
      point: 'generate-start',
      note: defpath.replace(process.cwd(), '.'), defpath, start
    })

    // TODO: Validate spec
    const ctx = {
      log,
      spec,
      opts,
      util: { fixName },
      defpath: Path.dirname(defpath),
      model,
    }


    // resolve guide here


    const transformSpec = await resolveTransforms(ctx)

    log.debug({
      point: 'transform', spec: transformSpec,
      note: log.levelVal <= 20 ? inspect(transformSpec) : ''
    })


    let source
    try {
      source = fs.readFileSync(defpath, 'utf8')
    }
    catch (err: any) {
      log.error({ read: 'fail', what: 'def', file: defpath, err })
      throw err
    }

    const def = await parse('OpenAPI', source, { file: defpath })

    const apimodel: ApiModel = {
      main: {
        api: {
          entity: {}
        },
        def: {},
      },
    }

    const processResult = await processTransforms(ctx, transformSpec, apimodel, def)

    if (!processResult.ok) {
      log.error({
        fail: 'process', point: 'transform-result',
        result: processResult, note: processResult.msg,
        err: processResult.results[0]?.err
      })

      return { ok: false, name: 'apidef', processResult }
    }



    // const modelPath = Path.normalize(spec.config.model)

    generateModel(apimodel, spec, opts, { fs, log })


    log.info({ point: 'generate-end', note: 'success', break: true })

    return {
      ok: true,
      name: 'apidef',
      apimodel,
    }
  }





  return {
    generate,
  }
}



ApiDef.makeBuild = async function(opts: ApiDefOptions) {
  let apidef: any = undefined

  const outprefix = null == opts.outprefix ? '' : opts.outprefix

  const config = {
    def: opts.def || 'no-def',
    kind: 'openapi3',
    model: opts.folder ?
      (opts.folder + '/' + outprefix + 'api-generated.jsonic') : 'no-model',
    meta: opts.meta || {},
  }

  const build = async function(model: any, build: any, ctx: any) {

    if (null == apidef) {
      apidef = ApiDef({
        ...opts,
        pino: build.log,
      })
    }

    return await apidef.generate({ model, build, config })
  }

  build.step = 'pre'

  return build
}






export type {
  ApiDefOptions,
}


export {
  ApiDef,
  parse,
}

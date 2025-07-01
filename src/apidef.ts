/* Copyright (c) 2024-2025 Voxgig, MIT License */

import * as Fs from 'node:fs'
import Path from 'node:path'
import { inspect } from 'node:util'

import { Jostraca, Project, names } from 'jostraca'

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
  resolveGuide,
} from './guide'


import {
  parse
} from './parse'


import {
  fixName,
} from './transform'



import {
  resolveElements
} from './resolver'

import {
  loadFile,
} from './utility'


import { topTransform } from './transform/top'
import { entityTransform } from './transform/entity'
import { operationTransform } from './transform/operation'
import { fieldTransform } from './transform/field'

import { makeEntityBuilder } from './builder/entity'
import { makeFlowBuilder } from './builder/flow'


function ApiDef(opts: ApiDefOptions) {

  // TODO: gubu opts!
  const fs = opts.fs || Fs
  const pino = prettyPino('apidef', opts)
  const log = pino.child({ cmp: 'apidef' })

  opts.strategy = opts.strategy || 'heuristic01'


  async function generate(spec: any) {
    const start = Date.now()

    // console.log('APIDEF GENERATE')
    // console.dir(spec, { depth: null })

    const model: Model = OpenModelShape(spec.model)
    const build: Build = OpenBuildShape(spec.build)

    names(model, model.name)

    const apimodel: ApiModel = {
      main: {
        api: {
          entity: {}
        },
        def: {},
      },
    }

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
      fs,
      log,
      spec,
      opts,
      util: { fixName },
      defpath: Path.dirname(defpath),
      model,
      apimodel,
      def: undefined
    }

    const defsrc = loadFile(defpath, 'def', fs, log)

    const def = await parse('OpenAPI', defsrc, { file: defpath })
    ctx.def = def

    const guideBuilder = await resolveGuide(ctx)


    // const transformSpec = await resolveTransforms(ctx)
    const transforms = await resolveElements(ctx, 'transform', 'openapi', {
      top: topTransform,
      entity: entityTransform,
      operation: operationTransform,
      field: fieldTransform,
    })

    const builders = await resolveElements(ctx, 'builder', 'standard', {
      entity: makeEntityBuilder,
      flow: makeFlowBuilder,
    })


    const jostraca = Jostraca({
      now: spec.now,
      fs: () => fs,
      log,
    })

    const jmodel = {}

    const root = () => Project({ folder: '.' }, async () => {
      guideBuilder()
      // entityBuilder()
      // flowBuilder()

      for (let builder of builders) {
        builder()
      }
    })

    const jres = await jostraca.generate({
      // folder: Path.dirname(opts.folder as string),
      folder: opts.folder,
      model: jmodel,
      existing: { txt: { merge: true } }
    }, root)

    // console.log('JRES', jres)

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

  // const outprefix = null == opts.outprefix ? '' : opts.outprefix

  const config = {
    def: opts.def || 'no-def',
    kind: 'openapi3',
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

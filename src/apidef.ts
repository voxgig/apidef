/* Copyright (c) 2024-2025 Voxgig, MIT License */


import * as Fs from 'node:fs'
import Path from 'node:path'


import {
  Jostraca, JostracaResult, Project, names
} from 'jostraca'

import { prettyPino } from '@voxgig/util'

import decircular from 'decircular'


import type {
  ApiDefOptions,
  ApiDefResult,
  Control,
  Model,
  Build,
  ApiModel,
} from './types'


import {
  KIT,

  OpenModelShape,
  OpenBuildShape,
  OpenControlShape,
  ApiDefContext,
} from './types'


import {
  buildGuide,
} from './guide/guide'


import {
  parse,
} from './parse'


import {
  fixName,
} from './transform'



import {
  resolveElements
} from './resolver'

import {
  loadFile,
  getdlog,
  makeWarner,
  formatJSONIC,
  writeFileSyncWarn,
} from './utility'


import { topTransform } from './transform/top'
import { entityTransform } from './transform/entity'
import { operationTransform } from './transform/operation'
import { argsTransform } from './transform/args'
import { selectTransform } from './transform/select'
import { fieldTransform } from './transform/field'
import { cleanTransform } from './transform/clean'

import { makeEntityBuilder } from './builder/entity'
import { makeFlowBuilder } from './builder/flow'

// Log non-fatal wierdness.
const dlog = getdlog('apidef', __filename)


function ApiDef(opts: ApiDefOptions) {

  // TODO: gubu opts!
  const fs = opts.fs || Fs
  const pino = prettyPino('apidef', opts)
  const log = pino.child({ cmp: 'apidef' })
  const warn = makeWarner({ point: 'warning', log })

  opts.strategy = opts.strategy || 'heuristic01'

  async function generate(spec: any): Promise<ApiDefResult> {
    const start = Date.now()
    const steps: string[] = []

    let ctx: ApiDefContext | undefined = undefined
    let ctrl: Control | undefined = undefined
    let jres: JostracaResult | undefined = undefined

    try {
      ctrl = OpenControlShape(spec.ctrl || {}) as Control

      const model: Model = OpenModelShape(spec.model || {})
      const build: Build = OpenBuildShape(spec.build || {})

      // Step: parse (API spec).
      if (!ctrl.step.parse) {
        return { ok: true, steps, start, end: Date.now(), ctrl }
      }

      names(model, model.name)

      const apimodel: ApiModel = {
        main: {
          api: {},
          [KIT]: {
            info: {},
            entity: {},
            flow: {},
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
        note: defpath.replace(process.cwd(), '.'),
        defpath,
        start
      })

      // TODO: Validate spec
      ctx = {
        fs,
        log,
        spec,
        opts,
        util: { fixName },
        defpath: Path.dirname(defpath),
        model,
        apimodel,
        guide: {},
        def: undefined,
        note: {},
        warn,

        // TODO: remove (moved to guide)
        metrics: {
          count: {
            path: 0,
            method: 0,
            origcmprefs: {},
            cmp: 0,
            tag: 0,
            entity: 0,
          },
          found: {
            cmp: {},
            tag: {}
          }
        },

        work: {}
      }

      const defsrc = loadFile(defpath, 'def', fs, log)

      const def = await parse('OpenAPI', defsrc, { file: defpath })
      const defkeys = Object.keys(def)

      log.info({
        point: 'root-keys',
        defpath,
        note: defkeys.join(', ')
      })

      const safedef = decircular(def)
      const fullsrc = JSON.stringify(safedef, null, 2)

      fs.writeFileSync(defpath + '.full.json', fullsrc)

      ctx.def = safedef

      steps.push('parse')

      // Step: guide (derive).
      if (!ctrl.step.guide) {
        return { ok: false, steps, start, end: Date.now(), ctrl }
      }

      const guideModel = await buildGuide(ctx)
      if (null == guideModel) {
        throw new Error('Unable to build guide.')
      }

      ctx.guide = guideModel.guide

      steps.push('guide')


      // Step: transformers (transform spec and guide into core structures).
      if (!ctrl.step.transformers) {
        return { ok: true, steps, start, end: Date.now(), ctrl, guide: ctx.guide }
      }


      /*
      const transres = await resolveElements(ctx, 'transform', 'openapi', {
        top: topTransform,
        entity: entityTransform,
        operation: operationTransform,
        args: argsTransform,
        field: fieldTransform,
        clean: cleanTransform,
      })
      */

      // const transformResult = await runTransform(ctx)
      // if (null == transformResult) {
      //   throw new Error('Unable to run Transform.')
      // }

      await topTransform(ctx)
      await entityTransform(ctx)
      await operationTransform(ctx)
      await argsTransform(ctx)
      await selectTransform(ctx)
      await fieldTransform(ctx)
      await cleanTransform(ctx)


      steps.push('transformers')

      // Step: builders (build generated sub models).
      if (!ctrl.step.builders) {
        return { ok: true, steps, start, end: Date.now(), ctrl, guide: ctx.guide }
      }

      const builders = [
        await makeEntityBuilder(ctx),

        // TODO: move to sdkgen
        await makeFlowBuilder(ctx),
      ]

      steps.push('builders')


      // Step: generate (generate model files).
      if (!ctrl.step.generate) {
        return { ok: true, steps, start, end: Date.now(), ctrl, guide: ctx.guide }
      }

      const jostraca = Jostraca({
        now: spec.now,
        fs: () => fs,
        log,
      })

      const jmodel = {}

      const root = () => Project({ folder: '.' }, async () => {
        for (let builder of builders) {
          builder()
        }
      })

      jres = await jostraca.generate({
        // folder: Path.dirname(opts.folder as string),
        folder: opts.folder,
        model: jmodel,
        existing: { txt: { merge: true } }
      }, root)

      const dlogs = dlog.log()
      if (0 < dlogs.length) {
        for (let dlogentry of dlogs) {
          log.debug({ point: 'generate-debug', dlogentry, note: String(dlogentry) })
        }
      }

      steps.push('generate')

      const hasWarnings = 0 < warn.history.length
      const endnote =
        hasWarnings ? `PARTIAL BUILD! There were ${warn.history.length} warnings (see above).` :
          'success'
      log[hasWarnings ? 'warn' : 'info']({ point: 'generate-end', note: endnote, break: true })

      if (hasWarnings) {
        writeFileSyncWarn(warn, fs, './apidef-warnings.txt',
          warn.history.map(n => formatJSONIC(n)).join('\n\n'))
      }

      return {
        ok: true,
        err: null,
        start,
        end: Date.now(),
        steps,
        ctrl,
        guide: ctx.guide,
        apimodel: ctx.apimodel,
        ctx,
        jres,
      }
    }
    catch (err: any) {
      const endnote = '!! BUILD FAILED !! ' + err.message
      log.error({ point: 'generate-end', err, note: endnote, break: true })

      warn.history.push({
        point: warn.point,
        when: Date.now(),
        err,
        note: endnote
      })

      writeFileSyncWarn(warn, fs, './apidef-warnings.txt',
        warn.history.map(n => formatJSONIC(n)).join('\n\n'))

      return {
        ok: false,
        err,
        start,
        end: Date.now(),
        steps,
        ctrl,
        guide: ctx?.guide,
        apimodel: ctx?.apimodel,
        ctx,
        jres,
      }
    }
  }

  return {
    generate,
  }
}


ApiDef.makeBuild = async function(opts: ApiDefOptions) {
  let apidef: any = undefined

  const config = {
    def: opts.def || 'no-def',
    kind: 'openapi3',
    meta: opts.meta || {},
  }

  const build = async function(model: any, build: any, ctx: any) {

    if (null == apidef) {
      apidef = ApiDef({
        def: opts.def,
        fs: opts.fs,
        debug: opts.debug,
        folder: opts.folder,
        meta: opts.meta,
        outprefix: opts.outprefix,
        strategy: opts.strategy,
        pino: build.log,
        why: opts.why,
      })
    }

    const ctrl = build.spec.buildargs?.apidef?.ctrl || {}

    return await apidef.generate({ model, build, config, ctrl })
  }

  build.step = 'pre'

  return build
}






export type {
  ApiDefOptions,
}

export type {
  PathDef,
  MethodDef,
  ServerDef,
  ServerVariableDef,
  ParameterDef,
  SchemaDef,
} from './def'

export type {
  CmpDesc,
  BasicMethodDesc,
  MethodDesc,
  MethodEntityDesc,
  EntityDesc,
  EntityPathDesc,
  PathDesc,
  OpDesc,
} from './desc'

export type {
  OpName,
  ModelEntityRelations,
  ModelOpMap,
  ModelFieldOp,
  ModelField,
  ModelArg,
  ModelAlt,
  ModelOp,
  ModelEntity,
} from './model'


export {
  ApiDef,
  parse,
  formatJSONIC,
}

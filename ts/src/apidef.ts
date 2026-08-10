/* Copyright (c) 2024-2025 Voxgig, MIT License */


import * as Fs from 'node:fs'
import Path from 'node:path'


import {
  Jostraca, JostracaResult, Project, names
} from 'jostraca'

import { prettyPino } from '@voxgig/util'


import type {
  ApiDefOptions,
  ApiDefResult,
  Control,
  DefKind,
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
  nom,
  loadFile,
  getdlog,
  makeWarner,
  formatJSONIC,
  depluralize,
  setCustomPlurals,
  clearCustomPlurals,
  sanitizeSlug,
  slugToPascalCase,
  writeFileSyncWarn,
  relativizePath,
  getModelPath,
  VALID_CANON,
  CANON_ONE,
} from './utility'


import { topTransform } from './transform/top'
import { entityTransform } from './transform/entity'
import { operationTransform } from './transform/operation'
import { graphqlTransform } from './transform/graphql'
import { argsTransform } from './transform/args'
import { selectTransform } from './transform/select'
import { fieldTransform } from './transform/field'
import { flowTransform } from './transform/flow'
import { flowstepTransform } from './transform/flowstep'
import { cleanTransform } from './transform/clean'

import { makeEntityBuilder } from './builder/entity'
import { gcEntityFiles } from './builder/entity/entity'
import { makeFlowBuilder } from './builder/flow'

// Log non-fatal wierdness.
const dlog = getdlog('apidef', __filename)


function ApiDef(opts: ApiDefOptions) {

  // TODO: shape opts!
  const fs = opts.fs || Fs
  const pino = prettyPino('apidef', opts)
  const log = pino.child({ cmp: 'apidef' })
  const warn = makeWarner({ point: 'warning', log })

  // Input format: explicit option wins, else sniff from the def file name.
  // A GraphQL build defaults to the graphql01 guide strategy.
  opts.kind = opts.kind || resolveKind(opts.def)
  opts.strategy = opts.strategy ||
    ('GraphQL' === opts.kind ? 'graphql01' : 'heuristic01')

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

      // Install per-model plural overrides for depluralize/canonize.
      // Read from model.main.custom.plurals; downstream transforms
      // and the guide pick this up implicitly via the utility module.
      setCustomPlurals((model as any)?.main?.custom?.plurals)

      const apimodel: ApiModel = {
        main: {
          [KIT]: {
            info: {},
            entity: {},
            flow: {},
          },
        },
      }

      const buildspec = build.spec

      let defpath = model.def

      // TOOD: defpath should be independently defined
      defpath = Path.join(buildspec.base, '..', 'def', defpath)

      log.info({
        point: 'generate-start',
        note: relativizePath(defpath),
        defpath,
        start
      })

      // TODO: Validate spec
      ctx = {
        fs,
        fsInjected: null != opts.fs,
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

      const def = await parse(opts.kind as string, defsrc, {
        file: defpath,
        // GraphQL-only inputs; ignored by the OpenAPI parser.
        graphql: {
          endpoint: opts.endpoint,
          title: model.name,
          version: (model.main as any)?.[KIT]?.info?.version,
        },
      } as any)
      const defkeys = Object.keys(def)

      log.info({
        point: 'root-keys',
        defpath,
        note: defkeys.join(', ')
      })

      // Only write the full JSON debug file when debug mode is enabled,
      // as JSON.stringify + sync write is expensive for large specs.
      if (opts.debug) {
        const fullsrc = JSON.stringify(def, null, 2)
        fs.writeFileSync(defpath + '.full.json', fullsrc)
      }

      ctx.def = def

      steps.push('parse')

      // Step: guide (derive).
      if (!ctrl.step.guide) {
        return { ok: false, steps, start, end: Date.now(), ctrl, ctx }
      }

      const guideModel = await buildGuide(ctx)
      if (null == guideModel) {
        throw new Error('Unable to build guide.')
      }

      ctx.guide = guideModel.guide

      steps.push('guide')



      // Step: transformers (transform spec and guide into core structures).
      // Early stops return the model built so far: `ctrl.step.generate = false`
      // is the documented way to build the model in memory without writing
      // files (see AGENTS.md), which requires `apimodel` in the result. The Go
      // port already returns it from every early return.
      if (!ctrl.step.transformers) {
        return {
          ok: true, steps, start, end: Date.now(), ctrl,
          guide: ctx.guide, apimodel: ctx.apimodel, ctx
        }
      }

      await topTransform(ctx)
      await entityTransform(ctx)
      await operationTransform(ctx)
      // Must precede args and field: both branch on point.kind === 'graphql'
      // and read the graphql block this stamps on.
      await graphqlTransform(ctx)
      await argsTransform(ctx)
      await selectTransform(ctx)
      await fieldTransform(ctx)
      await flowTransform(ctx)
      await flowstepTransform(ctx)
      await cleanTransform(ctx)

      steps.push('transformers')

      // Step: builders (build generated sub models).
      if (!ctrl.step.builders) {
        return {
          ok: true, steps, start, end: Date.now(), ctrl,
          guide: ctx.guide, apimodel: ctx.apimodel, ctx
        }
      }

      const builders = [
        await makeEntityBuilder(ctx),

        // TODO: move to sdkgen
        await makeFlowBuilder(ctx),
      ]

      steps.push('builders')


      // Step: generate (generate model files).
      if (!ctrl.step.generate) {
        return {
          ok: true, steps, start, end: Date.now(), ctrl,
          guide: ctx.guide, apimodel: ctx.apimodel, ctx
        }
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
        // Overwrite the generated model source (.aontu) rather than 3-way merge:
        // merging against a drifting .jostraca base silently keeps stale files
        // and can inject <<<<<<< conflict markers. Generated output is
        // model-derived and never hand-edited. See sdkgen
        // docs/explanation/regeneration-overwrite.md.
        existing: { txt: { write: true, merge: false } }
      }, root)

      const dlogs = dlog.log()
      if (0 < dlogs.length) {
        for (let dlogentry of dlogs) {
          log.debug({ point: 'generate-debug', dlogentry, note: String(dlogentry) })
        }
      }

      steps.push('generate')

      // Garbage-collect entity model files no longer derived from the def.
      // The builders only ever WRITE: a spec change that removes or renames a
      // derived entity used to leave the old <name>.aontu behind forever.
      // Runs after generate so the current set is on disk; guarded so only
      // apidef-generated files under this build's outprefix are touched.
      try {
        const kitEntity = (ctx.apimodel?.main as any)?.[KIT]?.entity || {}
        gcEntityFiles(fs, log, opts.folder as string, opts.outprefix,
          Object.keys(kitEntity))
      }
      catch (err: any) {
        log.warn({ point: 'entity-gc-failed', err, note: String(err?.message) })
      }

      const hasWarnings = 0 < warn.history.length
      const endnote =
        hasWarnings ? `PARTIAL BUILD! There were ${warn.history.length} warnings (see above).` :
          'success'
      log[hasWarnings ? 'warn' : 'info']({ point: 'generate-end', note: endnote, break: true })

      if (hasWarnings) {
        writeFileSyncWarn(warn, fs, './apidef-warnings.txt',
          warn.history.map(n => formatJSONIC(n)).join('\n\n'))
      }

      // apidef writes model source files (entity, flow, guide aontu files) into
      // .sdk/model/. Downstream actions (sdkgen, etc.) read those via
      // sdk.aontu @-includes, so voxgig-model has to re-resolve the model
      // before the post-step actions run. Signal reload whenever jostraca
      // wrote or merged any files; if nothing changed on disk,
      // voxgig-model's resolveModel cache short-circuits the re-read.
      const jfiles = jres?.files
      const reload = !!jfiles && (
        (jfiles.written?.length ?? 0) > 0 ||
        (jfiles.merged?.length ?? 0) > 0
      )

      return {
        ok: true,
        reload,
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
    finally {
      // Drop the per-model overrides so a subsequent generate() in
      // the same process starts with a clean utility module.
      clearCustomPlurals()
    }
  }

  return {
    generate,
  }
}


// Sniff the input format from the definition file name. GraphQL schemas use
// .graphql/.graphqls/.gql; an explicit `kind` option always wins. Introspection
// JSON must be named .graphql.json (or declared) since a bare .json could be
// either format.
function resolveKind(def?: string): DefKind {
  const name = String(def ?? '').toLowerCase()
  if (name.endsWith('.graphql') || name.endsWith('.graphqls') ||
    name.endsWith('.gql') || name.endsWith('.graphql.json')) {
    return 'GraphQL'
  }
  return 'OpenAPI'
}


ApiDef.makeBuild = async function(opts: ApiDefOptions) {
  let apidef: any = undefined

  const kind = opts.kind || resolveKind(opts.def)

  const config = {
    def: opts.def || 'no-def',
    kind: 'GraphQL' === kind ? 'graphql' : 'openapi3',
    meta: opts.meta || {},
  }

  const build = async function(model: any, build: any, _ctx: any) {

    if (null == apidef) {
      apidef = ApiDef({
        def: opts.def,
        fs: opts.fs,
        debug: opts.debug,
        folder: opts.folder,
        meta: opts.meta,
        outprefix: opts.outprefix,
        strategy: opts.strategy,
        kind,
        endpoint: opts.endpoint,
        auth: opts.auth,
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
  ArgKind,
  NamesCluster,
  ModelEntityRelations,
  ModelOpMap,
  ModelFieldOp,
  ModelField,
  ModelArg,
  ModelPoint,
  ModelOp,
  ModelEntity,
  Model,
  ModelEntityFlow,
  ModelEntityFlowStep,
  ModelEntityFlowStepInput,
  ModelEntityFlowStepValidator,
  ModelEntityFlowStepSpec,
} from './model'


export {
  KIT,
  ApiDef,
  gcEntityFiles,
  parse,
  formatJSONIC,
  depluralize,
  sanitizeSlug,
  slugToPascalCase,
  getModelPath,
  nom,
  VALID_CANON,
  CANON_ONE,
}

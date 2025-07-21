
import Path from 'node:path'

import { File, Content, each } from 'jostraca'

import { merge } from '@voxgig/struct'


import { heuristic01 } from './guide/heuristic01'

import {
  getdlog,
} from './utility'


// Log non-fatal wierdness.
const dlog = getdlog('apidef', __filename)

async function resolveGuide(ctx: any) {
  let baseguide: Record<string, any> = {}
  let override: Record<string, any> = ctx.model.main.api.guide

  if ('heuristic01' === ctx.opts.strategy) {
    baseguide = await heuristic01(ctx)
  }
  else {
    throw new Error('Unknown guide strategy: ' + ctx.opts.strategy)
  }

  // Override generated base guide with custom hints 
  let guide = merge([{}, baseguide, override])

  // TODO: this is a hack!!!
  // Instead, update @voxgig/model, so that builders can request a reload of the entire
  // model. This allows builders to modify the model for later buidlers
  // during a single generation pass.


  guide = cleanGuide(guide)


  // TODO: FIX: sdk.jsonic should have final version of guide
  if (ctx.model.main?.api) {
    ctx.model.main.api.guide = guide
  }
  else {
    dlog('missing', 'ctx.model.main.api')
  }

  const guideFile =
    Path.join(ctx.opts.folder,
      (null == ctx.opts.outprefix ? '' : ctx.opts.outprefix) + 'base-guide.jsonic')

  const guideBlocks = [
    '# Guide',
    '',
    'main: api: guide: { ',

  ]


  guideBlocks.push(...each(baseguide.entity, (entity, entityname) => {
    guideBlocks.push(`
entity: ${entityname}: {`)

    each(entity.path, (path, pathname) => {
      guideBlocks.push(`  path: '${pathname}': op: {`)

      each(path.op, (op, opname) => {
        guideBlocks.push(`    '${opname}': method: ${op.method}`)
        if (op.transform?.reqform) {
          guideBlocks.push(
            `    '${opname}': transform: reqform: ${JSON.stringify(op.transform.reqform)}`)
        }
      })

      guideBlocks.push(`  }`)
    })

    guideBlocks.push(`}`)
  }))

  guideBlocks.push('}')

  const guideSrc = guideBlocks.join('\n')

  return () => {
    // Save base guide for reference
    File({ name: '../def/' + Path.basename(guideFile) }, () => Content(guideSrc))
  }
}


function cleanGuide(guide: Record<string, any>): Record<string, any> {
  const clean: Record<string, any> = {
    control: guide.control,
    entity: {}
  }

  const exclude_entity = guide.exclude?.entity?.split(',') || []
  const include_entity = guide.include?.entity?.split(',') || []

  each(guide.entity, (entity: any, name: string) => {
    if (exclude_entity.includes(name)) {
      return
    }
    if (exclude_entity.includes('*')) {
      if (!include_entity.includes(name)) {
        return
      }
    }

    let ent: any = clean.entity[name] = clean.entity[name] = { name, path: {} }

    each(entity.path, (path: any, pathname: string) => {
      ent.path[pathname] = path
    })
  })

  return clean
}


export {
  resolveGuide
}


import Path from 'node:path'

import { Jostraca, Project, names, File, Content, each } from 'jostraca'

import { Aontu, Val, Nil, Context } from 'aontu'


import { items } from '@voxgig/struct'


import { heuristic01 } from './heuristic01'

import {
  getdlog,
} from '../utility'


// Log non-fatal wierdness.
const dlog = getdlog('apidef', __filename)


async function buildGuide(ctx: any): Promise<any> {
  const errs: any[] = []

  // console.log(ctx)
  const folder = Path.resolve(ctx.opts.folder)
  // console.log('GUIDE folder', folder)

  try {
    const basejres = await buildBaseGuide(ctx)
  }
  catch (err: any) {
    errs.push(err)
  }

  handleErrors(ctx, errs)

  let src = ''
  let guidePath = Path.join(folder, 'guide',
    (null == ctx.opts.outprefix ? '' : ctx.opts.outprefix) + 'guide.jsonic')

  try {
    src = ctx.fs.readFileSync(guidePath, 'utf8')
  }
  catch (err: any) {
    errs.push(err)
  }

  handleErrors(ctx, errs)


  const opts = {
    path: guidePath
  }

  const guideRoot = Aontu(src, opts)
  errs.push(...guideRoot.err)

  handleErrors(ctx, errs)


  let genctx = new Context({ root: guideRoot })
  const guideModel = guideRoot.gen(genctx)

  errs.push(...genctx.err)

  handleErrors(ctx, errs)

  return guideModel
}


function handleErrors(ctx: any, errs: any[]) {
  if (0 < errs.length) {
    let topmsg: string[] = []
    for (let err of errs) {
      topmsg.push((err?.message?.split('\n')[0]) || '')
      ctx.log.error({ err })
    }
    throw new Error('SUMMARY: ' + topmsg.join('; '))
  }
}


async function buildBaseGuide(ctx: any) {
  let baseguide: Record<string, any> = {}

  if ('heuristic01' === ctx.opts.strategy) {
    baseguide = await heuristic01(ctx)
  }
  else {
    throw new Error('Unknown guide strategy: ' + ctx.opts.strategy)
  }

  const guideBlocks = [
    '# Guide',
    '',
    'guide: {',
  ]


  items(baseguide.entity).map(([entityname, entity]: any[]) => {
    guideBlocks.push(`
  entity: ${entityname}: {` +
      (0 < entity.why_name.length ? ' # name:' + entity.why_name.join(';') : ''))

    items(entity.path).map(([pathname, path]: any[]) => {
      guideBlocks.push(`    path: '${pathname}': op: {` +
        (0 < path.why_ent.length ? ' # ent:' + path.why_ent.join(';') : ''))

      items(path.op).map(([opname, op]: any[]) => {
        guideBlocks.push(`      '${opname}': method: ${op.method}` +
          (0 < op.why_op.length ? ' # ' + op.why_op : ''))
        if (op.transform?.reqform) {
          guideBlocks.push(
            `      '${opname}': transform: reqform: ${JSON.stringify(op.transform.reqform)}`)
        }
      })

      guideBlocks.push(`    }`)
    })

    guideBlocks.push(`  }`)
  })

  guideBlocks.push('', '}')

  const guideSrc = guideBlocks.join('\n')

  ctx.note.guide = { base: guideSrc }

  const baseGuideFileName =
    (null == ctx.opts.outprefix ? '' : ctx.opts.outprefix) + 'base-guide.jsonic'

  const jostraca = Jostraca({
    folder: ctx.opts.folder + '/guide',
    now: ctx.spec.now,
    fs: () => ctx.fs,
    log: ctx.log,
  })

  const root = () => Project({ folder: '.' }, async () => {
    File({ name: baseGuideFileName }, () => Content(guideSrc))
  })

  const jres = await jostraca.generate({
    existing: { txt: { merge: true } }
  }, root)

  return jres
}


/*
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
    'main: api: guide: {',
  ]


  guideBlocks.push(...each(baseguide.entity, (entity, entityname) => {
    guideBlocks.push(`
entity: ${entityname}: {` +
      (0 < entity.why_name.length ? ' # name:' + entity.why_name.join(';') : ''))

    items(entity.path).map((pathn) => {
      const [pathname, path] = pathn
      guideBlocks.push(`  path: '${pathname}': op: {` +
        (0 < path.why_ent.length ? ' # ent:' + path.why_ent.join(';') : ''))

      items(path.op).map((opn) => {
        const [opname, op] = opn
        guideBlocks.push(`    '${opname}': method: ${op.method}` +
          (0 < op.why_op.length ? ' # ' + op.why_op : ''))
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

  ctx.note.guide = { base: guideSrc }

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

    let ent: any = clean.entity[name] = clean.entity[name] = {
      name,
      why_name: entity.why_name || [],
      path: {}
    }

    each(entity.path, (path: any, pathname: string) => {
      ent.path[pathname] = path
    })
  })

  return clean
}
*/


export {
  buildGuide
}

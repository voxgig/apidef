
import Path from 'node:path'

import { Jostraca, Project, names, File, Content, each } from 'jostraca'

import { Aontu, Val, Nil, Context } from 'aontu'


import { items, isempty } from '@voxgig/struct'

import decircular from 'decircular'

import { heuristic01 } from './heuristic01'

import {
  getdlog,
} from '../utility'


// Log non-fatal wierdness.
const dlog = getdlog('apidef', __filename)


async function buildGuide(ctx: any): Promise<any> {
  // console.log('Circular-buildGuide')
  // console.log(JSON.stringify(decircular(ctx.def), null, 2))


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

  // console.dir(baseguide, { depth: null })

  const guideBlocks = [
    '# Guide',
    '',
    'guide: {',
  ]

  const metrics = baseguide.metrics
  const epr = (metrics.count.entity / metrics.count.path).toFixed(3)

  ctx.log.info({
    point: 'metrics',
    metrics,
    note: `epr=${epr}  (entity=${metrics.count.entity} paths=${metrics.count.path} )`
  })

  validateBaseBuide(ctx, baseguide)

  items(baseguide.entity).map(([entityname, entity]: any[]) => {
    guideBlocks.push(`
  entity: ${entityname}: {` +
      (0 < entity.why_name?.length ? '  # name:' + entity.why_name.join(';') : ''))

    items(entity.path).map(([pathstr, path]: any[]) => {
      guideBlocks.push(`    path: '${pathstr}': {` +
        (0 < path.why_path?.length ? '  # ent:' + path.why_path.join(';') : ''))

      if (!isempty(path.rename?.param)) {
        items(path.rename.param).map(([psrc, ptgt]: any[]) => {
          guideBlocks.push(`      rename: param: ${psrc}: *"${ptgt}"|string` +
            (0 < path.rename_why.param_why?.[psrc]?.length ?
              '  # ' + path.rename_why.param_why[psrc].join(';') : ''))
        })
      }

      items(path.op).map(([opname, op]: any[]) => {
        guideBlocks.push(`      op: ${opname}: method: *"${op.method}"|string` +
          (0 < op.why_op.length ? '  # ' + op.why_op : ''))
        if (op.transform?.reqform) {
          guideBlocks.push(
            `      ${opname}: transform: reqform: ${JSON.stringify(op.transform.reqform)}`)
        }
      })

      guideBlocks.push(`    }`)
    })

    guideBlocks.push(`  }`)
  })

  guideBlocks.push('', '}')

  const guideSrc = guideBlocks.join('\n')

  // console.log(guideSrc)

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



function validateBaseBuide(ctx: any, baseguide: any) {
  const srcm: any = {}

  // Each orig path.
  each(ctx.def.paths, (pdef: any) => {
    const pathStr = pdef.key$

    // Each orig method.
    each(pdef, (mdef: any) => {
      if (mdef.key$.match(/^get|post|put|patch|delete$/i)) {
        let key = pathStr + ' ' + mdef.key$.toUpperCase()
        let desc = (srcm[key] = (srcm[key] || { c: 0 }))
        desc.c++
      }
    })
  })

  // console.log('DEFPM', defpm)

  const genm: any = {}

  // Each entity.
  each(baseguide.entity, (edef: any) => {

    // Each path.
    each(edef.path, (pdef, pathStr) => {

      // Each op.
      each(pdef.op, (odef) => {
        let key = pathStr + ' ' + odef.method
        let desc = (genm[key] = (genm[key] || { c: 0 }))
        desc.c++
      })
    })
  })

  const srcp = Object.keys(srcm).sort()
    .reduce((a, k) => (a.push(k + ':c=' + srcm[k].c), a), [] as string[])

  const genp = Object.keys(genm).sort()
    .reduce((a, k) => (a.push(k + ':c=' + genm[k].c), a), [] as string[])

  // Check that all paths have been assigned to entities.
  if (srcp.join(';') !== genp.join(';')) {
    console.log('     ', 'SRC-PATH'.padEnd(60, ' '), 'GEN-PATH')
    for (let i = 0; i < srcp.length || i < genp.length; i++) {
      let srcps = srcp[i]
      let genps = genp[i]
      let prefix = '     '
      if (srcps !== genps) {
        prefix = ' *** '
      }
      console.log(prefix, srcps.padEnd(60, ' '), genps)
    }
    throw new Error('PATH MISMATCH')
  }
}


export {
  buildGuide
}

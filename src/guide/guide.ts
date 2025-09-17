

import Path from 'node:path'

import { Jostraca, Project, File, Content, each } from 'jostraca'

import { Aontu, Context } from 'aontu'


import { items, isempty } from '@voxgig/struct'


import { heuristic01 } from './heuristic01'


import {
  ApiDefContext
} from '../types'


import {
  getdlog,
} from '../utility'


// Log non-fatal wierdness.
const dlog = getdlog('apidef', __filename)


async function buildGuide(ctx: ApiDefContext): Promise<any> {
  const errs: any[] = []

  const folder = Path.resolve(ctx.opts.folder)

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
    path: guidePath,
    fs: ctx.fs,
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


async function buildBaseGuide(ctx: ApiDefContext) {
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

  const metrics = baseguide.metrics
  const epr = (metrics.count.entity / metrics.count.path).toFixed(3)

  ctx.log.info({
    point: 'metrics',
    metrics,
    note: `epr=${epr}  (entity=${metrics.count.entity} paths=${metrics.count.path} )`
  })

  validateBaseBuide(ctx, baseguide)

  const sw = (s: string) => ctx.opts.why?.show ? s : ''

  items(baseguide.entity).map(([entname, entity]: any[]) => {
    guideBlocks.push(`
  entity: ${entname}: {` +
      sw(0 < entity.why_name?.length ? '  # name:' + entity.why_name.join(';') : ''))

    items(entity.path).map(([pathstr, path]: any[]) => {
      if (pathstr === process.env.npm_config_apipath) {
        console.log('BASE-GUIDE', entname, pathstr)
        console.dir(path, { depth: null })
      }

      guideBlocks.push(`    path: '${pathstr}': {` +
        sw(0 < path.why_path?.length ?
          '  # ent:' + entname + ':' + path.why_path.join(';') : ''))

      if (!isempty(path.action)) {
        items(path.action).map(([actname, actdesc]: any[]) => {
          guideBlocks.push(`      action: "${actname}": kind: *"${actdesc.kind}"|top` +
            sw(0 < path.action_why[actname]?.length ?
              '  # ' + path.action_why[actname].join(';') : ''))
        })
      }

      if (!isempty(path.rename?.param)) {
        items(path.rename.param).map(([psrc, ptgt]: any[]) => {
          guideBlocks.push(`      rename: param: "${psrc}": *"${ptgt}"|string` +
            sw(0 < path.rename_why.param_why?.[psrc]?.length ?
              '  # ' + path.rename_why.param_why[psrc].join(';') : ''))
        })
      }

      items(path.op).map(([opname, op]: any[]) => {
        guideBlocks.push(`      op: ${opname}: method: *"${op.method}"|string` +
          sw(0 < op.why_op.length ? '  # ' + op.why_op : ''))
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

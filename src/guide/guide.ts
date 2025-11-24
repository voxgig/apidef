

import Path from 'node:path'

import { Jostraca, Project, File, Content, each } from 'jostraca'

import { Aontu } from 'aontu'

import { items, isempty } from '@voxgig/struct'


import { heuristic01 } from './heuristic01'


import {
  ApiDefContext,

  Guide,
  GuideMetrics,
  GuideEntity,
  GuidePath,
  GuidePathAction,
  GuideRenameParam,
  GuidePathOp,
} from '../types'


import {
  // GuideEntity,
  // GuidePath,
} from '../transform/top'


import {
  getdlog,
  debugpath,
  formatJSONIC,
} from '../utility'


// Log non-fatal wierdness.
const dlog = getdlog('apidef', __filename)

const aontu = new Aontu()








async function buildGuide(ctx: ApiDefContext): Promise<any> {
  const log = ctx.log
  const errs: any[] = []

  const folder = Path.resolve(ctx.opts.folder)

  try {
    const basejres = await buildBaseGuide(ctx)
  }
  catch (err: any) {
    console.log(err)
    errs.push(err)
  }

  handleErrors(ctx, errs)

  let src = ''
  let guidepath = Path.join(folder, 'guide',
    (null == ctx.opts.outprefix ? '' : ctx.opts.outprefix) + 'guide.jsonic')

  log.info({
    point: 'generate-guide',
    note: guidepath.replace(process.cwd(), '.'),
    guidepath,
  })


  try {
    src = ctx.fs.readFileSync(guidepath, 'utf8')
  }
  catch (err: any) {
    errs.push(err)
  }

  handleErrors(ctx, errs)


  if (0 === errs.length) {

    const opts = {
      path: guidepath,
      fs: ctx.fs,
      errs,
    }

    const guideModel = aontu.generate(src, opts)
    // console.log('GUIDE-MODEL', guideModel, errs)

    // console.dir(guideModel, { depth: null })

    handleErrors(ctx, errs)

    return guideModel

  }
}


function handleErrors(ctx: any, errs: any[]) {
  if (0 < errs.length) {
    const topmsg: string[] = []
    for (let err of errs) {
      err = err instanceof Error ? err :
        err.err instanceof Error ? err.err :
          Array.isArray(err.err) && null != err.err[0] ? err.err[0] :
            err

      const msg =
        'string' === typeof err?.message ? err.message :
          err instanceof Error ? err.message : '' + err

      topmsg.push(msg)
    }
    const summary: any = new Error(`SUMMARY (${errs.length} errors): ` + topmsg.join(' | '))
    ctx.log.error(summary)
    summary.errs = () => errs
    throw summary
  }
}





async function buildBaseGuide(ctx: ApiDefContext) {
  let baseguide: Guide

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

  // TODO: these should influence the IS_ENTCMP_METHOD_RATE etc. values
  const epr =
    0 < metrics.count.path ? (metrics.count.entity / metrics.count.path).toFixed(3) : -1
  const emr =
    0 < metrics.count.method ? (metrics.count.entity / metrics.count.method).toFixed(3) : -1

  ctx.log.info({
    point: 'metrics',
    metrics,
    note: `epr=${epr}  emr=${emr}  ` +
      `(entity=${metrics.count.entity} ` +
      `paths=${metrics.count.path} methods=${metrics.count.method})`
  })

  validateBaseBuide(ctx, baseguide)

  const sw = (s: string) => ctx.opts.why?.show ? s : ''
  const qs = (v: any) => JSON.stringify(v)
  const qt = (v: any) => '(' + qs(v) + ')'

  guideBlocks.push(`  metrics: count: entity: ${metrics.count.entity}
  metrics: count: path: ${metrics.count.path}
  metrics: count: method: ${metrics.count.method}`)

  // NOTE: items(...) sorts the iteration elements, so the generated model code
  // is deterministic.

  items(baseguide.entity).map(([entname, entity]: [string, GuideEntity]) => {

    guideBlocks.push(`
  entity: ${entname}: {`
      // sw(0 < entity.why_name.length ? '  # name:' + entity.why_name.join(';') : '')
    )

    // NOTE: items(...) sorts the paths
    items(entity.path).map(([pathstr, path]: [string, GuidePath]) => {
      debugpath(pathstr, null, 'BASE-GUIDE', entname, pathstr,
        formatJSONIC(path, { hsepd: 0, $: true, color: true }))

      guideBlocks.push(`    path: ${qs(pathstr)}: {` +
        sw(0 < path.why_path.length ?
          '  # ent:' + entname + ';' + path.why_path.join(';') : ''))

      if (!isempty(path.action)) {
        items(path.action).map(([actname, actdesc]: [string, GuidePathAction]) => {
          guideBlocks.push(`      action: ${qs(actname)}: {}` +
            sw(0 < actdesc.why_action.length ?
              '  # ' + actdesc.why_action.join(';') : ''))
        })
      }

      if (!isempty(path.rename?.param)) {
        items(path.rename.param).map(([psrc, rp]: [string, GuideRenameParam]) => {
          guideBlocks.push(`      rename: param: ${qs(psrc)}: *${qs(rp.target)}` +
            sw(0 < rp.why_rename.length ?
              '  # ' + rp.why_rename.join(';') : ''))
        })
      }

      items(path.op).map(([opname, op]: [string, GuidePathOp]) => {
        guideBlocks.push(`      op: ${opname}: method: *${op.method}` +
          sw(0 < op.why_op.length ? '  # ' + op.why_op : ''))
        if (null != op.transform.req) {
          guideBlocks.push(
            // `      op: ${opname}: transform: res: *${qt(op.transform.res)}|top`)
            `      op: ${opname}: transform: res: *${qt(op.transform.res)}|top`)
        }
        if (null != op.transform.res) {
          guideBlocks.push(
            // `      op: ${opname}: transform: res: *${qt(op.transform.res)}|top`)
            `      op: ${opname}: transform: res: *${qt(op.transform.res)}|top`)
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




function validateBaseBuide(ctx: ApiDefContext, baseguide: any) {
  const srcm: any = {}

  // Each orig path.
  each(ctx.def.paths, (pdef: any) => {
    const pathStr = pdef.key$

    // Each orig method.
    each(pdef, (mdef: any) => {
      if (mdef.key$.match(/^get|post|put|patch|delete|head|options$/i)) {
        let key = pathStr + ' ' + mdef.key$.toUpperCase()
        let desc = (srcm[key] = (srcm[key] || { c: 0 }))
        desc.c++
      }
    })
  })

  const genm: any = {}

  // Each entity.
  each(baseguide.entity, (entm: GuideEntity) => {

    if (isempty(entm.path)) {
      ctx.warn({
        note: `No paths defined for entity=${entm.name}`,
        entm,
      })
    }

    // Each path.
    each(entm.path, (pathm: GuidePath, pathStr) => {

      if (isempty(pathm.op)) {
        ctx.warn({
          note: `No operations defined for entity=${entm.name} path=${pathStr}`,
          path: pathStr,
          entm,
          pathm,
        })
      }

      // Each op.
      each(pathm.op, (odef) => {
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
    for (let i = 0, j = 0; i < srcp.length || j < genp.length; i++, j++) {
      let srcps = srcp[i]
      let genps = genp[j]
      let prefix = '     '
      if (srcps !== genps) {
        prefix = ' *** '

        if (srcps === genp[j + 1]) {
          j++
        }
        else if (genps === srcp[i + 1]) {
          i++
        }
      }
      console.log(prefix, srcps.padEnd(60, ' '), genps)
    }
    throw new Error('PATH MISMATCH')
  }
}


export {
  buildGuide
}

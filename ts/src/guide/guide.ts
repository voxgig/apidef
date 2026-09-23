

import Path from 'node:path'

import { Jostraca, Project, File, Content, each } from 'jostraca'

import { Aontu } from 'aontu'

import { items, isempty } from '@voxgig/struct'


import { heuristic01 } from './heuristic01'
import { graphql01 } from './graphql01'


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
  getdlog,
  debugpath,
  debugpathOn,
  formatJSONIC,
  relativizePath,
} from '../utility'


const KONSOLE_LOG = console['log']


// Log non-fatal wierdness.
const dlog = getdlog('apidef', __filename)

const aontu = new Aontu()




function migrateGuideIncludes(src: string, guideprefix: string): string {
  let migrated = src
    .replace(/@"@voxgig\/apidef\/model\/guide\.aon"/g,
      '@"@voxgig/apidef/model/guide.aontu"')

  // The sibling include is written bare or with `./`; both name this file.
  for (const dir of ['', './']) {
    migrated = migrated
      .split('@"' + dir + guideprefix + 'base-guide.aon"')
      .join('@"' + dir + guideprefix + 'base-guide.aontu"')
  }

  return migrated
}


// aontu refuses a bare sibling include, so it gains the `./` it needs.
function prefixGuideInclude(src: string, guideprefix: string): string {
  return src
    .split('@"' + guideprefix + 'base-guide.aontu"')
    .join('@"./' + guideprefix + 'base-guide.aontu"')
}


// A `.aon` entry file is unresolvable: aontu reads only `.aontu` as source.
// So this renames AND rewrites both includes — a repair, not a convenience.
function migrateLegacyGuide(fs: any, folder: string, guideprefix: string): boolean {
  const guidepath = Path.join(folder, 'guide', guideprefix + 'guide.aontu')
  const legacyguide = Path.join(folder, 'guide', guideprefix + 'guide.aon')

  if (fs.existsSync(guidepath) || !fs.existsSync(legacyguide)) {
    return false
  }

  fs.writeFileSync(guidepath,
    migrateGuideIncludes(String(fs.readFileSync(legacyguide, 'utf8')), guideprefix))
  try { fs.unlinkSync(legacyguide) } catch (_err: any) { }

  return true
}


// A `.aontu` entry file may still include a `.aon` sibling, so the rename
// above never fires for it while its include still names an absent file.
function migrateLegacyGuideInclude(
  fs: any, guidepath: string, guideprefix: string
): boolean {
  return rewriteGuide(fs, guidepath, (src) => migrateGuideIncludes(src, guideprefix))
}


function migrateGuideIncludePrefix(
  fs: any, guidepath: string, guideprefix: string
): boolean {
  return rewriteGuide(fs, guidepath, (src) => prefixGuideInclude(src, guideprefix))
}


function rewriteGuide(
  fs: any, guidepath: string, rewrite: (src: string) => string
): boolean {
  if (!fs.existsSync(guidepath)) {
    return false
  }

  const src = String(fs.readFileSync(guidepath, 'utf8'))
  const migrated = rewrite(src)

  if (migrated === src) {
    return false
  }

  fs.writeFileSync(guidepath, migrated)

  return true
}




function findConflict(src: string): { line: number, text: string } | null {
  const lines = String(src || '').split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^(<{7}|>{7})(?!<|>)/.test(line) || /^={7}(?!=)\s*$/.test(line)) {
      return { line: i + 1, text: line.slice(0, 80) }
    }
  }

  return null
}


async function buildGuide(ctx: ApiDefContext): Promise<any> {
  const log = ctx.log
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
  const guideprefix = null == ctx.opts.outprefix ? '' : ctx.opts.outprefix
  let guidepath = Path.join(folder, 'guide', guideprefix + 'guide.aontu')

  if (migrateLegacyGuide(ctx.fs, folder, guideprefix)) {
    log.info({ point: 'migrate-guide', note: 'guide.aon -> guide.aontu' })
  }

  if (migrateLegacyGuideInclude(ctx.fs, guidepath, guideprefix)) {
    log.info({
      point: 'migrate-guide-include',
      note: 'base-guide.aon -> base-guide.aontu'
    })
  }

  if (migrateGuideIncludePrefix(ctx.fs, guidepath, guideprefix)) {
    log.info({
      point: 'migrate-guide-prefix',
      note: 'base-guide.aontu -> ./base-guide.aontu'
    })
  }

  log.info({
    point: 'generate-guide',
    note: relativizePath(guidepath),
    guidepath,
  })


  try {
    src = ctx.fs.readFileSync(guidepath, 'utf8')
  }
  catch (err: any) {
    errs.push(err)
  }

  handleErrors(ctx, errs)

  const basepath = Path.join(folder, 'guide', guideprefix + 'base-guide.aontu')
  for (const checkpath of [guidepath, basepath]) {
    let checksrc = ''
    try {
      checksrc = checkpath === guidepath ? src : String(ctx.fs.readFileSync(checkpath, 'utf8'))
    }
    catch (_err: any) {
      continue
    }

    const conflict = findConflict(checksrc)
    if (null != conflict) {
      errs.push(new Error(
        `@voxgig/apidef: guide: unresolved merge conflict at ${
          relativizePath(checkpath)}:${conflict.line}\n` +
        `  ${conflict.text}\n` +
        `A guide is merged, not overwritten, so an edit the regenerated base\n` +
        `guide contradicts is left for a human to settle. Resolve the marked\n` +
        `block` +
        // DELETING ONLY HELPS FOR THE BASE GUIDE. Regeneration rewrites that
        // file, while the top-level entry guide is the user's own and is read
        // back unchanged — so advising its deletion would send a reader in a
        // circle, failing this same check on the next build.
        (checkpath === basepath ?
          `, or delete ${guideprefix}base-guide.aontu to regenerate it from the\n` +
          `specification and re-apply the edit afterwards.` :
          ` in ${relativizePath(checkpath)}.`)))
      break
    }
  }

  handleErrors(ctx, errs)




  if (0 === errs.length) {

    const opts: any = {
      path: guidepath,
      errs,
    }

    if (ctx.fsInjected) {
      opts.fs = ctx.fs
    }

    ctx.work.guideAontuFs = undefined !== opts.fs

    const guideModel = aontu.generate(src, opts)

    handleErrors(ctx, errs)

    return guideModel

  }
}


function handleErrors(ctx: any, errs: any[]) {
  if (0 < errs.length) {
    const topmsg: string[] = []
    const stacks: string[] = []
    for (let err of errs) {
      err = err instanceof Error ? err :
        err.err instanceof Error ? err.err :
          Array.isArray(err.err) && null != err.err[0] ? err.err[0] :
            err

      const msg =
        'string' === typeof err?.message ? err.message :
          err instanceof Error ? err.message : '' + err

      topmsg.push(msg)

      stacks.push('' + err.stack)
    }
    const summary: any = new Error(`SUMMARY (${errs.length} errors): ` + topmsg.join(' | '))
    summary.stack = stacks.join('\n')
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
  else if ('graphql01' === ctx.opts.strategy) {
    baseguide = await graphql01(ctx)
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

  // Root-field count is GraphQL-only; omit it for REST guides so their
  // emitted base-guide files stay byte-identical.
  if (0 < (metrics.count.field ?? 0)) {
    guideBlocks.push(`  metrics: count: field: ${metrics.count.field}`)
  }

  // NOTE: items(...) sorts the iteration elements, so the generated model code
  // is deterministic.

  // Emit one guide entry. REST guides key entries by path, GraphQL guides by
  // schema root field (`branch`); the body is otherwise identical, so both
  // share this emitter. GraphQL ops carry `optype` ALONGSIDE `method: POST`,
  // which keeps every downstream transform that reads gop.method working
  // unchanged while recording the query/mutation distinction.
  const emitEntry = (
    branch: 'path' | 'field',
    entname: string,
    entity: GuideEntity,
    entrykey: string,
    path: GuidePath
  ) => {
    {
      if (debugpathOn()) {
        debugpath(entrykey, null, 'BASE-GUIDE', entname, entrykey,
          formatJSONIC(path, { hsepd: 0, $: true, color: true }))
      }

      guideBlocks.push(`    ${branch}: ${qs(entrykey)}: {` +
        sw(0 < path.why_path.length ?
          '  # ent=' + entname + ';' +
          (entity.orig !== entname && null != entity.orig ? 'orig=' + entity.orig + ';' : '') +
          path.why_path.join(';') : ''))

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
        if (null != op.optype) {
          guideBlocks.push(`      op: ${opname}: optype: *${op.optype}`)
        }
        if (null != op.transform.res) {
          guideBlocks.push(
            `      op: ${opname}: transform: res: *${qt(op.transform.res)}|top`)
        }
        const reqmap: any = op.transform.req
        if (null != reqmap && 'object' === typeof reqmap) {
          items(reqmap).map(([bodykey, source]: [string, any]) => {
            if ('string' === typeof source) {
              guideBlocks.push(`      op: ${opname}: transform: req: ` +
                `${qs(bodykey)}: *${qt(source)}|top`)
            }
          })
        }
      })

      guideBlocks.push(`    }`)
    }
  }

  items(baseguide.entity).map(([entname, entity]: [string, GuideEntity]) => {

    guideBlocks.push(`
  entity: ${entname}: {`)

    if (false === entity.active) {
      const why = (entity as any).why_inactive
      guideBlocks.push(
        `    # Deactivated by the heuristic` +
        (null == why ? '' : ` (${why})`) + `. Set` +
        ` \`active: true\` here in guide.aontu to generate it as an entity.`)
      guideBlocks.push(`    active: *false`)
    }

    // NOTE: items(...) sorts the entries, so output is deterministic.
    items(entity.path).map(([pathstr, path]: [string, GuidePath]) =>
      emitEntry('path', entname, entity, pathstr, path))

    items((entity as any).field).map(([fieldstr, path]: [string, GuidePath]) =>
      emitEntry('field', entname, entity, fieldstr, path))

    guideBlocks.push(`  }`)
  })

  guideBlocks.push('', '}')

  const guideSrc = guideBlocks.join('\n')


  ctx.note.guide = { base: guideSrc }

  const baseGuideFileName =
    (null == ctx.opts.outprefix ? '' : ctx.opts.outprefix) + 'base-guide.aontu'

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




function validateGraphqlBaseGuide(ctx: ApiDefContext, baseguide: any) {
  const covered: Record<string, boolean> = {}

  each(baseguide.entity, (entm: GuideEntity) => {
    each((entm as any).field, (fieldm: GuidePath, fieldStr: string) => {
      if (!isempty(fieldm.op)) {
        covered[fieldStr] = true
      }
    })
  })

  const uncovered: string[] = []
  for (const roots of [ctx.def?.query, ctx.def?.mutation]) {
    for (const fname of Object.keys(roots ?? {}).sort()) {
      if (!covered[fname]) {
        uncovered.push(fname)
      }
    }
  }

  // Unclassified root fields are expected (scalars like `version`, machinery
  // returns), so this is a warning rather than a hard failure — but it is
  // always reported, so a missed entity is visible.
  if (0 < uncovered.length) {
    ctx.warn({
      note: `GraphQL root fields not mapped to an entity op: ` +
        uncovered.join(', '),
      uncovered,
    })
  }

  ctx.log.info({
    point: 'graphql-coverage',
    note: `mapped=${Object.keys(covered).length} unmapped=${uncovered.length}`,
  })
}


function validateBaseBuide(ctx: ApiDefContext, baseguide: any) {
  // GraphQL guides key entries by root field, not path: the path-based
  // reconciliation below has nothing to compare.
  if (true === ctx.def?.graphql) {
    return validateGraphqlBaseGuide(ctx, baseguide)
  }

  const srcm: any = {}

  // Each orig path.
  each(ctx.def.paths, (pdef: any) => {
    const pathStr = pdef.key$

    // Each orig method.
    each(pdef, (mdef: any) => {
      if (mdef.key$.match(/^(get|post|put|patch|delete|head|options|query)$/i)) {
        let key = pathStr + ' ' + mdef.key$.toUpperCase()
        let desc = (srcm[key] = (srcm[key] || { c: 0 }))
        desc.c++
      }
    })
  })

  const genm: any = {}

  // Collect all paths that have ops under any entity.
  const coveredPaths: Record<string, boolean> = {}
  each(baseguide.entity, (entm: GuideEntity) => {
    each(entm.path, (pathm: GuidePath, pathStr) => {
      if (!isempty(pathm.op)) {
        coveredPaths[pathStr] = true
      }
    })
  })

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
        // Only warn if this path has no ops under any entity.
        // Paths covered elsewhere (e.g. as actions of another entity) are expected.
        if (!coveredPaths[pathStr]) {
          ctx.warn({
            note: `No operations defined for entity=${entm.name} path=${pathStr}`,
            path: pathStr,
            entm,
            pathm,
          })
        }
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
    KONSOLE_LOG('     ', 'SRC-PATH'.padEnd(60, ' '), 'GEN-PATH')
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
      KONSOLE_LOG(prefix, srcps.padEnd(60, ' '), genps)
    }
    throw new Error('PATH MISMATCH')
  }
}


export {
  migrateGuideIncludes,
  prefixGuideInclude,
  findConflict,
  migrateLegacyGuide,
  migrateGuideIncludePrefix,
  buildGuide
}

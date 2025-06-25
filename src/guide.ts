
import Path from 'node:path'

import { File, Content, each } from 'jostraca'


import { heuristic01 } from './guide/heuristic01'


async function resolveGuide(ctx: any) {
  // console.log('GUIDE CTX', ctx)

  let guide: Record<string, any> = ctx.model.main.api.guide

  if ('heuristic01' === ctx.opts.strategy) {
    guide = await heuristic01(ctx)
  }
  else {
    throw new Error('Unknown guide strategy: ' + ctx.opts.strategy)
  }

  guide = cleanGuide(guide)

  ctx.model.main.api.guide = guide

  const guideFile =
    Path.join(ctx.opts.folder,
      (null == ctx.opts.outprefix ? '' : ctx.opts.outprefix) + 'guide.jsonic')

  const guideBlocks = [
    '# Guide',
    '',
    'main: api: guide: { ',
    '',
  ]


  guideBlocks.push(...each(guide.entity, (entity, entityname) => {
    guideBlocks.push(`\nentity: ${entityname}: path: {`)

    each(entity.path, (path, pathname) => {
      guideBlocks.push(`  '${pathname}': op: {`)

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

  // console.log(guideSrc)

  return () => {
    File({ name: Path.basename(guideFile) }, () => Content(guideSrc))

  }
}


function cleanGuide(guide: Record<string, any>): Record<string, any> {
  const clean: Record<string, any> = {
    control: guide.control,
    entity: {}
  }

  each(guide.entity, (entity: any, name: string) => {
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

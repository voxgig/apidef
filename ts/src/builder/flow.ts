
// TODO: move this to sdkgen


import Path from 'node:path'

import { File, Content, Folder, each } from 'jostraca'


import {
  ApiDefContext,
  KIT,
} from '../types'


import {
  nom,
  formatJsonSrc,
} from '../utility'


import { flowHeuristic01 } from './flow/flowHeuristic01'


async function makeFlowBuilder(ctx: ApiDefContext): Promise<Function> {
  const { apimodel, opts } = ctx

  const flows = apimodel.main[KIT].flow

  let flowBuilder = () => {
    ctx.warn({
      step: 'flow',
      note: 'Unable to generate flow definitions as flows were not resolved.'
    })
  }

  /*
  if ('heuristic01' === ctx.opts.strategy) {
    try {
      flows = await flowHeuristic01(ctx)
    }
    catch (err: any) {
      err.foo = { x: 1, y: [2] }
      err.foo.z = err.foo
      ctx.warn({
        step: 'flow',
        note: 'Unable to resolve flows due to unexpected error: ' + err.message,
        err,
      })
      return flowBuilder
    }
  }
  else {
    ctx.warn({
      step: 'flow',
      note: 'Unable to resolve flows: unknown guide strategy: ' + ctx.opts.strategy
    })
    return flowBuilder
  }
  */

  flowBuilder = () => {

    Folder({ name: 'flow' }, () => {
      const barrel = [
        '# Flows\n'
      ]

      each(flows, (flow: any) => {
        let flowfile =
          Path.join(ctx.opts.folder, 'flow',
            (null == ctx.opts.outprefix ? '' : ctx.opts.outprefix) +
            flow.name + '.jsonic')

        let flowModelSrc = formatJsonSrc(JSON.stringify(flow, null, 2))

        let flowsrc = `# ${nom(flow, 'Name')}

main: ${KIT}: flow: ${flow.name}:
` + flowModelSrc

        barrel.push(`@"${Path.basename(flowfile)}"`)

        File({ name: Path.basename(flowfile) }, () => Content(flowsrc))
      })

      const barrelFile = (null == ctx.opts.outprefix ? '' : ctx.opts.outprefix) + 'flow-index.jsonic'

      const barrelContent = barrel.join('\n')

      File({ name: barrelFile }, () => Content(barrelContent))
    })
  }

  return flowBuilder
}



export {
  makeFlowBuilder
}

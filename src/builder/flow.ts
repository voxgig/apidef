
import Path from 'node:path'

import { File, Content, Folder, each } from 'jostraca'

import {
  formatJsonSrc,
} from '../utility'


import { flowHeuristic01 } from './flow/flowHeuristic01'


async function makeFlowBuilder(ctx: any) {
  let flows: any[] = []

  if ('heuristic01' === ctx.opts.strategy) {
    flows = await flowHeuristic01(ctx)
  }
  else {
    throw new Error('Unknown guide strategy: ' + ctx.opts.strategy)
  }

  return function flowBuilder() {

    Folder({ name: 'flow' }, () => {
      const barrel = [
        '# Flows\n'
      ]

      each(flows, (flow: any) => {
        let flowfile =
          Path.join(ctx.opts.folder, 'flow',
            (null == ctx.opts.outprefix ? '' : ctx.opts.outprefix) +
            flow.Name + '.jsonic')

        let flowModelSrc = formatJsonSrc(JSON.stringify(flow.model, null, 2))

        let flowsrc = `# ${flow.Name}

main: sdk: flow: ${flow.Name}:
` + flowModelSrc

        barrel.push(`@"${Path.basename(flowfile)}"`)

        File({ name: Path.basename(flowfile) }, () => Content(flowsrc))
      })

      File({
        name: (null == ctx.opts.outprefix ? '' : ctx.opts.outprefix) + 'flow-index.jsonic'
      }, () => Content(barrel.join('\n')))
    })
  }
}



export {
  makeFlowBuilder
}

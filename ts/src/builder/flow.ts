


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


  const flownames: string[] = []
  each(flows, (flow: any) => flownames.push(String(flow.name)))
  const filebase = flowFileBases(flownames)

  for (const name of flownames) {
    if (name !== filebase[name] && ctx.warn) {
      ctx.warn({
        step: 'flow',
        note: 'flow name ' + name + ' collides with another when case is' +
          ' ignored: file written as ' + filebase[name] + '.aon'
      })
    }
  }

  flowBuilder = () => {

    Folder({ name: 'flow' }, () => {
      const barrel = [
        '# Flows\n'
      ]

      each(flows, (flow: any) => {
        let flowfile =
          Path.join(ctx.opts.folder, 'flow',
            (null == ctx.opts.outprefix ? '' : ctx.opts.outprefix) +
            (filebase[flow.name] || flow.name) + '.aon')

        let flowModelSrc = formatJsonSrc(JSON.stringify(flow, null, 2))

        let flowsrc = `# ${nom(flow, 'Name')}

main: ${KIT}: flow: ${flow.name}:
` + flowModelSrc

        barrel.push(`@"./${Path.basename(flowfile)}"`)

        File({ name: Path.basename(flowfile) }, () => Content(flowsrc))
      })

      const barrelFile = (null == ctx.opts.outprefix ? '' : ctx.opts.outprefix) + 'flow-index.aon'

      const barrelContent = barrel.join('\n')

      File({ name: barrelFile }, () => Content(barrelContent))
    })
  }

  return flowBuilder
}



export {
  makeFlowBuilder,
  flowFileBases,
}


// Flow file base names, unique when case is ignored. Every member of a
// colliding group is suffixed in sorted-name order, so no member keeps the
// bare name and the result is the same on every run. Names that do not
// collide are returned unchanged.
function flowFileBases(names: string[]): { [name: string]: string } {
  const bylower: { [lower: string]: string[] } = {}
  for (const name of names) {
    const lower = name.toLowerCase()
    bylower[lower] = bylower[lower] || []
    bylower[lower].push(name)
  }

  const base: { [name: string]: string } = {}
  for (const lower of Object.keys(bylower)) {
    const group = bylower[lower].sort()
    if (1 === group.length) {
      base[group[0]] = group[0]
    }
    else {
      group.forEach((name, i) => (base[name] = name + '__' + (i + 1)))
    }
  }

  return base
}

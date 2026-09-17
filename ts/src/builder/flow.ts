
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

  // FLOW FILE NAMES MUST BE UNIQUE WHEN CASE IS IGNORED.
  //
  // The file name is the flow name, and flow names are camel case derived
  // from the entity name, so two entities whose names differ only in where
  // the underscores fall produce two flow names that differ only in case.
  // checkly's spec carries schemas `StaticIP` and `StaticIp`: apidef makes
  // the entities `static_i_p` and `static_ip`, and the flows
  // `BasicStaticIPFlow` and `BasicStaticIpFlow`.
  //
  // On a case-insensitive filesystem - APFS and NTFS, so macOS and Windows
  // by default - those are ONE file. The second write silently replaced the
  // first, flow-index.aon still imported both names (which resolved to the
  // same file), and the model came out with 113 flows for 114 entities. The
  // entity left without a flow then failed generation outright, in the go
  // test template, as `getModelPath: path not found at
  // 'main.kit.flow.BasicStaticIPFlow'` - a message that points at the
  // lookup and says nothing about the file that was overwritten.
  //
  // snakify does not separate them (both give `basic_static_ip_flow`), so
  // the discriminator is positional: every member of a colliding group is
  // suffixed, in sorted-name order, so the names are stable across runs and
  // no member keeps the bare name. Flows that do not collide are untouched.
  // Only the FILE name changes - `flow.name`, and so the model key the
  // generator looks up, is left exactly as it was.
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

        // `./` — see the entity barrel: aontu 0.65 reads a bare
        // single-segment include as a package name and refuses it.
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

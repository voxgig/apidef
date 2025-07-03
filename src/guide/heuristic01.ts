

import { each, snakify, names } from 'jostraca'


import { depluralize } from '../utility'


type EntityDesc = {
  name: string
  origname: string
  plural: string
  path: Record<string, EntityPathDesc>
  alias: Record<string, string>
}


type EntityPathDesc = {
  op: Record<string, any>
}

async function heuristic01(ctx: any): Promise<Record<string, any>> {
  let guide = ctx.model.main.api.guide


  const entityDescs = resolveEntityDescs(ctx)

  // console.log('entityDescs')
  // console.dir(entityDescs, { depth: null })

  guide = {
    control: guide.control,
    entity: entityDescs,
  }

  return guide
}


const METHOD_IDOP: Record<string, string> = {
  get: 'load',
  post: 'create',
  put: 'update',
  patch: 'update',
  delete: 'remove',
}


function resolveEntityDescs(ctx: any) {
  const entityDescs: Record<string, any> = {}
  const paths = ctx.def.paths

  // Analyze paths ending in .../foo/{foo}
  each(paths, (pathdef, pathstr) => {

    // Look for rightmmost /entname/{entid}.
    const m = pathstr.match(/\/([a-zA-Z0-1_-]+)\/\{([a-zA-Z0-1_-]+)\}$/)
    if (m) {
      const entdesc = resolveEntity(entityDescs, pathstr, m[1], m[2])


      each(pathdef, (mdef, method) => {
        const opname = METHOD_IDOP[method]
        if (null == opname) return;

        const transform: Record<string, any> = {
          // reqform: '`reqdata`',
          // resform: '`body`',
        }

        const resokdef = mdef.responses[200] || mdef.responses[201]
        const resbody = resokdef?.content?.['application/json']?.schema
        if (resbody) {
          if (resbody[entdesc.origname]) {
            transform.resform = '`body.' + entdesc.origname + '`'
          }
          else if (resbody[entdesc.name]) {
            transform.resform = '`body.' + entdesc.name + '`'
          }
        }

        const reqdef = mdef.requestBody?.content?.['application/json']?.schema?.properties
        if (reqdef) {
          if (reqdef[entdesc.origname]) {
            transform.reqform = { [entdesc.origname]: '`reqdata`' }
          }
          else if (reqdef[entdesc.origname]) {
            transform.reqform = { [entdesc.origname]: '`reqdata`' }
          }

        }

        const op = entdesc.path[pathstr].op

        op[opname] = {
          // TODO: in actual guide, remove "standard" method ops since redundant
          method,
        }

        if (0 < Object.entries(transform).length) {
          op[opname].transform = transform
        }
      })
    }
  })

  // Analyze paths ending in .../foo
  each(paths, (pathdef, pathstr) => {

    // Look for rightmmost /entname.
    const m = pathstr.match(/\/([a-zA-Z0-1_-]+)$/)
    if (m) {
      const entdesc = resolveEntity(entityDescs, pathstr, m[1])

      if (pathdef.get) {
        const op: Record<string, any> = { list: { method: 'get' } }
        entdesc.path[pathstr] = { op }

        const transform: Record<string, any> = {}
        const mdef = pathdef.get
        const resokdef = mdef.responses[200] || mdef.responses[201]
        const resbody = resokdef?.content?.['application/json']?.schema
        if (resbody) {
          if (resbody[entdesc.origname]) {
            transform.resform = '`body.' + entdesc.origname + '`'
          }
          else if (resbody[entdesc.name]) {
            transform.resform = '`body.' + entdesc.name + '`'
          }
        }

        if (0 < Object.entries(transform).length) {
          op.transform = transform
        }
      }
    }
  })

  return entityDescs
}


function resolveEntity(
  entityDescs: Record<string, EntityDesc>,
  pathStr: string,
  pathName: string,
  pathParam?: string
)
  : EntityDesc {
  let origentname = snakify(pathName)
  let entname = depluralize(origentname)

  let entdesc = (entityDescs[entname] = entityDescs[entname] || { name: entname })
  entdesc.plural = origentname
  entdesc.origname = origentname

  names(entdesc, entname)

  entdesc.alias = entdesc.alias || {}

  if (null != pathParam) {
    const pathParamCanon = snakify(pathParam)
    if ('id' != pathParamCanon) {
      entdesc.alias.id = pathParamCanon
      entdesc.alias[pathParamCanon] = 'id'
    }
  }

  entdesc.path = (entdesc.path || {})
  entdesc.path[pathStr] = { op: {} }

  return entdesc
}


export {
  heuristic01
}

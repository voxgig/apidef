

import { each, snakify, names } from 'jostraca'

import { size, walk } from '@voxgig/struct'


import {
  depluralize,
  getdlog
} from '../utility'


type EntityDesc = {
  name: string
  origname: string
  why_name?: string[]
  plural: string
  path: Record<string, EntityPathDesc>
  alias: Record<string, string>
}


type EntityPathDesc = {
  op: Record<string, any>
  why_ent: string[]
}

// Log non-fatal wierdness.
const dlog = getdlog('apidef', __filename)

async function heuristic01(ctx: any): Promise<Record<string, any>> {
  let guide = ctx.model.main.api.guide

  const entityDescs = resolveEntityDescs(ctx)

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
  each(paths, (pathDef: any, pathStr: string) => {

    // Look for rightmmost /entname/{entid}.
    let m = pathStr.match(/\/([a-zA-Z0-1_-]+)(\/\{([a-zA-Z0-1_-]+)\})?$/)
    // const m = pathStr.match(/\/([a-zA-Z0-1_-]+)\/\{([a-zA-Z0-1_-]+)\}$/)
    if (m) {
      // const entdesc = resolveEntity(entityDescs, pathStr, m[1], m[2])

      each(pathDef, (methodDef: any, methodStr: string) => {
        // console.log('PPP', pathStr, methodStr, methodDef)

        methodStr = methodStr.toLowerCase()
        let why_op: string[] = []

        if (!METHOD_IDOP[methodStr]) {
          return
        }

        const why_ent: string[] = []
        const entdesc =
          resolveEntity(entityDescs, pathDef, pathStr, methodDef, methodStr, why_ent)


        if (null == entdesc) {
          console.log(
            'WARNING: unable to resolve entity for method ' + methodStr +
            ' path ' + pathStr)
          return
        }

        entdesc.path[pathStr].why_ent = why_ent


        // if (pathStr.includes('courses')) {
        //   console.log('ENTRES', pathStr, methodStr)
        //   console.dir(ent2, { depth: null })
        // }

        let opname = resolveOpName(methodStr, methodDef, pathStr, entdesc, why_op)

        if (null == opname) {
          console.log(
            'WARNING: unable to resolve operation for method ' + methodStr +
            ' path ' + pathStr)
          return
        }


        const transform: Record<string, any> = {
          // reqform: '`reqdata`',
          // resform: '`body`',
        }

        const resokdef = methodDef.responses?.[200] || methodDef.responses?.[201]
        const resbody = resokdef?.content?.['application/json']?.schema
        if (resbody) {
          if (resbody[entdesc.origname]) {
            transform.resform = '`body.' + entdesc.origname + '`'
          }
          else if (resbody[entdesc.name]) {
            transform.resform = '`body.' + entdesc.name + '`'
          }
        }

        const reqdef = methodDef.requestBody?.content?.['application/json']?.schema?.properties
        if (reqdef) {
          if (reqdef[entdesc.origname]) {
            transform.reqform = { [entdesc.origname]: '`reqdata`' }
          }
          else if (reqdef[entdesc.origname]) {
            transform.reqform = { [entdesc.origname]: '`reqdata`' }
          }

        }

        const op = entdesc.path[pathStr].op

        op[opname] = {
          // TODO: in actual guide, remove "standard" method ops since redundant
          method: methodStr,
          why_op: why_op.join(';')
        }

        if (0 < Object.entries(transform).length) {
          op[opname].transform = transform
        }

        // if ('/v2/users/{user_id}/enrollment' === pathStr) {
        //   console.log('ENT')
        //   console.dir(entdesc, { depth: null })
        // }
      })
    }
  })

  // console.log('USER')
  // console.dir(entityDescs.user, { depth: null })

  return entityDescs
}


function resolveEntity(
  entityDescs: Record<string, EntityDesc>,
  pathDef: Record<string, any>,
  pathStr: string,
  methodDef: Record<string, any>,
  methodStr: string,
  why_ent: string[]
): EntityDesc | undefined {

  let entdesc: EntityDesc
  let entname: string = ''
  let origentname: string = ''

  const why_name: string[] = []

  const m = pathStr.match(/\/([a-zA-Z0-1_-]+)(\/\{([a-zA-Z0-1_-]+)\})?$/)
  if (m) {
    let pathName = m[1]
    origentname = snakify(pathName)
    entname = depluralize(origentname)

    // Check schema
    const compname = resolveComponentName(entname, methodDef, methodStr, pathStr, why_name)
    if (compname) {
      origentname = snakify(compname)
      entname = depluralize(origentname)
      why_ent.push('cmp:' + entname)
    }
    else {
      why_ent.push('path:' + m[1])
      why_name.push('path:' + m[1])
    }

    entdesc = (entityDescs[entname] = entityDescs[entname] || {
      name: entname,
      id: Math.random(),
      alias: {}
    })

    let pathParam = m[3]
    if (null != pathParam) {
      const pathParamCanon = snakify(pathParam)
      if ('id' != pathParamCanon) {
        entdesc.alias.id = pathParamCanon
        entdesc.alias[pathParamCanon] = 'id'
      }
    }
  }

  // Can't figure out the entity
  else {
    console.log('NO ENTTIY', pathStr)
    return
  }


  // entdesc.plural = origentname
  entdesc.origname = origentname

  names(entdesc, entname)

  entdesc.alias = entdesc.alias || {}

  entdesc.path = (entdesc.path || {})
  entdesc.path[pathStr] = entdesc.path[pathStr] || {}
  entdesc.path[pathStr].op = entdesc.path[pathStr].op || {}

  if (null == entdesc.why_name) {
    entdesc.why_name = why_name
  }

  return entdesc
}


const REQKIND: any = {
  get: 'res',
  post: 'req',
  put: 'req',
  patch: 'req',
}


function resolveComponentName(
  entname: string,
  methodDef: Record<string, any>,
  methodStr: string,
  pathStr: string,
  why_name: string[]
): string | undefined {
  let compname: string | undefined = undefined

  let xrefs = find(methodDef, 'x-ref')
    .filter(xref => xref.val.includes('schema'))

    // TODO: identify non-ent schemas
    .filter(xref => !xref.val.includes('Meta'))

    .sort((a, b) => a.path.length - b.path.length)

  // console.log('RCN', pathStr, methodStr, xrefs.map(x => [x.val, x.path.length]))

  let first = xrefs[0]?.val

  if (null != first) {
    let xrefm = (first as string).match(/\/components\/schemas\/(.+)$/)
    if (xrefm) {
      why_name.push('cmp')
      compname = xrefm[1]
    }
  }

  if (null != compname) {
    compname = depluralize(snakify(compname))

    // Assume sub schemas suffixes are not real entities
    if (compname.includes(entname)) {
      compname = compname.slice(0, compname.indexOf(entname) + entname.length)
    }
  }

  /*
  const responses = methodDef.responses
  const schemalist =
    [
      methodDef.requestBody?.content,
      responses?.['201'],
      responses?.['200'],
    ]
      .filter(cmp => null != cmp)
      .map(content => content['application/json']?.schema)
      .filter(schema => null != schema)
      // .filter(schema => null != schema['x-ref'])
      .map(schema => {

        let xrefs = find(schema, 'x-ref')

        if ('responses' === pathName) {
          console.log('xrefs', xrefs)
        }

        let xrefv = String(xrefs[0])

        let xrefm = xrefv.match(/\/components\/schemas\/(.+)$/)
        if (xrefm) {
          schema['x-ref-cmp'] = xrefm[1]
        }
        return schema
      })
      .filter(schema => null != schema['x-ref-cmp'])

  if ('responses' === pathName) {
    console.log('CMP', pathName, schemalist.length)
    // console.dir(methodDef.responses['200'].content['application/json'].schema, { depth: null })
  }

  let schema = undefined
  let splen = -1

  if (0 < schemalist.length) {
    why_name.push('schema')
  }

  for (let sI = 0; sI < schemalist.length; sI++) {
    let nextschema = schemalist[sI]
    let nsplen = nextschema.properties?.length || -1

    // console.log('QQQ', splen, nsplen, schema?.['x-ref-cmp'], nextschema?.['x-ref-cmp'])

    if (
      // More properties probably means it is the full entity.
      splen < nsplen ||

      // Shorter name probably means it is the full entity (no suffix/prefix).
      (schema && splen === nsplen && nextschema['x-ref-cmp'].length < schema['x-ref-cmp'].length)

    ) {
      schema = nextschema
      splen = nsplen
    }
  }

  if (schema) {
    let xref = schema['x-ref']
    // console.log('RCN-XREF', methodStr, 'xref-0', xref)

    if (null == xref) {
      why_name.push('xref')
      const properties = schema.properties || {}
      each(properties, (prop) => {
        if (null == xref) {
          if (prop.type === 'array') {
            xref = prop.items?.['x-ref']
            // console.log('RCN', methodStr, 'xref-1', xref)
          }
        }
      })
    }

    if (null != xref && 'string' === typeof xref) {
      let xrefm = xref.match(/\/components\/schemas\/(.+)$/)
      if (xrefm) {
        why_name.push('cmp')
        compname = xrefm[1]
      }
    }
  }
  */

  return compname
}


function resolveOpName(
  methodStr: string,
  methodDef: any,
  pathStr: string,
  entdesc: EntityDesc,
  why: string[]
)
  : string | undefined {
  // console.log('ROP', pathStr, methodDef)


  let opname = METHOD_IDOP[methodStr]
  if (null == opname) {
    why.push('no-op:' + methodStr)
    return
  }

  if ('load' === opname) {
    const islist = isListResponse(methodDef, pathStr, entdesc, why)
    opname = islist ? 'list' : opname

    // console.log('ISLIST', entdesc.name, methodStr, opname, pathStr)
  }
  else {
    why.push('not-load')
  }

  return opname
}


function isListResponse(
  methodDef: Record<string, any>,
  pathStr: string,
  entdesc: EntityDesc,
  why: string[]
): boolean {
  const responses = methodDef.responses
  const resdef = responses?.['201'] || responses?.['200']
  const content = resdef?.content

  let islist = false

  if (null == content) {
    // console.log('NO-CONTENT', pathStr, methodDef)
    why.push('no-content')
  }
  else {
    const schema = content['application/json']?.schema
    if (null == schema) {
      why.push('no-schema')
    }
    else {

      if (schema.type === 'array') {
        why.push('array')
        islist = true
      }

      if (!islist) {
        const properties = schema.properties || {}
        each(properties, (prop) => {
          if (prop.type === 'array') {

            if (1 === size(properties)) {
              why.push('one-prop:' + prop.key$)
              islist = true
            }

            if (2 === size(properties) &&
              ('data' === prop.key$ ||
                'list' === prop.key$)
            ) {
              why.push('two-prop:' + prop.key$)
              islist = true
            }

            if (prop.key$ === entdesc.name) {
              why.push('name:' + entdesc.origname)
              islist = true
            }

            if (prop.key$ === entdesc.origname) {
              why.push('origname:' + entdesc.origname)
              islist = true
            }

            const listent = listedEntity(prop)
            if (listent === entdesc.name) {
              why.push('listent:' + listent)
              islist = true
            }


            // if ('/v2/users' === pathStr) {
            //   console.log('islistresponse', islist, pathStr, entdesc.name, listedEntity(prop), properties)
            // }
          }
        })
      }

      if (!islist) {
        why.push('not-list')
      }
    }
  }

  return islist
}


function listedEntity(prop: any) {
  const xref = prop?.items?.['x-ref']
  const m = 'string' === typeof xref && xref.match(/^#\/components\/schemas\/(.+)$/)
  if (m) {
    return depluralize(snakify(m[1]))
  }
}


function find(obj: any, qkey: string): any[] {
  let vals: any[] = []
  walk(obj, (key: any, val: any, _p: any, t: string[]) => {
    if (qkey === key) {
      vals.push({ key, val, path: t })
    }
    return val
  })
  return vals
}


export {
  heuristic01
}

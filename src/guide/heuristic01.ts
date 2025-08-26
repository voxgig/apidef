

import { each, snakify, names } from 'jostraca'

import { size, escre, items, getelem } from '@voxgig/struct'


import {
  depluralize,
  getdlog,
  capture,
  find,
  pathMatch,
} from '../utility'


type Metrics = {
  count: {
    path: number
    schema: Record<string, number>
  }
}


type EntityDesc = {
  name: string
  origname: string
  plural: string
  path: Record<string, EntityPathDesc>
  alias: Record<string, string>,
  why_name: string[]
}


type EntityPathDesc = {
  op: Record<string, any>
  rename: {
    param: Record<string, string>
  }
  rename_why: {
    param_why: Record<string, string[]>
  }
  why_ent: string[]
}

// Log non-fatal wierdness.
const dlog = getdlog('apidef', __filename)


async function heuristic01(ctx: any): Promise<Record<string, any>> {
  let guide = ctx.model.main.api.guide

  const metrics = measure(ctx)
  // console.dir(metrics, { depth: null })

  const entityDescs = resolveEntityDescs(ctx, metrics)

  // console.log('ED', Object.keys(entityDescs))

  guide = {
    control: guide.control,
    entity: entityDescs,
  }

  return guide
}


function measure(ctx: any): Metrics {
  const metrics: Metrics = {
    count: {
      path: Object.keys(ctx.def.paths ?? {}).length,
      schema: ({} as Record<string, number>)
    }
  }

  let xrefs = find(ctx.def, 'x-ref')

  let schemas = xrefs.filter(xref => xref.val.includes('schema'))

  schemas.map(schema => {
    let m = schema.val.match(/\/components\/schemas\/(.+)$/)
    if (m) {
      const name = fixEntName(m[1])
      metrics.count.schema[name] = 1 + (metrics.count.schema[name] || 0)
    }
  })


  return metrics
}




const METHOD_IDOP: Record<string, string> = {
  GET: 'load',
  POST: 'create',
  PUT: 'update',
  DELETE: 'remove',
  PATCH: 'patch',
}


function resolveEntityDescs(ctx: any, metrics: Metrics) {
  const entityDescs: Record<string, any> = {}
  const paths = ctx.def.paths


  const caught = capture(ctx.def, {
    paths:
      //['`$SELECT`', /\/([a-zA-Z0-1_-]+)(\/\{([a-zA-Z0-1_-]+)\})?$/,
      ['`$SELECT`', /.*/,
        ['`$SELECT`', /^get|post|put|patch|delete$/i,
          ['`$APPEND`', 'methods', {
            path: '`select$=key.paths`',
            method: { '`$UPPER`': '`$KEY`' },
            summary: '`.summary`',
            parameters: '`.parameters`',
            responses: '`.responses`',
            requestBody: '`.requestBody`'
          }]
        ]
      ]
  })


  each(caught.methods, (pmdef) => {
    // console.dir(pmdef, { depth: null })

    let methodDef = pmdef
    let pathStr = pmdef.path
    let methodName = pmdef.method

    let pathDef = paths[pathStr]
    pathDef.canonPath$ = pathDef.canonPath$ ?? pathStr

    let why_op: string[] = []

    if (!METHOD_IDOP[methodName]) {
      console.log('ERROR UNKNOWN METHOD: ' + methodName)
      return
    }

    const parts = pathStr.split(/\//).filter((p: string) => '' != p)

    const why_ent: string[] = []
    const entres =
      resolveEntity(metrics, entityDescs, pathStr, parts, methodDef, methodName, why_ent)

    const entdesc = (entres.entdesc as EntityDesc)


    if (null == entdesc) {
      console.log(
        'WARNING: unable to resolve entity for method ' + methodName +
        ' path ' + pathStr)
      return
    }

    if (null == entdesc.name) {
      console.log(
        'WARNING: unable to resolve entity name for method ' + methodName +
        ' path ' + pathStr + ' desc:', entdesc)
      return

    }

    let opname = resolveOpName(methodName, methodDef, pathStr, entres, why_op)

    if (null == opname) {
      console.log(
        'WARNING: unable to resolve operation for method ' + methodName +
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

    const pathDesc = entdesc.path[pathStr]

    const op = pathDesc.op

    op[opname] = {
      // TODO: in actual guide, remove "standard" method ops since redundant
      method: methodName,
      why_op: why_op.join(';')
    }

    if (0 < Object.entries(transform).length) {
      op[opname].transform = transform
    }

    renameParams(ctx, pathStr, methodName, entdesc)
  })

  return entityDescs
}


function resolveEntity(
  metrics: Metrics,
  entityDescs: Record<string, EntityDesc>,
  pathStr: string,
  parts: string[],
  methodDef: Record<string, any>,
  methodName: string,
  why_ent: string[]
): { entdesc?: EntityDesc, why_name: string[], pm?: any } {

  const out: any = {
    entdesc: undefined,
    pm: undefined
  }

  const why_path: string[] = []
  const cmpname = resolveComponentName(methodDef, methodName, pathStr, why_path)
  const cmprate = (metrics.count.schema[cmpname ?? ''] ?? 0) / metrics.count.path

  // console.log('CMPRATE', cmpname, cmprate, metrics.count.schema[cmpname ?? ''], metrics.count.path)

  const cmp = {
    name: cmpname,
    rate: cmprate,
  }

  if (null == cmpname) {
    why_path.push('no-cmp')
  }

  let entname

  let pm = undefined

  if (pm = pathMatch(parts, 't/p/t/')) {
    entname = entityPathMatch_tpte(pm, cmp, why_path)
  }

  else if (pm = pathMatch(parts, 't/p/')) {
    entname = entityPathMatch_tpe(pm, cmp, why_path)
  }

  else if (pm = pathMatch(parts, 'p/t/')) {
    entname = entityPathMatch_pte(pm, cmp, why_path)
  }

  else if (pm = pathMatch(parts, 't/')) {
    entname = entityPathMatch_te(pm, cmp, why_path)
  }

  else if (pm = pathMatch(parts, 'p/')) {
    throw new Error('UNSUPPORTED PATH:' + pathStr)
  }

  if (null == entname || '' === entname || 'undefined' === entname) {
    throw new Error('ENTITY NAME UNRESOLVED:' + why_path + ' ' + pathStr)
  }

  out.pm = pm

  out.entdesc = (entityDescs[entname] = entityDescs[entname] || {
    name: entname,
    id: 'N' + ('' + Math.random()).substring(2, 10),
  })

  out.entdesc.path = (out.entdesc.path || {})
  out.entdesc.path[pathStr] = out.entdesc.path[pathStr] || {}
  out.entdesc.path[pathStr].op = out.entdesc.path[pathStr].op || {}
  out.entdesc.path[pathStr].why_path = why_path

  return out
}


function entityPathMatch_tpte(pm: any, cmp: {
  name?: string,
  rate: number,
}, why_path: string[]) {
  const pathNameIndex = 2

  why_path.push('path=t/p/t/')
  const origPathName = pm[pathNameIndex]
  let entname = fixEntName(origPathName)

  if (null == cmp.name) {
    // Probably a special suffix operation on the entity,
    // so make the entity name sufficiently unique
    entname = fixEntName(pm[0]) + '_' + entname
  }
  else {
    why_path.push('cr=' + cmp.rate.toFixed(3))
    if (entname != cmp.name && cmp.rate < 0.5) {
      why_path.push('cmp-primary')
      entname = cmp.name
    }
    else {
      why_path.push('path-primary')
    }
  }

  return entname
}


function entityPathMatch_tpe(pm: any, cmp: {
  name?: string,
  rate: number,
}, why_path: string[]) {
  const pathNameIndex = 0

  why_path.push('path=t/p/')
  const origPathName = pm[pathNameIndex]
  let entname = fixEntName(origPathName)

  if (null == cmp.name) {
    why_path.push('no-cmp')
  }
  else {
    why_path.push('cr=' + cmp.rate.toFixed(3))
    if (entname != cmp.name && cmp.rate < 0.5) {
      why_path.push('cmp-primary')
      entname = cmp.name
    }
    else {
      why_path.push('path-primary')
    }
  }

  return entname
}


function entityPathMatch_pte(pm: any, cmp: {
  name?: string,
  rate: number,
}, why_path: string[]) {
  const pathNameIndex = 1

  why_path.push('path=p/t/')
  const origPathName = pm[pathNameIndex]
  let entname = fixEntName(origPathName)

  if (null == cmp.name) {
    why_path.push('no-cmp')
  }
  else {
    why_path.push('cr=' + cmp.rate.toFixed(3))
    if (entname != cmp.name && cmp.rate < 0.5) {
      why_path.push('cmp-primary')
      entname = cmp.name
    }
    else {
      why_path.push('path-primary')
    }
  }

  return entname
}


function entityPathMatch_te(pm: any, cmp: {
  name?: string,
  rate: number,
}, why_path: string[]) {
  const pathNameIndex = 0

  why_path.push('path=t/')
  const origPathName = pm[pathNameIndex]
  let entname = fixEntName(origPathName)

  if (null == cmp.name) {
    why_path.push('no-cmp')
  }
  else {
    why_path.push('cr=' + cmp.rate.toFixed(3))
    if (entname != cmp.name && cmp.rate < 0.5) {
      why_path.push('cmp-primary')
      entname = cmp.name
    }
    else {
      why_path.push('path-primary')
    }
  }

  return entname
}




const REQKIND: any = {
  get: 'res',
  post: 'req',
  put: 'req',
  patch: 'req',
}


function resolveComponentName(
  // entname: string,
  methodDef: Record<string, any>,
  methodName: string,
  pathStr: string,
  why_name: string[]
): string | undefined {
  let cmpname: string | undefined = undefined

  let responses = methodDef.responses

  // let xrefs = find(methodDef, 'x-ref')
  let xrefs = [
    ...find(responses['200'], 'x-ref'),
    ...find(responses['201'], 'x-ref'),
  ]
    .filter(xref => xref.val.includes('schema'))

    // TODO: identify non-ent schemas
    .filter(xref => !xref.val.includes('Meta'))

    .sort((a, b) => a.path.length - b.path.length)

  let first = xrefs[0]?.val

  if (null != first) {
    let xrefm = (first as string).match(/\/components\/schemas\/(.+)$/)
    if (xrefm) {
      cmpname = xrefm[1]
    }
  }

  if (null != cmpname) {
    cmpname = depluralize(snakify(cmpname))
    why_name.push('cmp=' + cmpname)

    // Assume sub schemas suffixes are not real entities
    // if (compname.includes(entname)) {
    //   compname = compname.slice(0, compname.indexOf(entname) + entname.length)
    // }
  }

  return cmpname
}


function resolveOpName(
  methodName: string,
  methodDef: any,
  pathStr: string,
  entres: any,
  why: string[]
)
  : string | undefined {
  // console.log('ROP', pathStr, methodDef)

  let opname = METHOD_IDOP[methodName]
  if (null == opname) {
    why.push('no-op:' + methodName)
    return
  }

  if ('load' === opname) {
    const islist = isListResponse(methodDef, pathStr, entres, why)
    opname = islist ? 'list' : opname
  }
  else {
    why.push('not-load')
  }

  return opname
}


function isListResponse(
  methodDef: Record<string, any>,
  pathStr: string,
  entres: any,
  why: string[]
): boolean {

  let islist = false

  if (entres.pm && entres.pm.expr.endsWith('p/')) {
    why.push('end-param')
  }
  else {

    const caught = capture(methodDef, {
      responses:
        // '`$ANY`': { content: { 'application/json': { schema: '`$CAPTURE`' } } },
        ['`$SELECT`', { '$KEY': { '`$OR`': ['200', '201'] } },
          { content: { 'application/json': { schema: '`$CAPTURE`' } } }],

    })

    const schema = caught.schema

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
          // console.log('ISLIST', pathStr, prop.key$, prop.type)

          if (prop.type === 'array') {
            why.push('array-prop:' + prop.key$)
            islist = true


            /*
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
            */

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




// Make consistent changes to support semantic entities.
function renameParams(ctx: any, pathStr: string, methodName: string, entdesc: EntityDesc) {

  // Rewrite path parameters that are identifiers to follow the rules:
  // 0. Parameters named [a-z]?id are considered identifiers
  // 1. last identifier is always {id} as this is the primary entity
  // 2. internal identifiers are formatted as {name_id} where name is the parent entity name
  // Example: /api/bar/{id}/zed/{zid}/foo/{fid} ->
  //          /api/bar/{bar_id}/zed/{zed_id}/foo/{id}

  const pathDef = entdesc.path[pathStr]
  pathDef.rename = (pathDef.rename ?? {})
  pathDef.rename_why = (pathDef.rename_why ?? {})

  const paramRenames = pathDef.rename.param = (pathDef.rename.param ?? {})
  const paramRenamesWhy = pathDef.rename_why.param_why = (pathDef.rename_why.param_why ?? {})

  const parts = pathStr.split(/\//).filter(p => '' != p)

  for (let partI = 0; partI < parts.length; partI++) {
    let partStr = parts[partI]

    if (isParam(partStr)) {
      let oldParam = partStr.substring(1, partStr.length - 1)
      paramRenamesWhy[oldParam] = []


      let hasParent = 1 < partI && !isParam(parts[partI - 1])
      let parentName = hasParent ? fixEntName(parts[partI - 1]) : null

      // console.log(
      //  'PARAM', partI + '/' + parts.length, oldParam, 'p=' + parentName, 'e=' + entdesc.name)

      // Id-like not at end, and after a possible entname.
      // .../parentent/{id}/...
      if (
        oldParam.endsWith('id') &&
        hasParent &&
        partI < parts.length - 1 &&
        parentName !== entdesc.name
      ) {

        // actually a filter
        if (entdesc.name.startsWith(parentName + '_') && partI === parts.length - 2) {
          let newParamName = 'id'
          paramRenames[oldParam] = newParamName
          paramRenamesWhy[oldParam].push('filter-not-parent:' + entdesc.name)

        }
        else {
          let newParamName = parentName + '_id'
          paramRenames[oldParam] = newParamName
          paramRenamesWhy[oldParam].push('parent:' + parentName)
        }
      }

      // At end, but not called id.
      // .../ent/{not-id}
      else if (
        partI === parts.length - 1 &&
        'id' !== oldParam
      ) {
        paramRenames[oldParam] = 'id'
        paramRenamesWhy[oldParam].push('end-id')
      }

      // Mot at end, has preceding non-param part.
      // .../parentent/{paramname}/...
      else if (
        partI < parts.length - 1 &&
        1 < partI &&
        hasParent
      ) {

        // Actually primary ent with a filter$ suffix
        if (
          partI === parts.length - 2
        ) {
          if ('id' !== oldParam && fixEntName(partStr) === entdesc.name) {
            paramRenames[oldParam] = 'id'
            paramRenamesWhy[oldParam].push('filter-at-end')
          }
        }

        // Not primary ent.
        else {
          let newParamName = parentName + '_id'
          if (newParamName != oldParam) {
            paramRenames[oldParam] = newParamName
            paramRenamesWhy[oldParam].push('non-primary')
          }
        }
      }

      // Skip if renamed to itself!
      if (paramRenames[oldParam] === oldParam) {
        delete paramRenames[oldParam]
        delete paramRenamesWhy[oldParam]
      }
    }
  }
}


function isParam(partStr: string) {
  return '{' === partStr[0] && '}' === partStr[partStr.length - 1]
}

/*
function modifyParam(
  def: any,
  pathStr: string,
  methodStr: string,
  origParamName: string,
  newParamName: string
) {
  const pathdef = def.paths[pathStr]
  let canonPath = pathdef.canonPath$

  canonPath = canonPath.replace('{' + origParamName + '}', '{' + newParamName + '}')

  let params = [].concat((pathdef.parameters || [])).concat(pathdef[methodStr].parameters || [])
    .filter((p: any) => p.name === origParamName)

  params.map((p: any) => {
    p.name = newParamName
    return p
  })

  // console.log('MODIFYPARAM', canonPath, params)

  pathdef.canonPath$ = canonPath
}
*/

function fixEntName(origName: string) {
  if (null == origName) {
    return origName
  }
  return depluralize(snakify(origName))
}



/*
function findUrlParams(path: string): string[] {
  const re = /\{([A-Za-z0-9_.-]+)\}/g
  const names: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(path)) !== null) {
    names.push(m[1]);
  }
  return names;
}
 
 
function modifyPathParam(
  paths: any,
  pathdef: any,
  param: any,
  old_path: string,
  old_param: string,
  new_path: string,
  new_param: string
) {
  if (paths) {
    delete paths[old_path]
    paths[new_path] = pathdef
  }
  pathdef.key$ = new_path
 
  if (pathdef.parameters) {
    delete pathdef.parameters[old_param]
    pathdef.parameters[new_param] = param
  }
  param.name = new_param
  param.key$ = new_param
}
 
 
function sortkeys(obj: any, prop: string) {
  const src = obj[prop] ?? {}
  const sorted: any = {}
  const sorted_keys = Object.keys(src).sort()
  for (let sk of sorted_keys) {
    sorted[sk] = obj[prop][sk]
  }
  obj[prop] = sorted
}
*/



export {
  heuristic01
}

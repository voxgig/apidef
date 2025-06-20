

import { each, snakify, names } from 'jostraca'



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

  each(paths, (pathdef, pathname) => {
    // look for rightmmost /entname/{entid}
    const m = pathname.match(/\/([a-zA-Z0-1_-]+)\/\{([a-zA-Z0-1_-]+)\}$/)
    if (m) {
      let origentname = snakify(m[1])
      let entname = depluralize(origentname)

      let entdesc = (entityDescs[entname] = entityDescs[entname] || { name: entname })
      entdesc.plural = origentname

      names(entdesc, entname)

      entdesc.alias = entdesc.alias || {}

      if ('id' != m[2]) {
        entdesc.alias.id = m[2]
        entdesc.alias[m[2]] = 'id'
      }

      entdesc.path = (entdesc.path || {})

      const op: Record<string, any> = {}
      entdesc.path[pathname] = { op }

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
          if (resbody[origentname]) {
            // TODO: use quotes when @voxgig/struct updated to support them
            // transform.resform = '`body."'+origentname+'"`'
            transform.resform = '`body.' + origentname + '`'
          }
          else if (resbody[entname]) {
            transform.resform = '`body.' + entname + '`'
          }
        }

        const reqdef = mdef.requestBody?.content?.['application/json']?.schema?.properties
        if (reqdef) {
          if (reqdef[origentname]) {
            transform.reqform = { [origentname]: '`reqdata`' }
          }
          else if (reqdef[entname]) {
            transform.reqform = { [entname]: '`reqdata`' }
          }

        }

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


  each(paths, (pathdef, pathname) => {
    // look for rightmmost /entname/{entid}
    const m = pathname.match(/\/([a-zA-Z0-1_-]+)$/)
    if (m) {
      let origentname = snakify(m[1])
      let entname = depluralize(origentname)

      let entdesc = entityDescs[entname]

      if (entdesc) {
        entdesc.path = (entdesc.path || {})

        if (pathdef.get) {
          const op: Record<string, any> = { list: { method: 'get' } }
          entdesc.path[pathname] = { op }

          const transform: Record<string, any> = {}
          const mdef = pathdef.get
          const resokdef = mdef.responses[200] || mdef.responses[201]
          const resbody = resokdef?.content?.['application/json']?.schema
          if (resbody) {
            if (resbody[origentname]) {
              // TODO: use quotes when @voxgig/struct updated to support them
              // transform.resform = '`body."'+origentname+'"`'
              transform.resform = '`body.' + origentname + '`'
            }
            else if (resbody[entname]) {
              transform.resform = '`body.' + entname + '`'
            }
          }

          if (0 < Object.entries(transform).length) {
            op.transform = transform
          }
        }
      }
    }
  })

  return entityDescs
}


function depluralize(word: string): string {
  if (!word || word.length === 0) {
    return word
  }

  // Common irregular plurals
  const irregulars: Record<string, string> = {
    'children': 'child',
    'men': 'man',
    'women': 'woman',
    'teeth': 'tooth',
    'feet': 'foot',
    'geese': 'goose',
    'mice': 'mouse',
    'people': 'person',
    'data': 'datum',
    'criteria': 'criterion',
    'phenomena': 'phenomenon',
    'indices': 'index',
    'matrices': 'matrix',
    'vertices': 'vertex',
    'analyses': 'analysis',
    'axes': 'axis',
    'crises': 'crisis',
    'diagnoses': 'diagnosis',
    'oases': 'oasis',
    'theses': 'thesis',
    'appendices': 'appendix'
  }

  if (irregulars[word]) {
    return irregulars[word]
  }

  // Rules for regular plurals (applied in order)

  // -ies -> -y (cities -> city)
  if (word.endsWith('ies') && word.length > 3) {
    return word.slice(0, -3) + 'y'
  }

  // -ves -> -f or -fe (wolves -> wolf, knives -> knife)
  if (word.endsWith('ves')) {
    const stem = word.slice(0, -3)
    // Check if it should be -fe (like knife, wife, life)
    if (['kni', 'wi', 'li'].includes(stem)) {
      return stem + 'fe'
    }
    return stem + 'f'
  }

  // -oes -> -o (potatoes -> potato)
  if (word.endsWith('oes')) {
    return word.slice(0, -2)
  }

  // -ses, -xes, -zes, -shes, -ches -> remove -es (boxes -> box)
  if (word.endsWith('ses') || word.endsWith('xes') || word.endsWith('zes') ||
    word.endsWith('shes') || word.endsWith('ches')) {
    return word.slice(0, -2)
  }

  // -s -> remove -s (cats -> cat)
  if (word.endsWith('s') && !word.endsWith('ss')) {
    return word.slice(0, -1)
  }

  // If none of the rules apply, return as is
  return word
}


export {
  heuristic01
}

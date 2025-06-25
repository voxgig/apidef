/* Copyright (c) 2025 Voxgig, MIT License */

import Path from 'node:path'

import { each, File, Folder, Content } from 'jostraca'


import type {
  ApiDefOptions,
  ApiModel,
  // Log,
  // FsUtil,
} from '../types'


// import {
//   writeChanged
// } from '../utility'


// TODO: merge into apiEntity

function resolveSdkEntity(
  apimodel: ApiModel,
  opts: ApiDefOptions,
  // res: { fs: FsUtil, log: Log }
) {
  // const { fs, log } = res
  // const folder = opts.folder as string

  const entityIncludes: string[] = []

  const barrel = [
    '# Entity Models\n'
  ]

  const entityFiles: { name: string, src: string }[] = []

  each(apimodel.main.api.entity, ((entity: any) => {
    entityIncludes.push(entity.name)

    // HEURISTIC: id may be name_id or nameId
    const fieldAliases =
      each(entity.op, (op: any) =>
        each(op.param))
        .flat()
        .reduce((a: any, p: any) =>

        (entity.field[p.keys] ? null :
          (p.key$.toLowerCase().includes(entity.name) ?
            (a[p.key$] = 'id', a.id = p.key$) :
            null)

          , a), {})

    const fieldAliasesSrc =
      JSON.stringify(fieldAliases, null, 2)
        .replace(/\n/g, '\n  ')

    const entityFileSrc = `
# Entity ${entity.name}

main: sdk: entity: ${entity.name}: {
  alias: field: ${fieldAliasesSrc}
}

`
    // const entityFilePath = Path.join(folder, 'entity',
    //   (null == opts.outprefix ? '' : opts.outprefix) + entity.name + '.jsonic')


    const entityFile =
      (null == opts.outprefix ? '' : opts.outprefix) + entity.name + '.jsonic'

    entityFiles.push({ name: entityFile, src: entityFileSrc })

    barrel.push(`@"${Path.basename(entityFile)}"`)

    // fs.mkdirSync(Path.dirname(entityFilePath), { recursive: true })

    // TODO: diff merge
    // writeChanged('entity-model', entityFilePath, entityFileSrc, fs, log, { update: false })

  }))

  const indexFile = (null == opts.outprefix ? '' : opts.outprefix) + 'entity-index.jsonic'

  // writeChanged('api-entity-index', indexFile, barrel.join('\n'), fs, log)

  return function sdkEntityBuilder() {
    Folder({ name: 'entity' }, () => {
      each(entityFiles, (entityFile) => {
        File({ name: entityFile.name }, () => Content(entityFile.src))
      })

      File({ name: indexFile }, () => Content(barrel.join('\n')))
    })
  }



  // modifyModel(
  //   fs,
  //   opts,
  //   Path.join(
  //     folder,
  //     (null == opts.outprefix ? '' : opts.outprefix) + 'sdk.jsonic'),
  //   entityIncludes
  // )
}


// async function modifyModel(fs: any, opts: any, path: string, entityIncludes: string[]) {
//   // TODO: This is a kludge.
//   // Aontu should provide option for as-is AST so that can be used
//   // to find injection point more reliably


//   // USE A BARREL FILE INSTEAD

//   let src = fs.existsSync(path) ? fs.readFileSync(path, 'utf8') :
//     `
// @"api/${null == opts.outprefix ? '' : opts.outprefix}entity-index.jsonic"

// main: sdk: entity: {}\n

// `

//   let newsrc = '' + src

//   // Inject target file references into model
//   entityIncludes.sort().map((entname: string) => {
//     const lineRE =
//       new RegExp(`@"entity/${entname}.jsonic"`)

//     if (!src.match(lineRE)) {
//       newsrc = newsrc.replace(/(main:\s+sdk:\s+entity:\s+\{\s*\}\n)/, '$1' +
//         `@"entity/${entname}.jsonic"\n`)
//     }
//   })

//   if (newsrc.length !== src.length) {
//     fs.writeFileSync(path, newsrc)
//   }
// }


export {
  resolveSdkEntity
}

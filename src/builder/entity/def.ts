/* Copyright (c) 2025 Voxgig, MIT License */

import Path from 'node:path'


import type {
  ApiDefOptions,
  ApiModel,
} from '../../types'


import {
  File,
  Folder,
  Content
} from 'jostraca'


function resolveDef(
  apimodel: ApiModel,
  opts: ApiDefOptions,
) {
  const defFile =
    (null == opts.outprefix ? '' : opts.outprefix) + 'api-def.jsonic'

  const modelDef = { main: { def: apimodel.main.def } }
  let modelDefSrc = JSON.stringify(modelDef, null, 2)

  modelDefSrc =
    '# API Definition\n\n' +
    modelDefSrc.substring(1, modelDefSrc.length - 1).replace(/\n  /g, '\n')

  return function defBuilder() {
    Folder({ name: 'api' }, () => {
      File({ name: defFile }, () => Content(modelDefSrc))
    })
  }

}


export {
  resolveDef
}

/* Copyright (c) 2025 Voxgig, MIT License */

import Path from 'node:path'


import type {
  ApiDefOptions,
  ApiModel,
  Log,
  FsUtil,
} from '../types'


import {
  writeChanged
} from '../utility'


function generateDef(
  apimodel: ApiModel,
  opts: ApiDefOptions,
  res: { fs: FsUtil, log: Log }
) {
  const { fs, log } = res
  const folder = opts.folder as string
  const defFilePath = Path.join(folder,
    (null == opts.outprefix ? '' : opts.outprefix) + 'def-generated.jsonic')

  const modelDef = { main: { def: apimodel.main.def } }
  let modelDefSrc = JSON.stringify(modelDef, null, 2)

  modelDefSrc =
    '# GENERATED FILE - DO NOT EDIT\n\n' +
    modelDefSrc.substring(1, modelDefSrc.length - 1).replace(/\n  /g, '\n')

  writeChanged('def-model', defFilePath, modelDefSrc, fs, log)
}


export {
  generateDef
}

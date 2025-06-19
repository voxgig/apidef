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
  modelPath: string,
  opts: ApiDefOptions,
  res: { fs: FsUtil, log: Log }
) {
  const { fs, log } = res
  const modelBasePath = Path.dirname(modelPath)
  const defFilePath = Path.join(modelBasePath,
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
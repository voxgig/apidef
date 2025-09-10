/* Copyright (c) 2025 Voxgig, MIT License */


import { formatJSONIC } from '../../utility'


import type {
  ApiDefOptions,
  ApiModel,
} from '../../types'


import {
  File,
  Folder,
  Content
} from 'jostraca'


function resolveInfo(
  apimodel: ApiModel,
  opts: ApiDefOptions,
) {
  const infoFile =
    (null == opts.outprefix ? '' : opts.outprefix) + 'api-info.jsonic'

  const modelInfo = { main: { info: apimodel.main.sdk.info } }
  // let modelDefSrc = JSON.stringify(modelDef, null, 2)
  let modelDefSrc = formatJSONIC(modelInfo)

  modelDefSrc =
    '# API Information\n\n' +
    modelDefSrc.substring(1, modelDefSrc.length - 1).replace(/\n  /g, '\n')

  return function infoBuilder() {
    Folder({ name: 'api' }, () => {
      File({ name: infoFile }, () => Content(modelDefSrc))
    })
  }

}


export {
  resolveInfo
}

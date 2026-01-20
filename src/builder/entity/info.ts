/* Copyright (c) 2025 Voxgig, MIT License */


import { formatJSONIC } from '../../utility'


import type {
  KitModel,

  ApiDefOptions,
  ApiModel,
} from '../../types'

import {
  KIT
} from '../../types'

import {
  File,
  Folder,
  Content
} from 'jostraca'


function resolveInfo(
  apimodel: any,
  opts: ApiDefOptions,
) {
  const kit: KitModel = apimodel.main[KIT]

  const infoFile =
    (null == opts.outprefix ? '' : opts.outprefix) + 'api-info.jsonic'

  const modelInfo = { main: { kit: { info: kit.info } } }

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

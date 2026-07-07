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
    (null == opts.outprefix ? '' : opts.outprefix) + 'api-info.aontu'

  const modelInfo = { main: { kit: { info: kit.info } } }

  // .trim() first so substring(1, len-1) strips the wrapping `{` and `}`.
  // Without it, formatJSONIC's trailing newline is removed instead of the
  // closing brace, leaving a dangling `}` in the output. Mirrors the sibling
  // entity builder (builder/entity/entity.ts), which trims for this reason.
  let modelDefSrc = formatJSONIC(modelInfo).trim()

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

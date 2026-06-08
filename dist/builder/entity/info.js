"use strict";
/* Copyright (c) 2025 Voxgig, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveInfo = resolveInfo;
const utility_1 = require("../../utility");
const types_1 = require("../../types");
const jostraca_1 = require("jostraca");
function resolveInfo(apimodel, opts) {
    const kit = apimodel.main[types_1.KIT];
    const infoFile = (null == opts.outprefix ? '' : opts.outprefix) + 'api-info.jsonic';
    const modelInfo = { main: { kit: { info: kit.info } } };
    // .trim() first so substring(1, len-1) strips the wrapping `{` and `}`.
    // Without it, formatJSONIC's trailing newline is removed instead of the
    // closing brace, leaving a dangling `}` in the output. Mirrors the sibling
    // entity builder (builder/entity/entity.ts), which trims for this reason.
    let modelDefSrc = (0, utility_1.formatJSONIC)(modelInfo).trim();
    modelDefSrc =
        '# API Information\n\n' +
            modelDefSrc.substring(1, modelDefSrc.length - 1).replace(/\n  /g, '\n');
    return function infoBuilder() {
        (0, jostraca_1.Folder)({ name: 'api' }, () => {
            (0, jostraca_1.File)({ name: infoFile }, () => (0, jostraca_1.Content)(modelDefSrc));
        });
    };
}
//# sourceMappingURL=info.js.map
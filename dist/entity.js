"use strict";
/* Copyright (c) 2025 Voxgig, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveEntity = resolveEntity;
const apiEntity_1 = require("./entity/apiEntity");
const def_1 = require("./entity/def");
const sdkEntity_1 = require("./entity/sdkEntity");
function resolveEntity(apimodel, spec, opts) {
    const apiEntityBuilder = (0, apiEntity_1.resolveApiEntity)(apimodel, opts);
    const defBuilder = (0, def_1.resolveDef)(apimodel, opts);
    const sdkEntityBuilder = (0, sdkEntity_1.resolveSdkEntity)(apimodel, opts);
    return function modelBuilder() {
        apiEntityBuilder();
        defBuilder();
        sdkEntityBuilder();
    };
}
//# sourceMappingURL=entity.js.map
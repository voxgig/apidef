"use strict";
/* Copyright (c) 2025 Voxgig, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveEntity = resolveEntity;
const apiEntity_1 = require("./entity/apiEntity");
const def_1 = require("./entity/def");
// import {
//   resolveSdkEntity
// } from './entity/sdkEntity'
async function resolveEntity(ctx) {
    const { apimodel, opts } = ctx;
    const apiEntityBuilder = (0, apiEntity_1.resolveApiEntity)(apimodel, opts);
    const defBuilder = (0, def_1.resolveDef)(apimodel, opts);
    // const sdkEntityBuilder = resolveSdkEntity(apimodel, opts)
    return function modelBuilder() {
        apiEntityBuilder();
        defBuilder();
        // sdkEntityBuilder()
    };
}
//# sourceMappingURL=entity.js.map
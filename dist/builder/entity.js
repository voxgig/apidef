"use strict";
/* Copyright (c) 2025 Voxgig, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeEntityBuilder = makeEntityBuilder;
// import { each } from 'jostraca'
// import type {
//   ApiDefOptions,
//   Log,
//   FsUtil,
// } from '../types'
// import {
//   writeChanged
// } from '../utility'
const apiEntity_1 = require("./entity/apiEntity");
const def_1 = require("./entity/def");
// import {
//   resolveSdkEntity
// } from './entity/sdkEntity'
async function makeEntityBuilder(ctx) {
    const { apimodel, opts } = ctx;
    const apiEntityBuilder = (0, apiEntity_1.resolveApiEntity)(apimodel, opts);
    const defBuilder = (0, def_1.resolveDef)(apimodel, opts);
    // const sdkEntityBuilder = resolveSdkEntity(apimodel, opts)
    return function entityBuilder() {
        apiEntityBuilder();
        defBuilder();
        // sdkEntityBuilder()
    };
}
//# sourceMappingURL=entity.js.map
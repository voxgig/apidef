"use strict";
/* Copyright (c) 2025 Voxgig, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenBuildShape = exports.OpenModelShape = void 0;
const gubu_1 = require("gubu");
const ModelShape = (0, gubu_1.Gubu)({
    name: String,
    def: String,
    main: {
        sdk: {},
        def: {},
        api: {
            guide: {},
            entity: {},
        },
    }
});
const OpenModelShape = (0, gubu_1.Gubu)((0, gubu_1.Open)(ModelShape), { name: 'Model' });
exports.OpenModelShape = OpenModelShape;
const BuildShape = (0, gubu_1.Gubu)({
    spec: {
        base: '',
        path: '',
        debug: '',
        use: {},
        res: [],
        require: '',
        log: {},
        fs: (0, gubu_1.Any)(),
        watch: {
            mod: true,
            add: true,
            rem: true,
        }
    }
});
const OpenBuildShape = (0, gubu_1.Gubu)((0, gubu_1.Open)(BuildShape));
exports.OpenBuildShape = OpenBuildShape;
//# sourceMappingURL=types.js.map
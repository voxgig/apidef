"use strict";
/* Copyright (c) 2024-2025 Voxgig Ltd, MIT License */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// The shared aontu model is canonical at top-level model/ and mirrored into
// ts/model/ (for npm) and go/model/ (for the Go module) — see AGENTS.md.
// Each packaging system can only ship files under its own root, so the copies
// are physically duplicated. This test fails if they drift; run
// `make sync-model` to re-sync from the canonical model/.
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
const REPO = node_path_1.default.resolve(__dirname, '..', '..');
const MODEL_FILES = ['apidef.aontu', 'guide.aontu'];
(0, node_test_1.describe)('model-mirror', () => {
    for (const file of MODEL_FILES) {
        (0, node_test_1.test)(`ts/model/${file} matches canonical model/${file}`, () => {
            const canonical = (0, node_fs_1.readFileSync)(node_path_1.default.join(REPO, 'model', file), 'utf8');
            const tsMirror = (0, node_fs_1.readFileSync)(node_path_1.default.join(REPO, 'ts', 'model', file), 'utf8');
            node_assert_1.default.strictEqual(tsMirror, canonical, `ts/model/${file} drifted from model/${file} — run: make sync-model`);
        });
        (0, node_test_1.test)(`go/model/${file} matches canonical model/${file}`, () => {
            const canonical = (0, node_fs_1.readFileSync)(node_path_1.default.join(REPO, 'model', file), 'utf8');
            const goMirror = (0, node_fs_1.readFileSync)(node_path_1.default.join(REPO, 'go', 'model', file), 'utf8');
            node_assert_1.default.strictEqual(goMirror, canonical, `go/model/${file} drifted from model/${file} — run: make sync-model`);
        });
    }
});
//# sourceMappingURL=model-mirror.test.js.map
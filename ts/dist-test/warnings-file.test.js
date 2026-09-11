"use strict";
/* Copyright (c) 2024-2026 Voxgig Ltd, MIT License */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const apidef_1 = require("../dist/apidef");
// THE WARNINGS FILE IS A REVIEWABLE ARTIFACT, so it carries no clock.
//
// Every warning is stamped with `when: Date.now()`, which is useful in a live
// log and fatal in a file that consumers COMMIT. An SDK project regenerates
// and commits `.sdk/apidef-warnings.txt`, and its CI asserts that a
// regeneration reproduces the committed tree BYTE FOR BYTE — so a timestamp
// in that file means the check can never pass, and every regeneration
// produces a diff that says nothing about the warnings themselves.
//
// github-sdk failed exactly that way on its first full-spec commit: 23
// language targets green, and the generator job red over one file and three
// changed lines, all of them clocks.
(0, node_test_1.describe)('warnings file', () => {
    (0, node_test_1.test)('carries no timestamp', () => {
        const text = (0, apidef_1.warningsFileText)([
            { point: 'warning', when: 1789167378038, note: 'no paths for X' },
            { point: 'warning', when: 1789167378041, note: 'no paths for Y' },
        ]);
        node_assert_1.default.ok(!text.includes('when'), 'the file still carries `when`:\n' + text);
        node_assert_1.default.ok(!/\b17891673780\d\d\b/.test(text), 'the file still carries a timestamp value:\n' + text);
    });
    // THE SAME WARNINGS MUST PRODUCE THE SAME BYTES, which is the whole point:
    // a regeneration that changed nothing has to leave the file alone.
    (0, node_test_1.test)('is stable across runs', () => {
        const history = () => [
            { point: 'warning', when: Date.now(), note: 'no paths for X' },
        ];
        node_assert_1.default.equal((0, apidef_1.warningsFileText)(history()), (0, apidef_1.warningsFileText)(history()));
    });
    // Everything else survives — the file exists to say WHICH warnings there
    // are, and dropping the clock must not drop the content with it.
    (0, node_test_1.test)('keeps every other field', () => {
        const text = (0, apidef_1.warningsFileText)([
            { point: 'warning', when: 1, note: 'no paths for X', entm: { name: 'X' } },
        ]);
        node_assert_1.default.ok(text.includes('no paths for X'), text);
        node_assert_1.default.ok(text.includes('"X"'), text);
        node_assert_1.default.ok(text.includes('warning'), text);
    });
});
//# sourceMappingURL=warnings-file.test.js.map
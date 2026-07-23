"use strict";
/* Copyright (c) 2026 Voxgig Ltd, MIT License */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Derived info fields (info.summary, info.website): the top transform
// distills a short "what this API is" blurb and a canonical website link
// from the spec, for doc/README generators.
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const top_1 = require("../dist/transform/top");
(0, node_test_1.describe)('resolveSummary', () => {
    (0, node_test_1.test)('uses info.summary when the spec provides one', () => {
        node_assert_1.default.strictEqual((0, top_1.resolveSummary)({ info: { summary: 'A fast SMS API.', description: 'x' } }), 'A fast SMS API.');
    });
    (0, node_test_1.test)('takes the first sentence of info.description', () => {
        node_assert_1.default.strictEqual((0, top_1.resolveSummary)({ info: { description: 'The SMS Works provides a low-cost, reliable SMS API for developers. Pay only for delivered texts.' } }), 'The SMS Works provides a low-cost, reliable SMS API for developers.');
    });
    (0, node_test_1.test)('strips leading markdown headings before the first prose', () => {
        // The Statuspage shape: a heading-led doc, not a purpose statement.
        const desc = "# Code of Conduct\nPlease don't abuse the API.\n\n# Rate Limiting\nEach token is limited.";
        node_assert_1.default.strictEqual((0, top_1.resolveSummary)({ info: { description: desc } }), "Please don't abuse the API.");
    });
    (0, node_test_1.test)('a description with no sentence terminator returns the paragraph', () => {
        node_assert_1.default.strictEqual((0, top_1.resolveSummary)({ info: { description: 'The API to the Cloudsmith Service' } }), 'The API to the Cloudsmith Service');
    });
    (0, node_test_1.test)('empty / absent description yields undefined (e.g. GitLab)', () => {
        node_assert_1.default.strictEqual((0, top_1.resolveSummary)({ info: {} }), undefined);
        node_assert_1.default.strictEqual((0, top_1.resolveSummary)({ info: { description: '   ' } }), undefined);
        node_assert_1.default.strictEqual((0, top_1.resolveSummary)({}), undefined);
    });
    (0, node_test_1.test)('a letterless placeholder description yields undefined (readme.io ".")', () => {
        node_assert_1.default.strictEqual((0, top_1.resolveSummary)({ info: { description: '.' } }), undefined);
        node_assert_1.default.strictEqual((0, top_1.resolveSummary)({ info: { summary: '.', description: '---' } }), undefined);
    });
    (0, node_test_1.test)('over-long first sentences are capped with an ellipsis', () => {
        const long = 'A' + 'a'.repeat(300) + '.';
        const out = (0, top_1.resolveSummary)({ info: { description: long } });
        node_assert_1.default.ok(out.length <= 240);
        node_assert_1.default.ok(out.endsWith('…'));
    });
});
(0, node_test_1.describe)('ensureDescription', () => {
    (0, node_test_1.test)('keeps real prose unchanged', () => {
        node_assert_1.default.strictEqual((0, top_1.ensureDescription)({ description: 'A fast SMS API.', title: 'SMS' }), 'A fast SMS API.');
    });
    (0, node_test_1.test)('synthesises a sentence from the title when the description is a "." placeholder', () => {
        node_assert_1.default.strictEqual((0, top_1.ensureDescription)({ description: '.', title: 'PayConex 4' }), 'The PayConex 4 API.');
    });
    (0, node_test_1.test)('synthesises for empty / letterless / absent descriptions', () => {
        node_assert_1.default.strictEqual((0, top_1.ensureDescription)({ title: 'Merchant Services' }), 'The Merchant Services API.');
        node_assert_1.default.strictEqual((0, top_1.ensureDescription)({ description: '   ', title: 'X' }), 'The X API.');
        node_assert_1.default.strictEqual((0, top_1.ensureDescription)({ description: '---', title: 'X' }), 'The X API.');
    });
    (0, node_test_1.test)('does not append a redundant "API" when the title already names one', () => {
        node_assert_1.default.strictEqual((0, top_1.ensureDescription)({ description: '.', title: 'Decryptx External Api' }), 'The Decryptx External Api.');
    });
    (0, node_test_1.test)('falls back to a generic sentence when there is no usable title', () => {
        node_assert_1.default.strictEqual((0, top_1.ensureDescription)({ description: '.' }), 'Client SDK for this API.');
        node_assert_1.default.strictEqual((0, top_1.ensureDescription)({ description: '.', title: '   ' }), 'Client SDK for this API.');
    });
});
(0, node_test_1.describe)('resolveWebsite', () => {
    (0, node_test_1.test)('externalDocs.url wins', () => {
        node_assert_1.default.strictEqual((0, top_1.resolveWebsite)({ externalDocs: { url: 'https://docs.example.com' },
            info: { 'x-logo': { href: 'https://logo.example.com' } } }, [{ url: 'https://api.example.com' }]), 'https://docs.example.com');
    });
    (0, node_test_1.test)('redoc x-logo.href is used next', () => {
        node_assert_1.default.strictEqual((0, top_1.resolveWebsite)({ info: { 'x-logo': { href: 'https://thesmsworks.co.uk' } } }, [{ url: 'https://api.thesmsworks.co.uk/v1' }]), 'https://thesmsworks.co.uk');
    });
    (0, node_test_1.test)('falls back to the homepage derived from the server host', () => {
        node_assert_1.default.strictEqual((0, top_1.resolveWebsite)({ info: {} }, [{ url: 'https://api.cloudsmith.io' }]), 'https://cloudsmith.io');
    });
    (0, node_test_1.test)('then contact.url, then termsOfService', () => {
        node_assert_1.default.strictEqual((0, top_1.resolveWebsite)({ info: { contact: { url: 'https://support.example.com' } } }, []), 'https://support.example.com');
        node_assert_1.default.strictEqual((0, top_1.resolveWebsite)({ info: { termsOfService: 'https://example.com/terms' } }, []), 'https://example.com/terms');
    });
    (0, node_test_1.test)('undefined when nothing usable is present', () => {
        node_assert_1.default.strictEqual((0, top_1.resolveWebsite)({ info: {} }, []), undefined);
        node_assert_1.default.strictEqual((0, top_1.resolveWebsite)({ info: { contact: { url: 'not-a-url' } } }, []), undefined);
    });
});
(0, node_test_1.describe)('homepageFromServer', () => {
    (0, node_test_1.test)('strips an api. service subdomain and the path', () => {
        node_assert_1.default.strictEqual((0, top_1.homepageFromServer)('https://api.statuspage.io/v1'), 'https://statuspage.io');
        node_assert_1.default.strictEqual((0, top_1.homepageFromServer)('https://api.github.com'), 'https://github.com');
    });
    (0, node_test_1.test)('strips developer./docs./www. subdomains', () => {
        node_assert_1.default.strictEqual((0, top_1.homepageFromServer)('https://developer.example.com/x'), 'https://example.com');
        node_assert_1.default.strictEqual((0, top_1.homepageFromServer)('https://docs.example.com'), 'https://example.com');
        node_assert_1.default.strictEqual((0, top_1.homepageFromServer)('https://www.example.com'), 'https://example.com');
    });
    (0, node_test_1.test)('leaves a bare apex host untouched', () => {
        node_assert_1.default.strictEqual((0, top_1.homepageFromServer)('https://gitlab.com'), 'https://gitlab.com');
    });
    (0, node_test_1.test)('does not over-strip a host that merely starts with "api"', () => {
        node_assert_1.default.strictEqual((0, top_1.homepageFromServer)('https://apiary.example.com'), 'https://apiary.example.com');
    });
    (0, node_test_1.test)('adds https:// when the server URL omits a scheme', () => {
        node_assert_1.default.strictEqual((0, top_1.homepageFromServer)('api.artic.edu/api/v1'), 'https://artic.edu');
    });
    (0, node_test_1.test)('undefined for junk / single-label / empty', () => {
        node_assert_1.default.strictEqual((0, top_1.homepageFromServer)('localhost'), undefined);
        node_assert_1.default.strictEqual((0, top_1.homepageFromServer)(''), undefined);
        node_assert_1.default.strictEqual((0, top_1.homepageFromServer)(null), undefined);
    });
});
//# sourceMappingURL=info.test.js.map
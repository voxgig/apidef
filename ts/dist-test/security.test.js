"use strict";
/* Copyright (c) 2026 Voxgig Ltd, MIT License */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Spec-derived security description (info.security): the top transform
// resolves the primary security scheme so generators emit the API's actual
// credential format (e.g. Statuspage's `Authorization: OAuth <key>`)
// instead of assuming `Bearer`.
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const top_1 = require("../dist/transform/top");
(0, node_test_1.describe)('security', () => {
    (0, node_test_1.test)('apiKey in Authorization header takes its prefix from the prose (statuspage)', () => {
        const def = {
            security: [{ api_key: [] }],
            components: {
                securitySchemes: {
                    api_key: {
                        type: 'apiKey', in: 'header', name: 'Authorization',
                        description: 'Use your key:\n\n' +
                            '    curl -H "Authorization: OAuth 89a229ce1a8dbcf9ff30430fbe35eb4c" \\\n' +
                            '      https://api.statuspage.io/v1/pages/x.json\n',
                    },
                },
            },
        };
        node_assert_1.default.deepStrictEqual((0, top_1.resolveSecurity)(def), {
            scheme: 'api_key', type: 'apiKey', in: 'header',
            name: 'Authorization', prefix: 'OAuth',
        });
    });
    (0, node_test_1.test)('apiKey in Authorization header is raw (no prefix) without prose evidence', () => {
        // An apiKey scheme means "send the credential as-is"; a Bearer/etc.
        // prefix must come from an http+bearer scheme or explicit prose. This
        // is The SMS Works case: `Authorization: <jwt>`, no prefix.
        const def = {
            components: {
                securitySchemes: {
                    JWT: { type: 'apiKey', in: 'header', name: 'Authorization' },
                },
            },
        };
        node_assert_1.default.strictEqual((0, top_1.resolveSecurity)(def)?.prefix, '');
    });
    (0, node_test_1.test)('apiKey in a custom header is a raw credential (no prefix)', () => {
        const def = {
            components: {
                securitySchemes: {
                    key: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
                },
            },
        };
        node_assert_1.default.deepStrictEqual((0, top_1.resolveSecurity)(def), {
            scheme: 'key', type: 'apiKey', in: 'header',
            name: 'X-API-Key', prefix: '',
        });
    });
    (0, node_test_1.test)('apiKey in query is a raw credential', () => {
        const def = {
            components: {
                securitySchemes: {
                    key: { type: 'apiKey', in: 'query', name: 'api_key' },
                },
            },
        };
        node_assert_1.default.strictEqual((0, top_1.resolveSecurity)(def)?.prefix, '');
    });
    (0, node_test_1.test)('http bearer and basic map to their standard prefixes', () => {
        const bearer = {
            components: { securitySchemes: { a: { type: 'http', scheme: 'bearer' } } },
        };
        const basic = {
            components: { securitySchemes: { a: { type: 'http', scheme: 'basic' } } },
        };
        node_assert_1.default.strictEqual((0, top_1.resolveSecurity)(bearer)?.prefix, 'Bearer');
        node_assert_1.default.strictEqual((0, top_1.resolveSecurity)(basic)?.prefix, 'Basic');
    });
    (0, node_test_1.test)('swagger 2 basic type and securityDefinitions are understood', () => {
        const def = {
            securityDefinitions: { auth: { type: 'basic' } },
        };
        node_assert_1.default.strictEqual((0, top_1.resolveSecurity)(def)?.prefix, 'Basic');
    });
    (0, node_test_1.test)('oauth2 and openIdConnect use a Bearer access token', () => {
        const oauth = {
            components: { securitySchemes: { o: { type: 'oauth2', flows: {} } } },
        };
        const oidc = {
            components: { securitySchemes: { o: { type: 'openIdConnect' } } },
        };
        node_assert_1.default.strictEqual((0, top_1.resolveSecurity)(oauth)?.prefix, 'Bearer');
        node_assert_1.default.strictEqual((0, top_1.resolveSecurity)(oidc)?.prefix, 'Bearer');
        node_assert_1.default.strictEqual((0, top_1.resolveSecurity)(oauth)?.name, 'Authorization');
    });
    (0, node_test_1.test)('the top-level security requirement picks the primary scheme', () => {
        const def = {
            security: [{ second: [] }],
            components: {
                securitySchemes: {
                    first: { type: 'apiKey', in: 'query', name: 'k' },
                    second: { type: 'http', scheme: 'bearer' },
                },
            },
        };
        node_assert_1.default.strictEqual((0, top_1.resolveSecurity)(def)?.scheme, 'second');
    });
    (0, node_test_1.test)('no declared schemes yields null', () => {
        node_assert_1.default.strictEqual((0, top_1.resolveSecurity)({}), null);
        node_assert_1.default.strictEqual((0, top_1.resolveSecurity)({ security: [{ ghost: [] }] }), null);
    });
    (0, node_test_1.test)('findAuthPrefix accepts credential-shaped tails only', () => {
        // Real formats.
        node_assert_1.default.strictEqual((0, top_1.findAuthPrefix)('Authorization: OAuth 89a229ce1a8dbcf9'), 'OAuth');
        node_assert_1.default.strictEqual((0, top_1.findAuthPrefix)('-H "Authorization: token OAUTH-TOKEN"'), 'token');
        node_assert_1.default.strictEqual((0, top_1.findAuthPrefix)('`Authorization: Bearer <access_token>`'), 'Bearer');
        node_assert_1.default.strictEqual((0, top_1.findAuthPrefix)('Authorization: Token {{token}}'), 'Token');
        node_assert_1.default.strictEqual((0, top_1.findAuthPrefix)('Authorization: GenieKey $API_KEY'), 'GenieKey');
        node_assert_1.default.strictEqual((0, top_1.findAuthPrefix)('Authorization: Basic YOUR_CREDENTIALS'), 'Basic');
        // Not prefixes: bare credentials, placeholders, prose, line breaks.
        node_assert_1.default.strictEqual((0, top_1.findAuthPrefix)('Authorization: 89a229ce1a8dbcf9ff30'), null);
        node_assert_1.default.strictEqual((0, top_1.findAuthPrefix)('Authorization: <api-key>'), null);
        node_assert_1.default.strictEqual((0, top_1.findAuthPrefix)('Authorization: your-api-key'), null);
        node_assert_1.default.strictEqual((0, top_1.findAuthPrefix)('Authorization: OAuth\nnext prose line'), null);
        node_assert_1.default.strictEqual((0, top_1.findAuthPrefix)('the Authorization: header is required here'), null);
        node_assert_1.default.strictEqual((0, top_1.findAuthPrefix)(''), null);
        node_assert_1.default.strictEqual((0, top_1.findAuthPrefix)(null), null);
    });
});
//# sourceMappingURL=security.test.js.map
/* Copyright (c) 2026 Voxgig Ltd, MIT License */

// Spec-derived security description (info.security): the top transform
// resolves the primary security scheme so generators emit the API's actual
// credential format (e.g. Statuspage's `Authorization: OAuth <key>`)
// instead of assuming `Bearer`.

import { test, describe } from 'node:test'
import assert from 'node:assert'

import {
  resolveSecurity,
  findAuthPrefix,
} from '../dist/transform/top'


describe('security', () => {

  test('apiKey in Authorization header takes its prefix from the prose (statuspage)', () => {
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
    }
    assert.deepStrictEqual(resolveSecurity(def), {
      scheme: 'api_key', type: 'apiKey', in: 'header',
      name: 'Authorization', prefix: 'OAuth',
    })
  })

  test('apiKey in Authorization header is raw (no prefix) without prose evidence', () => {
    // An apiKey scheme means "send the credential as-is"; a Bearer/etc.
    // prefix must come from an http+bearer scheme or explicit prose. This
    // is The SMS Works case: `Authorization: <jwt>`, no prefix.
    const def = {
      components: {
        securitySchemes: {
          JWT: { type: 'apiKey', in: 'header', name: 'Authorization' },
        },
      },
    }
    assert.strictEqual(resolveSecurity(def)?.prefix, '')
  })

  test('apiKey in a custom header is a raw credential (no prefix)', () => {
    const def = {
      components: {
        securitySchemes: {
          key: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
        },
      },
    }
    assert.deepStrictEqual(resolveSecurity(def), {
      scheme: 'key', type: 'apiKey', in: 'header',
      name: 'X-API-Key', prefix: '',
    })
  })

  test('apiKey in query is a raw credential', () => {
    const def = {
      components: {
        securitySchemes: {
          key: { type: 'apiKey', in: 'query', name: 'api_key' },
        },
      },
    }
    assert.strictEqual(resolveSecurity(def)?.prefix, '')
  })

  test('http bearer and basic map to their standard prefixes', () => {
    const bearer = {
      components: { securitySchemes: { a: { type: 'http', scheme: 'bearer' } } },
    }
    const basic = {
      components: { securitySchemes: { a: { type: 'http', scheme: 'basic' } } },
    }
    assert.strictEqual(resolveSecurity(bearer)?.prefix, 'Bearer')
    assert.strictEqual(resolveSecurity(basic)?.prefix, 'Basic')
  })

  test('swagger 2 basic type and securityDefinitions are understood', () => {
    const def = {
      securityDefinitions: { auth: { type: 'basic' } },
    }
    assert.strictEqual(resolveSecurity(def)?.prefix, 'Basic')
  })

  test('oauth2 and openIdConnect use a Bearer access token', () => {
    const oauth = {
      components: { securitySchemes: { o: { type: 'oauth2', flows: {} } } },
    }
    const oidc = {
      components: { securitySchemes: { o: { type: 'openIdConnect' } } },
    }
    assert.strictEqual(resolveSecurity(oauth)?.prefix, 'Bearer')
    assert.strictEqual(resolveSecurity(oidc)?.prefix, 'Bearer')
    assert.strictEqual(resolveSecurity(oauth)?.name, 'Authorization')
  })

  test('the top-level security requirement picks the primary scheme', () => {
    const def = {
      security: [{ second: [] }],
      components: {
        securitySchemes: {
          first: { type: 'apiKey', in: 'query', name: 'k' },
          second: { type: 'http', scheme: 'bearer' },
        },
      },
    }
    assert.strictEqual(resolveSecurity(def)?.scheme, 'second')
  })

  test('no declared schemes yields null', () => {
    assert.strictEqual(resolveSecurity({}), null)
    assert.strictEqual(resolveSecurity({ security: [{ ghost: [] }] }), null)
  })

  test('findAuthPrefix accepts credential-shaped tails only', () => {
    // Real formats.
    assert.strictEqual(findAuthPrefix('Authorization: OAuth 89a229ce1a8dbcf9'), 'OAuth')
    assert.strictEqual(findAuthPrefix('-H "Authorization: token OAUTH-TOKEN"'), 'token')
    assert.strictEqual(findAuthPrefix('`Authorization: Bearer <access_token>`'), 'Bearer')
    assert.strictEqual(findAuthPrefix('Authorization: Token {{token}}'), 'Token')
    assert.strictEqual(findAuthPrefix('Authorization: GenieKey $API_KEY'), 'GenieKey')
    assert.strictEqual(findAuthPrefix('Authorization: Basic YOUR_CREDENTIALS'), 'Basic')

    // Not prefixes: bare credentials, placeholders, prose, line breaks.
    assert.strictEqual(findAuthPrefix('Authorization: 89a229ce1a8dbcf9ff30'), null)
    assert.strictEqual(findAuthPrefix('Authorization: <api-key>'), null)
    assert.strictEqual(findAuthPrefix('Authorization: your-api-key'), null)
    assert.strictEqual(findAuthPrefix('Authorization: OAuth\nnext prose line'), null)
    assert.strictEqual(findAuthPrefix('the Authorization: header is required here'), null)
    assert.strictEqual(findAuthPrefix(''), null)
    assert.strictEqual(findAuthPrefix(null), null)
  })

  test('findAuthPrefix detects a named scheme without an Authorization: line', () => {
    // NoFrixion's shape: "using the Bearer scheme" + "Example: Bearer eyJ...".
    assert.strictEqual(findAuthPrefix(
      'JWT Authorization header using the Bearer scheme.\nExample: Bearer eyJhbGciOiJ...'), 'Bearer')
    assert.strictEqual(findAuthPrefix('Example: Bearer eyJhbGciOiJ9.abc'), 'Bearer')
    assert.strictEqual(findAuthPrefix('Use the Bearer scheme'), 'Bearer')
    assert.strictEqual(findAuthPrefix('Basic authentication'), 'Basic')
    assert.strictEqual(findAuthPrefix('e.g. Token 0123456789abcdef'), 'Token')
    // Only known scheme words qualify for the loose match — no false positives.
    assert.strictEqual(findAuthPrefix('This API is the bearer of good news for developers'), null)
    assert.strictEqual(findAuthPrefix('Provide your token in the header'), null)
  })

  test('a NoFrixion-style apiKey scheme resolves to Bearer from its prose', () => {
    const def = {
      security: [{ Bearer: [] }],
      components: {
        securitySchemes: {
          Bearer: {
            type: 'apiKey', in: 'header', name: 'Authorization',
            description: 'JWT Authorization header using the Bearer scheme.<br/>\n' +
              'Enter your JWT access token in the text input below.<br/>\n' +
              'Example: Bearer eyJhbGciOiJ...',
          },
        },
      },
    }
    assert.strictEqual(resolveSecurity(def)?.prefix, 'Bearer')
  })

})

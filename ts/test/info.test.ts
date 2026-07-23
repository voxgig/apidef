/* Copyright (c) 2026 Voxgig Ltd, MIT License */

// Derived info fields (info.summary, info.website): the top transform
// distills a short "what this API is" blurb and a canonical website link
// from the spec, for doc/README generators.

import { test, describe } from 'node:test'
import assert from 'node:assert'

import {
  resolveSummary,
  ensureDescription,
  resolveWebsite,
  homepageFromServer,
} from '../dist/transform/top'


describe('resolveSummary', () => {

  test('uses info.summary when the spec provides one', () => {
    assert.strictEqual(
      resolveSummary({ info: { summary: 'A fast SMS API.', description: 'x' } }),
      'A fast SMS API.',
    )
  })

  test('takes the first sentence of info.description', () => {
    assert.strictEqual(
      resolveSummary({ info: { description:
        'The SMS Works provides a low-cost, reliable SMS API for developers. Pay only for delivered texts.' } }),
      'The SMS Works provides a low-cost, reliable SMS API for developers.',
    )
  })

  test('strips leading markdown headings before the first prose', () => {
    // The Statuspage shape: a heading-led doc, not a purpose statement.
    const desc = "# Code of Conduct\nPlease don't abuse the API.\n\n# Rate Limiting\nEach token is limited."
    assert.strictEqual(resolveSummary({ info: { description: desc } }),
      "Please don't abuse the API.")
  })

  test('a description with no sentence terminator returns the paragraph', () => {
    assert.strictEqual(
      resolveSummary({ info: { description: 'The API to the Cloudsmith Service' } }),
      'The API to the Cloudsmith Service',
    )
  })

  test('empty / absent description yields undefined (e.g. GitLab)', () => {
    assert.strictEqual(resolveSummary({ info: {} }), undefined)
    assert.strictEqual(resolveSummary({ info: { description: '   ' } }), undefined)
    assert.strictEqual(resolveSummary({}), undefined)
  })

  test('a letterless placeholder description yields undefined (readme.io ".")', () => {
    assert.strictEqual(resolveSummary({ info: { description: '.' } }), undefined)
    assert.strictEqual(resolveSummary({ info: { summary: '.', description: '---' } }), undefined)
  })

  test('over-long first sentences are capped with an ellipsis', () => {
    const long = 'A' + 'a'.repeat(300) + '.'
    const out = resolveSummary({ info: { description: long }})!
    assert.ok(out.length <= 240)
    assert.ok(out.endsWith('…'))
  })
})


describe('ensureDescription', () => {

  test('keeps real prose unchanged', () => {
    assert.strictEqual(
      ensureDescription({ description: 'A fast SMS API.', title: 'SMS' }),
      'A fast SMS API.')
  })

  test('synthesises a sentence from the title when the description is a "." placeholder', () => {
    assert.strictEqual(
      ensureDescription({ description: '.', title: 'PayConex 4' }),
      'The PayConex 4 API.')
  })

  test('synthesises for empty / letterless / absent descriptions', () => {
    assert.strictEqual(ensureDescription({ title: 'Merchant Services' }), 'The Merchant Services API.')
    assert.strictEqual(ensureDescription({ description: '   ', title: 'X' }), 'The X API.')
    assert.strictEqual(ensureDescription({ description: '---', title: 'X' }), 'The X API.')
  })

  test('does not append a redundant "API" when the title already names one', () => {
    assert.strictEqual(
      ensureDescription({ description: '.', title: 'Decryptx External Api' }),
      'The Decryptx External Api.')
  })

  test('falls back to a generic sentence when there is no usable title', () => {
    assert.strictEqual(ensureDescription({ description: '.' }), 'Client SDK for this API.')
    assert.strictEqual(ensureDescription({ description: '.', title: '   ' }), 'Client SDK for this API.')
  })
})


describe('resolveWebsite', () => {

  test('externalDocs.url wins', () => {
    assert.strictEqual(
      resolveWebsite({ externalDocs: { url: 'https://docs.example.com' },
        info: { 'x-logo': { href: 'https://logo.example.com' } } },
        [{ url: 'https://api.example.com' }]),
      'https://docs.example.com',
    )
  })

  test('redoc x-logo.href is used next', () => {
    assert.strictEqual(
      resolveWebsite({ info: { 'x-logo': { href: 'https://thesmsworks.co.uk' } } },
        [{ url: 'https://api.thesmsworks.co.uk/v1' }]),
      'https://thesmsworks.co.uk',
    )
  })

  test('falls back to the homepage derived from the server host', () => {
    assert.strictEqual(
      resolveWebsite({ info: {} }, [{ url: 'https://api.cloudsmith.io' }]),
      'https://cloudsmith.io',
    )
  })

  test('then contact.url, then termsOfService', () => {
    assert.strictEqual(
      resolveWebsite({ info: { contact: { url: 'https://support.example.com' } } }, []),
      'https://support.example.com',
    )
    assert.strictEqual(
      resolveWebsite({ info: { termsOfService: 'https://example.com/terms' } }, []),
      'https://example.com/terms',
    )
  })

  test('undefined when nothing usable is present', () => {
    assert.strictEqual(resolveWebsite({ info: {} }, []), undefined)
    assert.strictEqual(resolveWebsite({ info: { contact: { url: 'not-a-url' } } }, []), undefined)
  })
})


describe('homepageFromServer', () => {

  test('strips an api. service subdomain and the path', () => {
    assert.strictEqual(homepageFromServer('https://api.statuspage.io/v1'), 'https://statuspage.io')
    assert.strictEqual(homepageFromServer('https://api.github.com'), 'https://github.com')
  })

  test('strips developer./docs./www. subdomains', () => {
    assert.strictEqual(homepageFromServer('https://developer.example.com/x'), 'https://example.com')
    assert.strictEqual(homepageFromServer('https://docs.example.com'), 'https://example.com')
    assert.strictEqual(homepageFromServer('https://www.example.com'), 'https://example.com')
  })

  test('leaves a bare apex host untouched', () => {
    assert.strictEqual(homepageFromServer('https://gitlab.com'), 'https://gitlab.com')
  })

  test('does not over-strip a host that merely starts with "api"', () => {
    assert.strictEqual(homepageFromServer('https://apiary.example.com'), 'https://apiary.example.com')
  })

  test('adds https:// when the server URL omits a scheme', () => {
    assert.strictEqual(homepageFromServer('api.artic.edu/api/v1'), 'https://artic.edu')
  })

  test('undefined for junk / single-label / empty', () => {
    assert.strictEqual(homepageFromServer('localhost'), undefined)
    assert.strictEqual(homepageFromServer(''), undefined)
    assert.strictEqual(homepageFromServer(null), undefined)
  })
})

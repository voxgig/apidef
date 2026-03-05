// Shared test runner for standalone executable testing.
// Exercises the ApiDef pipeline programmatically using the solar test data.
//
// Usage:
//   node run-test.js <fixture-dir> <work-directory>
//
// <fixture-dir> must contain solar/ and def/ subdirectories.
// Creates <work-directory>/solar/ (output) and <work-directory>/def/ (input copy).

const Path = require('node:path')
const Fs = require('node:fs')

// Ensure require.main.paths is set — standalone executables (Bun, Node SEA)
// may leave it undefined, but aontu uses require.main.paths to resolve
// @"package-name/..." includes in jsonic files.
try {
  if (typeof require !== 'undefined') {
    const cwd = process.cwd()
    const fakePaths = []
    let dir = cwd
    while (true) {
      fakePaths.push(Path.join(dir, 'node_modules'))
      const parent = Path.dirname(dir)
      if (parent === dir) break
      dir = parent
    }

    if (!require.main) {
      Object.defineProperty(require, 'main', {
        value: { paths: fakePaths },
        writable: true,
        configurable: true,
      })
    } else if (!require.main.paths) {
      require.main.paths = fakePaths
    } else {
      // Node SEA: require.main.paths exists but points to executable location.
      // Prepend cwd-based paths so aontu can find @voxgig/apidef/model/*.jsonic.
      for (let i = fakePaths.length - 1; i >= 0; i--) {
        if (!require.main.paths.includes(fakePaths[i])) {
          require.main.paths.unshift(fakePaths[i])
        }
      }
    }
  }
} catch(_e) {
  // Ignore if require.main cannot be set
}

const { ApiDef } = require('../../dist/apidef.js')

const FIXTURE_DIR = process.argv[2]
const WORKDIR = process.argv[3]

if (!FIXTURE_DIR || !WORKDIR) {
  console.error('Usage: run-test <fixture-dir> <work-directory>')
  process.exit(1)
}

run()

async function run() {
  try {
    const absFixtures = Path.resolve(FIXTURE_DIR)
    const absWork = Path.resolve(WORKDIR)
    const solarOut = Path.join(absWork, 'solar')
    const defDir = Path.join(absWork, 'def')

    // Copy solar fixtures to output dir (generation reads and updates in-place)
    copyDirSync(Path.join(absFixtures, 'solar'), solarOut)

    // Copy def files
    copyDirSync(Path.join(absFixtures, 'def'), defDir)

    // Copy model files into a node_modules-like structure so that aontu's
    // pkg resolver can find @"@voxgig/apidef/model/*.jsonic" references.
    // This is needed for standalone executables where the bundled require.resolve()
    // cannot resolve arbitrary filesystem paths.
    const modelSrc = Path.resolve(absFixtures, '..', '..', 'model')
    const modelDest = Path.join(absWork, 'node_modules', '@voxgig', 'apidef', 'model')
    if (Fs.existsSync(modelSrc)) {
      copyDirSync(modelSrc, modelDest)
    }

    const outprefix = 'solar-1.0.0-openapi-3.0.0-'

    const build = await ApiDef.makeBuild({
      folder: solarOut,
      debug: 'warn',
      outprefix,
    })

    // Full build: parse, guide, transformers, builders, generate
    const bres = await build(
      {
        name: 'solar',
        def: outprefix + 'def.yaml'
      },
      {
        spec: {
          base: solarOut,
          buildargs: {
            apidef: {
              ctrl: {
                step: {
                  parse: true,
                  guide: true,
                  transformers: true,
                  builders: true,
                  generate: true,
                }
              }
            }
          }
        }
      },
      {}
    )

    // Validate guide correctness against expected structure
    const correctness = validateGuide(bres.guide)

    // Write results summary
    const summary = {
      ok: bres.ok,
      steps: bres.steps,
      hasGuide: !!bres.guide,
      entityCount: bres.guide?.metrics?.count?.entity,
      pathCount: bres.guide?.metrics?.count?.path,
      methodCount: bres.guide?.metrics?.count?.method,
      correctness,
    }

    console.log(JSON.stringify(summary, null, 2))

    // Write the guide as JSON for comparison
    Fs.writeFileSync(
      Path.join(solarOut, 'guide.json'),
      JSON.stringify(bres.guide, null, 2)
    )

    // Write the apimodel as JSON for comparison
    if (bres.apimodel) {
      Fs.writeFileSync(
        Path.join(solarOut, 'apimodel.json'),
        JSON.stringify(bres.apimodel, null, 2)
      )
    }

    // Collect all generated output files for comparison
    const outputFiles = collectFiles(solarOut)
    Fs.writeFileSync(
      Path.join(solarOut, 'manifest.json'),
      JSON.stringify(outputFiles.sort(), null, 2)
    )

    if (!bres.ok) {
      console.error('Build failed:', bres.err?.message || 'unknown error')
      process.exit(1)
    }

    if (correctness.errors.length > 0) {
      console.error('Correctness check FAILED:')
      for (const err of correctness.errors) {
        console.error('  ' + err)
      }
      process.exit(1)
    }

    // Write correctness result for external comparison
    Fs.writeFileSync(
      Path.join(solarOut, 'correctness.json'),
      JSON.stringify(correctness, null, 2)
    )

    console.log('Test completed successfully')
    process.exit(0)
  }
  catch (err) {
    console.error('Test error:', err.message)
    console.error(err.stack)
    process.exit(1)
  }
}


function collectFiles(dir, base) {
  base = base || dir
  const files = []
  for (const entry of Fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = Path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === '.jostraca') continue
      files.push(...collectFiles(fullPath, base))
    } else {
      files.push(Path.relative(base, fullPath))
    }
  }
  return files
}


// Validate guide output against the expected solar guide structure.
// This mirrors the SOLAR_GUIDE assertion from test/apidef.test.ts,
// ensuring correctness is checked in every runtime (Node, Bun, SEA, Deno).
function validateGuide(guide) {
  const errors = []

  function check(path, actual, expected) {
    if (expected === null || expected === undefined) return
    if (typeof expected === 'object' && !Array.isArray(expected)) {
      if (typeof actual !== 'object' || actual === null) {
        errors.push(path + ': expected object, got ' + typeof actual)
        return
      }
      for (const key of Object.keys(expected)) {
        check(path + '.' + key, actual[key], expected[key])
      }
    } else {
      if (actual !== expected) {
        errors.push(path + ': expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual))
      }
    }
  }

  if (!guide) {
    return { ok: false, errors: ['guide is missing'] }
  }

  check('guide', guide, EXPECTED_GUIDE)

  return { ok: errors.length === 0, errors }
}


// Expected guide structure for the full pipeline (all 5 steps).
// Adapted from test/apidef.test.ts SOLAR_GUIDE which tests guide-only output.
// In the full pipeline, rename.param is consumed by transformers/builders,
// so rename becomes {} in the final output.
// Uses deep-contains semantics: only specified keys are checked.
const EXPECTED_GUIDE = {
  entity: {
    moon: {
      path: {
        '/api/planet/{planet_id}/moon': {
          op: {
            create: { method: 'POST' },
            list: { method: 'GET' }
          }
        },
        '/api/planet/{planet_id}/moon/{moon_id}': {
          op: {
            load: { method: 'GET' },
            remove: { method: 'DELETE' },
            update: { method: 'PUT' }
          }
        }
      },
      name: 'moon'
    },
    planet: {
      path: {
        '/api/planet': {
          op: {
            create: { method: 'POST' },
            list: { method: 'GET' }
          }
        },
        '/api/planet/{planet_id}': {
          op: {
            load: { method: 'GET' },
            remove: { method: 'DELETE' },
            update: { method: 'PUT' }
          }
        },
        '/api/planet/{planet_id}/forbid': {
          action: { forbid: {} },
          op: { create: { method: 'POST' } }
        },
        '/api/planet/{planet_id}/terraform': {
          action: { terraform: {} },
          op: { create: { method: 'POST' } }
        }
      },
      name: 'planet'
    }
  },
  metrics: { count: { entity: 2, path: 6, method: 12 } }
}


function copyDirSync(src, dest) {
  Fs.mkdirSync(dest, { recursive: true })
  for (const entry of Fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = Path.join(src, entry.name)
    const destPath = Path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath)
    } else {
      Fs.copyFileSync(srcPath, destPath)
    }
  }
}

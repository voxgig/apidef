#!/bin/bash
# Master test script: builds executables, runs them, compares output.
#
# Creates reference output using Node.js, then tests each executable
# approach against it. Compares jsonic, json, and aontu output files.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
WORK_DIR="$SCRIPT_DIR/work"
FIXTURE_DIR="$SCRIPT_DIR"

rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR"

PASS=0
FAIL=0
SKIP=0

report() {
  local status="$1" name="$2" detail="${3:-}"
  if [ "$status" = "PASS" ]; then
    echo "  PASS: $name${detail:+ ($detail)}"
    PASS=$((PASS + 1))
  elif [ "$status" = "FAIL" ]; then
    echo "  FAIL: $name${detail:+ ($detail)}"
    FAIL=$((FAIL + 1))
  else
    echo "  SKIP: $name${detail:+ ($detail)}"
    SKIP=$((SKIP + 1))
  fi
}

compare_outputs() {
  local label="$1" ref_dir="$2" test_dir="$3"

  if [ ! -d "$test_dir" ]; then
    report "FAIL" "$label: output directory" "not found: $test_dir"
    return
  fi

  # Compare manifest (list of files)
  if [ -f "$ref_dir/manifest.json" ] && [ -f "$test_dir/manifest.json" ]; then
    if diff -q "$ref_dir/manifest.json" "$test_dir/manifest.json" > /dev/null 2>&1; then
      report "PASS" "$label: file manifest matches"
    else
      report "FAIL" "$label: file manifest differs"
      diff "$ref_dir/manifest.json" "$test_dir/manifest.json" || true
    fi
  else
    report "FAIL" "$label: manifest.json" "missing"
  fi

  # Compare guide.json
  if [ -f "$ref_dir/guide.json" ] && [ -f "$test_dir/guide.json" ]; then
    if diff -q "$ref_dir/guide.json" "$test_dir/guide.json" > /dev/null 2>&1; then
      report "PASS" "$label: guide.json matches"
    else
      report "FAIL" "$label: guide.json differs"
      diff "$ref_dir/guide.json" "$test_dir/guide.json" | head -30 || true
    fi
  else
    report "FAIL" "$label: guide.json" "missing"
  fi

  # Compare apimodel.json
  if [ -f "$ref_dir/apimodel.json" ] && [ -f "$test_dir/apimodel.json" ]; then
    if diff -q "$ref_dir/apimodel.json" "$test_dir/apimodel.json" > /dev/null 2>&1; then
      report "PASS" "$label: apimodel.json matches"
    else
      report "FAIL" "$label: apimodel.json differs"
      diff "$ref_dir/apimodel.json" "$test_dir/apimodel.json" | head -30 || true
    fi
  else
    report "FAIL" "$label: apimodel.json" "missing"
  fi

  # Check correctness (guide validated against expected structure)
  if [ -f "$test_dir/correctness.json" ]; then
    local correct
    correct=$(cat "$test_dir/correctness.json" | grep -o '"ok": *[a-z]*' | grep -o '[a-z]*$')
    if [ "$correct" = "true" ]; then
      report "PASS" "$label: guide correctness"
    else
      report "FAIL" "$label: guide correctness"
      cat "$test_dir/correctness.json" | head -20
    fi
  else
    report "FAIL" "$label: correctness.json" "missing"
  fi

  # Compare all .jsonic files
  local jsonic_pass=0
  local jsonic_fail=0
  while IFS= read -r file; do
    if [[ "$file" == *.jsonic ]]; then
      if [ -f "$test_dir/$file" ]; then
        if diff -q "$ref_dir/$file" "$test_dir/$file" > /dev/null 2>&1; then
          jsonic_pass=$((jsonic_pass + 1))
        else
          jsonic_fail=$((jsonic_fail + 1))
          echo "    DIFF in $file:"
          diff "$ref_dir/$file" "$test_dir/$file" | head -10 || true
        fi
      else
        jsonic_fail=$((jsonic_fail + 1))
        echo "    MISSING: $file"
      fi
    fi
  done < <(cat "$ref_dir/manifest.json" | grep -o '"[^"]*"' | tr -d '"')

  if [ $jsonic_fail -eq 0 ] && [ $jsonic_pass -gt 0 ]; then
    report "PASS" "$label: all $jsonic_pass .jsonic files match"
  elif [ $jsonic_fail -gt 0 ]; then
    report "FAIL" "$label: $jsonic_fail/$((jsonic_pass + jsonic_fail)) .jsonic files differ"
  fi
}


# ============================================================
echo "=== Step 1: Generate reference output (Node.js) ==="
# ============================================================

REF_DIR="$WORK_DIR/ref"
mkdir -p "$REF_DIR"

node "$SCRIPT_DIR/run-test.js" "$FIXTURE_DIR" "$REF_DIR" 2>/dev/null
REF_EXIT=$?
if [ $REF_EXIT -ne 0 ]; then
  echo "FATAL: Reference generation failed (exit $REF_EXIT)"
  echo "Re-running with stderr to diagnose:"
  node "$SCRIPT_DIR/run-test.js" "$FIXTURE_DIR" "$REF_DIR" 2>&1 || true
  exit 1
fi

echo "Reference output generated. Files:"
cat "$REF_DIR/solar/manifest.json"
echo ""

# Validate reference correctness
if [ -f "$REF_DIR/solar/correctness.json" ]; then
  REF_CORRECT=$(cat "$REF_DIR/solar/correctness.json" | grep -o '"ok": *[a-z]*' | grep -o '[a-z]*$')
  if [ "$REF_CORRECT" = "true" ]; then
    report "PASS" "Reference: guide correctness"
  else
    report "FAIL" "Reference: guide correctness"
    echo "  Correctness errors:"
    cat "$REF_DIR/solar/correctness.json"
    exit 1
  fi
else
  report "FAIL" "Reference: correctness.json" "missing"
  exit 1
fi


# ============================================================
echo ""
echo "=== Step 2: Build and test Bun executable ==="
# ============================================================

BUN_DIR="$WORK_DIR/bun"
BUN_OUT="$BUN_DIR/output"
BUN_EXE="$BUN_DIR/test-runner"
mkdir -p "$BUN_DIR" "$BUN_OUT"

if command -v bun &> /dev/null; then
  echo "Building Bun test executable..."

  bun build "$SCRIPT_DIR/run-test.js" \
    --compile \
    --outfile "$BUN_EXE" \
    2>&1 | grep -v "^$"

  if [ -f "$BUN_EXE" ]; then
    ls -lh "$BUN_EXE"
    echo "Running Bun executable..."
    "$BUN_EXE" "$FIXTURE_DIR" "$BUN_OUT" 2>/dev/null
    BUN_EXIT=$?

    if [ $BUN_EXIT -eq 0 ]; then
      report "PASS" "Bun: build + execute"
    else
      report "FAIL" "Bun: build + execute" "exit code $BUN_EXIT"
      echo "  Re-running with stderr:"
      "$BUN_EXE" "$FIXTURE_DIR" "$BUN_OUT-retry" 2>&1 || true
    fi

    # Compare outputs
    compare_outputs "Bun" "$REF_DIR/solar" "$BUN_OUT/solar"
  else
    report "FAIL" "Bun: compile" "executable not produced"
  fi
else
  report "SKIP" "Bun" "bun not installed"
fi


# ============================================================
echo ""
echo "=== Step 3: Build and test Node.js SEA executable ==="
# ============================================================

SEA_DIR="$WORK_DIR/node-sea"
SEA_OUT="$SEA_DIR/output"
SEA_EXE="$SEA_DIR/test-runner"
mkdir -p "$SEA_DIR" "$SEA_OUT"

echo "Bundling with esbuild..."
npx esbuild "$SCRIPT_DIR/run-test.js" \
  --bundle \
  --platform=node \
  --target=node20 \
  --format=cjs \
  --outfile="$SEA_DIR/sea-prep.js" \
  --external:fsevents \
  2>&1

if [ -f "$SEA_DIR/sea-prep.js" ]; then
  BUNDLE_SIZE=$(wc -c < "$SEA_DIR/sea-prep.js")
  echo "Bundle size: $BUNDLE_SIZE bytes"

  echo "Generating SEA blob..."
  cat > "$SEA_DIR/sea-config.json" << SEACONF
{
  "main": "$SEA_DIR/sea-prep.js",
  "output": "$SEA_DIR/sea-prep.blob",
  "disableExperimentalSEAWarning": true
}
SEACONF

  node --experimental-sea-config "$SEA_DIR/sea-config.json" 2>&1

  if [ -f "$SEA_DIR/sea-prep.blob" ]; then
    echo "Injecting into node binary..."
    cp "$(which node)" "$SEA_EXE"
    npx postject "$SEA_EXE" NODE_SEA_BLOB "$SEA_DIR/sea-prep.blob" \
      --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 \
      2>&1

    if [ -f "$SEA_EXE" ]; then
      ls -lh "$SEA_EXE"
      echo "Running Node SEA executable..."
      "$SEA_EXE" "$FIXTURE_DIR" "$SEA_OUT" 2>/dev/null
      SEA_EXIT=$?

      if [ $SEA_EXIT -eq 0 ]; then
        report "PASS" "Node SEA: build + execute"
      else
        report "FAIL" "Node SEA: build + execute" "exit code $SEA_EXIT"
        echo "  Re-running with stderr:"
        "$SEA_EXE" "$FIXTURE_DIR" "$SEA_OUT-retry" 2>&1 || true
      fi

      # Compare outputs
      compare_outputs "Node SEA" "$REF_DIR/solar" "$SEA_OUT/solar"
    else
      report "FAIL" "Node SEA: inject" "executable not produced"
    fi
  else
    report "FAIL" "Node SEA: blob" "blob not produced"
  fi
else
  report "FAIL" "Node SEA: bundle" "bundle not produced"
fi


# ============================================================
echo ""
echo "=== Step 4: Test Deno compile ==="
# ============================================================

if command -v deno &> /dev/null; then
  DENO_DIR="$WORK_DIR/deno"
  DENO_OUT="$DENO_DIR/output"
  DENO_EXE="$DENO_DIR/test-runner"
  mkdir -p "$DENO_DIR" "$DENO_OUT"

  echo "Bundling with esbuild for Deno..."
  cd "$REPO_ROOT"

  npx esbuild "$SCRIPT_DIR/run-test.js" \
    --bundle \
    --platform=node \
    --target=esnext \
    --outfile="$DENO_DIR/deno-bundle.js" \
    2>&1

  # If DENO_CERT is not set, try common CA bundle locations
  if [ -z "${DENO_CERT:-}" ]; then
    for ca in /etc/ssl/certs/ca-certificates.crt /etc/pki/tls/certs/ca-bundle.crt; do
      if [ -f "$ca" ]; then
        export DENO_CERT="$ca"
        break
      fi
    done
  fi

  echo "Compiling with Deno..."
  deno compile \
    --no-check \
    --allow-read --allow-write --allow-env --allow-net --allow-sys \
    --unstable-detect-cjs \
    --output "$DENO_EXE" \
    "$DENO_DIR/deno-bundle.js" \
    2>&1

  if [ -f "$DENO_EXE" ]; then
    ls -lh "$DENO_EXE"
    echo "Running Deno executable..."
    "$DENO_EXE" "$FIXTURE_DIR" "$DENO_OUT" 2>/dev/null
    DENO_EXIT=$?

    if [ $DENO_EXIT -eq 0 ]; then
      report "PASS" "Deno: build + execute"
    else
      report "FAIL" "Deno: build + execute" "exit code $DENO_EXIT"
    fi

    compare_outputs "Deno" "$REF_DIR/solar" "$DENO_OUT/solar"
  else
    report "FAIL" "Deno: compile" "executable not produced"
  fi
else
  report "SKIP" "Deno" "deno not installed"
fi


# ============================================================
echo ""
echo "============================================"
echo "=== FINAL RESULTS ==="
echo "============================================"
echo "  PASS: $PASS"
echo "  FAIL: $FAIL"
echo "  SKIP: $SKIP"
echo ""

if [ $FAIL -gt 0 ]; then
  exit 1
fi
exit 0

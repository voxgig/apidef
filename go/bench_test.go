/* Copyright (c) 2025 Voxgig Ltd, MIT License */

// Benchmark harness mirroring v1/test/bench.ts.
// Runs each case in parse-only and full configurations, reports min-of-N
// timings, and enforces a 30s per-case timeout. Run with:
//
//	go test -tags bench -run TestBenchModelCase -timeout=20m -v ./...
package apidef

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"
)

type benchCase struct {
	Name    string
	Version string
	Spec    string
	Format  string
}

var benchCases = []benchCase{
	{"solar", "1.0.0", "openapi-3.0.0", "yaml"},
	{"petstore", "1.0.7", "swagger-2.0", "json"},
	{"taxonomy", "1.0.0", "openapi-3.1.0", "yaml"},
	{"foo", "1.0.0", "openapi-3.1.0", "yaml"},
	{"learnworlds", "2", "openapi-3.1.0", "yaml"},
	{"statuspage", "1.0.0", "openapi-3.0.0", "json"},
	{"contentfulcma", "1.0.0", "openapi-3.0.0", "yaml"},
	{"cloudsmith", "v1", "swagger-2.0", "json"},
	{"pokeapi", "20220523", "openapi-3.0.0", "yaml"},
	{"dingconnect", "v1", "swagger-2.0", "json"},
	{"codatplatform", "3.0.0", "openapi-3.1.0", "yaml"},
	{"shortcut", "v3", "openapi-3.0.0", "json"},
	{"github", "1.1.4", "openapi-3.0.3", "yaml"},
	{"gitlab", "v4", "swagger-2.0", "yaml"},
}

func benchCaseName(c benchCase) string {
	return fmt.Sprintf("%s-%s-%s", c.Name, c.Version, c.Spec)
}

// runOnce performs a single Generate run with the given step config.
// Returns elapsed wall-clock duration. If the run exceeds budget, returns
// (budget, errTimeout). The Generate call is synchronous, so a true cancel
// is not possible — we instead let it complete but flag the overrun.
func runOnce(validateDir string, c benchCase, step map[string]any, budget time.Duration) (time.Duration, error) {
	cn := benchCaseName(c)
	tmp, err := os.MkdirTemp("", "apidef-bench-")
	if err != nil {
		return 0, err
	}
	defer os.RemoveAll(tmp)

	apidef := NewApiDef(ApiDefOptions{
		Folder:    tmp,
		OutPrefix: cn + "-",
		Strategy:  "heuristic01",
	})

	type outcome struct {
		dur time.Duration
		err error
		ok  bool
	}
	done := make(chan outcome, 1)
	t0 := time.Now()
	go func() {
		res, err := apidef.Generate(map[string]any{
			"model": map[string]any{"name": c.Name, "def": cn + "." + c.Format},
			"build": map[string]any{"spec": map[string]any{"base": validateDir}},
			"ctrl":  map[string]any{"step": step},
		})
		ok := res != nil && res.OK
		// For parse-only configs the apidef pipeline returns OK=false but the
		// parse step still ran; treat presence of "parse" in steps as success.
		if res != nil {
			for _, s := range res.Steps {
				if s == "parse" {
					ok = true
					break
				}
			}
		}
		done <- outcome{time.Since(t0), err, ok}
	}()

	select {
	case o := <-done:
		if o.err != nil {
			return o.dur, o.err
		}
		if !o.ok {
			return o.dur, fmt.Errorf("build did not produce parse step")
		}
		return o.dur, nil
	case <-time.After(budget):
		// Wait for the goroutine to actually finish so we don't leak it,
		// but report the timeout. Cap the extra wait.
		select {
		case <-done:
		case <-time.After(5 * time.Second):
		}
		return budget, fmt.Errorf("timeout after %s", budget)
	}
}

func minDur(ds []time.Duration) time.Duration {
	if len(ds) == 0 {
		return 0
	}
	m := ds[0]
	for _, d := range ds[1:] {
		if d < m {
			m = d
		}
	}
	return m
}

func TestBenchModelCase(t *testing.T) {
	if os.Getenv("BENCH") == "" {
		t.Skip("set BENCH=1 to run benchmark")
	}

	validateDir := os.Getenv("APIDEF_VALIDATE_DIR")
	if validateDir == "" {
		validateDir = filepath.Join("..", "..", "apidef-validate", "v1")
	}
	defDir := filepath.Join(validateDir, "..", "def")

	cases := benchCases
	if sel := os.Getenv("BENCH_CASE"); sel != "" {
		var filtered []benchCase
		want := strings.Split(sel, ",")
		for _, c := range cases {
			for _, w := range want {
				if strings.Contains(c.Name, strings.TrimSpace(w)) {
					filtered = append(filtered, c)
					break
				}
			}
		}
		cases = filtered
	}

	reps := 3
	if r := os.Getenv("BENCH_REPS"); r != "" {
		fmt.Sscanf(r, "%d", &reps)
	}

	parseOnly := map[string]any{
		"parse": true, "guide": false, "transformers": false, "builders": false, "generate": false,
	}
	full := map[string]any{
		"parse": true, "guide": true, "transformers": true, "builders": true, "generate": true,
	}

	const budget = 30 * time.Second

	type row struct {
		name     string
		parseMs  int64
		modelMs  int64
		totalMs  int64
		parseErr string
		fullErr  string
	}
	var rows []row

	for _, c := range cases {
		cn := benchCaseName(c)
		defFile := filepath.Join(defDir, cn+"."+c.Format)
		if _, err := os.Stat(defFile); os.IsNotExist(err) {
			t.Logf("SKIP %s (no def: %s)", cn, defFile)
			continue
		}
		t.Logf("benchmark: %s", cn)

		// Warm-up (best-effort).
		if _, err := runOnce(validateDir, c, full, budget); err != nil {
			t.Logf("  warmup error: %v", err)
		}

		var parseRuns, fullRuns []time.Duration
		var parseErrStr, fullErrStr string
		for i := 0; i < reps; i++ {
			d, err := runOnce(validateDir, c, parseOnly, budget)
			if err != nil {
				parseErrStr = err.Error()
				parseRuns = append(parseRuns, d)
				if strings.HasPrefix(parseErrStr, "timeout") {
					break
				}
			} else {
				parseRuns = append(parseRuns, d)
			}
		}
		for i := 0; i < reps; i++ {
			d, err := runOnce(validateDir, c, full, budget)
			if err != nil {
				fullErrStr = err.Error()
				fullRuns = append(fullRuns, d)
				if strings.HasPrefix(fullErrStr, "timeout") {
					break
				}
			} else {
				fullRuns = append(fullRuns, d)
			}
		}

		parseMin := minDur(parseRuns).Milliseconds()
		fullMin := minDur(fullRuns).Milliseconds()
		modelMs := fullMin - parseMin
		if modelMs < 0 {
			modelMs = 0
		}
		rows = append(rows, row{cn, parseMin, modelMs, fullMin, parseErrStr, fullErrStr})
	}

	// Sort rows in original case order.
	sort.SliceStable(rows, func(i, j int) bool { return false })

	caseW := 4
	for _, r := range rows {
		if len(r.name) > caseW {
			caseW = len(r.name)
		}
	}

	fmt.Println()
	fmt.Printf("%-*s  %10s  %10s  %10s  notes\n", caseW, "case", "parse(ms)", "model(ms)", "total(ms)")
	sep := strings.Repeat("-", caseW) + "  " + strings.Repeat("-", 10) + "  " + strings.Repeat("-", 10) + "  " + strings.Repeat("-", 10)
	fmt.Println(sep)
	var pSum, mSum, tSum int64
	for _, r := range rows {
		notes := ""
		if r.parseErr != "" {
			notes += "parse: " + r.parseErr
		}
		if r.fullErr != "" {
			if notes != "" {
				notes += "; "
			}
			notes += "full: " + r.fullErr
		}
		fmt.Printf("%-*s  %10d  %10d  %10d  %s\n", caseW, r.name, r.parseMs, r.modelMs, r.totalMs, notes)
		pSum += r.parseMs
		mSum += r.modelMs
		tSum += r.totalMs
	}
	fmt.Println(sep)
	fmt.Printf("%-*s  %10d  %10d  %10d\n", caseW, "TOTAL", pSum, mSum, tSum)
}

/* Copyright (c) 2026 Voxgig, MIT License */

package apidef

import (
	"reflect"
	"sort"
	"strconv"
	"strings"
)

const refCountCap int64 = 1_000_000_000

const refCountRoot = "\x01ROOT"

var refKeyEscaper = strings.NewReplacer("\x00", "\x01\x01", "\x01", "\x01\x02")

type refNodeID struct {
	ptr uintptr
	len int
}

func refSatAdd(a, b int64) int64 {
	if a+b < refCountCap {
		return a + b
	}
	return refCountCap
}

func refSatMul(a, w int64) int64 {
	if 0 == a || 0 == w {
		return 0
	}
	if a > refCountCap/w {
		return refCountCap
	}
	return a * w
}

func refIsNode(v any) bool {
	switch v.(type) {
	case map[string]any, []any:
		return true
	}
	return false
}

// An empty slice has no identity: every one may share the zero-size allocation.
func refIdentity(v any) (refNodeID, bool) {
	switch n := v.(type) {
	case map[string]any:
		return refNodeID{reflect.ValueOf(n).Pointer(), -1}, true
	case []any:
		if 0 < len(n) {
			return refNodeID{reflect.ValueOf(n).Pointer(), len(n)}, true
		}
	}
	return refNodeID{}, false
}

func refLabel(v any) (string, bool) {
	m, ok := v.(map[string]any)
	if !ok {
		return "", false
	}
	if x, ok := m["x-ref"].(string); ok {
		return x, true
	}
	if _, has := m["x-ref"]; !has {
		if r, ok := m["$ref"].(string); ok {
			return r, true
		}
	}
	return "", false
}

func refKid(node any, key string) (any, bool) {
	switch n := node.(type) {
	case map[string]any:
		v, ok := n[key]
		return v, ok
	case []any:
		i, err := strconv.Atoi(key)
		if err != nil || i < 0 || i >= len(n) || strconv.Itoa(i) != key {
			return nil, false
		}
		return n[i], true
	}
	return nil, false
}

func refKidKeys(node any) []string {
	switch n := node.(type) {
	case map[string]any:
		return sortedKeys(n)
	case []any:
		keys := make([]string, len(n))
		for i := range n {
			keys[i] = strconv.Itoa(i)
		}
		return keys
	}
	return nil
}

// Parts join on NUL. Escaping NUL and \x01 keeps keys injective and in part
// order, and an escape never puts 'R' after \x01, so no key equals refCountRoot.
func refNodeKey(label string, over []string) string {
	parts := make([]string, 0, 1+len(over))
	parts = append(parts, refKeyEscaper.Replace(label))
	for _, k := range over {
		parts = append(parts, refKeyEscaper.Replace(k))
	}
	return strings.Join(parts, "\x00")
}

func refNonEmpty(v any) bool {
	switch n := v.(type) {
	case map[string]any:
		return 0 < len(n)
	case []any:
		return 0 < len(n)
	}
	return false
}

func refSame(a, b any) bool {
	if ia, ok := refIdentity(a); ok {
		if ib, ok := refIdentity(b); ok && ia == ib {
			return true
		}
	}
	la, ok := refLabel(a)
	if !ok {
		return false
	}
	lb, ok := refLabel(b)
	return ok && la == lb
}

// CountRefs counts the occurrences of each reference label per use, as if
// every reference were inlined, saturating at refCountCap.
func CountRefs(def map[string]any) map[string]int64 {
	targets := map[string]any{}
	target := func(label string) any {
		if t, ok := targets[label]; ok {
			return t
		}
		var t any
		if strings.HasPrefix(label, "#/") {
			t = def
			for _, raw := range strings.Split(label[2:], "/") {
				part := strings.ReplaceAll(strings.ReplaceAll(raw, "~1", "/"), "~0", "~")
				kid, ok := refKid(t, part)
				if !ok {
					t = nil
					break
				}
				t = kid
			}
			if !refIsNode(t) {
				t = nil
			}
		}
		targets[label] = t
		return t
	}

	labelOf := map[string]string{}
	skipOf := map[string]map[string]bool{}
	var found []string

	scan := func(start any, skip map[string]bool) map[string]int64 {
		body := map[string]int64{}
		expanded := map[refNodeID]bool{}
		var stack []any
		for _, k := range refKidKeys(start) {
			if "x-ref" != k && "$ref" != k && !skip[k] {
				kid, _ := refKid(start, k)
				stack = append(stack, kid)
			}
		}

		for 0 < len(stack) {
			v := stack[len(stack)-1]
			stack = stack[:len(stack)-1]
			if !refIsNode(v) {
				continue
			}

			label, ok := refLabel(v)
			if !ok {
				// Expanding a shared plain node once per scan is what ends a cycle of them.
				if id, ok := refIdentity(v); ok {
					if expanded[id] {
						continue
					}
					expanded[id] = true
				}
				for _, k := range refKidKeys(v) {
					kid, _ := refKid(v, k)
					stack = append(stack, kid)
				}
				continue
			}

			t := target(label)
			var over []string
			m := v.(map[string]any)
			for _, k := range sortedKeys(m) {
				if "x-ref" == k || "$ref" == k {
					continue
				}
				vk := m[k]
				if tk, has := refKid(t, k); has {
					if refSame(vk, tk) {
						continue
					}
					if refNonEmpty(tk) {
						over = append(over, k)
					}
				}
				stack = append(stack, vk)
			}
			sort.Strings(over)

			node := refNodeKey(label, over)
			if _, seen := labelOf[node]; !seen {
				labelOf[node] = label
				skipOf[node] = map[string]bool{}
				for _, k := range over {
					skipOf[node][k] = true
				}
				found = append(found, node)
			}
			body[node]++
		}

		return body
	}

	bodies := map[string]map[string]int64{refCountRoot: scan(def, nil)}
	for i := 0; i < len(found); i++ {
		node := found[i]
		if t := target(labelOf[node]); nil != t {
			bodies[node] = scan(t, skipOf[node])
		} else {
			bodies[node] = map[string]int64{}
		}
	}

	count := refCountPaths(bodies)

	out := map[string]int64{}
	for _, node := range found {
		label := labelOf[node]
		out[label] = refSatAdd(out[label], count[node])
	}
	return out
}

func refCountPaths(bodies map[string]map[string]int64) map[string]int64 {
	// Byte order is code-point order, so both ports cut the same edge of a cycle.
	successors := func(u string) []string {
		keys := make([]string, 0, len(bodies[u]))
		for v := range bodies[u] {
			keys = append(keys, v)
		}
		sort.Strings(keys)
		return keys
	}

	type frame struct {
		node string
		next []string
		i    int
	}

	onStack := map[string]bool{refCountRoot: true}
	finished := map[string]bool{}
	backEdges := map[string]map[string]bool{}
	var post []string

	stack := []*frame{{node: refCountRoot, next: successors(refCountRoot)}}
	for 0 < len(stack) {
		f := stack[len(stack)-1]
		if f.i < len(f.next) {
			v := f.next[f.i]
			f.i++
			if onStack[v] {
				if nil == backEdges[f.node] {
					backEdges[f.node] = map[string]bool{}
				}
				backEdges[f.node][v] = true
			} else if !finished[v] {
				onStack[v] = true
				stack = append(stack, &frame{node: v, next: successors(v)})
			}
			continue
		}
		stack = stack[:len(stack)-1]
		onStack[f.node] = false
		finished[f.node] = true
		post = append(post, f.node)
	}

	count := map[string]int64{refCountRoot: 1}
	for i := len(post) - 1; 0 <= i; i-- {
		u := post[i]
		cu := count[u]
		for v, w := range bodies[u] {
			if backEdges[u][v] {
				continue
			}
			count[v] = refSatAdd(count[v], refSatMul(cu, w))
		}
	}
	return count
}

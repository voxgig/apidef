package apidef

// The YAML parser copies an anchor's node in full for every alias, so nested
// aliases grow geometrically. This reads, from the text and before anything is
// parsed, the size the source reaches once every alias is copied in. It mirrors
// ts/src/yamlalias.ts byte for byte.

import "math"

const (
	yamlAliasFactor = 10
	yamlAliasFloor  = 1_000_000
)

type yamlAnchor struct {
	name       string
	start, end int
}

type yamlAlias struct {
	name   string
	at     int
	target *yamlAnchor
}

func yamlAliasLimit(src string) float64 {
	return math.Max(yamlAliasFloor, yamlAliasFactor*float64(len(src)))
}

// yamlAliasedSize counts bytes of UTF-8, as the TypeScript port does.
func yamlAliasedSize(src string) float64 {
	b := []byte(src)
	if !containsByte(b, '&') || !containsByte(b, '*') {
		return float64(len(b))
	}

	anchors, aliases := scanYamlNodes(b)
	if len(aliases) == 0 {
		return float64(len(b))
	}

	// An alias names the last anchor of its name before it.
	latest := map[string]*yamlAnchor{}
	ai := 0
	for _, alias := range aliases {
		for ai < len(anchors) && anchors[ai].start < alias.at {
			latest[anchors[ai].name] = anchors[ai]
			ai++
		}
		alias.target = latest[alias.name]
	}

	sizes := map[*yamlAnchor]float64{}
	open := map[*yamlAnchor]bool{}
	var size func(a *yamlAnchor) float64
	size = func(a *yamlAnchor) float64 {
		if known, ok := sizes[a]; ok {
			return known
		}
		if open[a] {
			return 0
		}
		open[a] = true
		n := float64(a.end - a.start)
		for x := firstAliasAt(aliases, a.start); x < len(aliases) && aliases[x].at < a.end; x++ {
			if t := aliases[x].target; t != nil {
				n += size(t)
			}
		}
		delete(open, a)
		sizes[a] = n
		return n
	}

	total := float64(len(b))
	for _, alias := range aliases {
		if alias.target != nil {
			total += size(alias.target)
		}
	}
	return total
}

func containsByte(b []byte, c byte) bool {
	for _, x := range b {
		if x == c {
			return true
		}
	}
	return false
}

// firstAliasAt is the index of the first alias at or after a byte offset.
func firstAliasAt(aliases []*yamlAlias, at int) int {
	lo, hi := 0, len(aliases)
	for lo < hi {
		mid := (lo + hi) >> 1
		if aliases[mid].at < at {
			lo = mid + 1
		} else {
			hi = mid
		}
	}
	return lo
}

func yamlIsSpace(c byte) bool { return c == ' ' || c == '\t' }
func yamlIsBreak(c byte) bool { return c == '\n' || c == '\r' }

// yamlIsGap is true past the end of the source, as an undefined byte is in TS.
func yamlIsGap(b []byte, i int) bool {
	return i < 0 || i >= len(b) || yamlIsSpace(b[i]) || yamlIsBreak(b[i])
}

type yamlBlockAnchor struct {
	anchor   *yamlAnchor
	indent   int
	afterKey bool
}

type yamlBracketAnchor struct {
	anchor *yamlAnchor
	depth  int
}

// scanYamlNodes finds anchors with the byte range of the node each labels,
// and aliases with where they stand. Comments, quoted strings and block
// scalars are skipped.
func scanYamlNodes(b []byte) ([]*yamlAnchor, []*yamlAlias) {
	var anchors []*yamlAnchor
	var aliases []*yamlAlias

	// A block node's anchor ends where a later line returns to its indent;
	// others end with their bracket or their line.
	var blockAnchors []yamlBlockAnchor
	var bracketAnchors []yamlBracketAnchor

	flow := 0
	blockIndent := -1
	lineIndent := 0
	lineBegin := 0
	scalarCol := 0
	keyCol := 0
	lineStart := true
	nodeStart := true
	afterKey := false
	i := 0
	n := len(b)

	for i < n {
		if lineStart {
			lineStart = false
			lineBegin = i
			j := yamlIndentEnd(b, i)
			blank := j >= n || yamlIsBreak(b[j]) || b[j] == '#'
			if blockIndent >= 0 && (blank || j-i > blockIndent) {
				i = yamlEndOfLine(b, i)
				continue
			}
			blockIndent = -1
			lineIndent = j - i
			if flow == 0 {
				nodeStart = true
				afterKey = false
			}
			i = j
			continue
		}

		c := b[i]
		switch {
		case c == '\n':
			lineStart = true
			i++
		case c == '\r' || yamlIsSpace(c):
			i++
		case c == '#' && yamlIsGap(b, i-1):
			i = yamlEndOfLine(b, i)
		case nodeStart && (c == '"' || c == '\''):
			scalarCol = i - lineBegin
			i = yamlEndOfQuoted(b, i)
			nodeStart = false
		case nodeStart && c == '*':
			end := yamlEndOfName(b, i+1)
			aliases = append(aliases, &yamlAlias{name: string(b[i+1 : end]), at: i})
			nodeStart = false
			i = end
		case nodeStart && c == '&':
			end := yamlEndOfName(b, i+1)
			anchor := &yamlAnchor{name: string(b[i+1 : end]), start: i, end: n}
			anchors = append(anchors, anchor)
			k := end
			for k < n && yamlIsSpace(b[k]) {
				k++
			}
			switch {
			case k >= n || yamlIsBreak(b[k]) || b[k] == '#':
				indent := lineIndent
				if afterKey {
					indent = keyCol
				}
				blockAnchors = append(blockAnchors, yamlBlockAnchor{anchor, indent, afterKey})
			case b[k] == '[' || b[k] == '{':
				bracketAnchors = append(bracketAnchors, yamlBracketAnchor{anchor, flow + 1})
			case flow > 0:
				anchor.end = yamlEndOfFlowScalar(b, k)
			default:
				anchor.end = yamlEndOfLine(b, k)
			}
			i = end
		case nodeStart && c == '!':
			i = yamlEndOfName(b, i+1)
		case nodeStart && flow == 0 && (c == '|' || c == '>'):
			blockIndent = lineIndent
			i = yamlEndOfLine(b, i)
		case c == '[' || c == '{':
			flow++
			nodeStart = true
			i++
		case c == ']' || c == '}':
			for x := len(bracketAnchors) - 1; x >= 0; x-- {
				if bracketAnchors[x].depth == flow {
					bracketAnchors[x].anchor.end = i + 1
					bracketAnchors = append(bracketAnchors[:x], bracketAnchors[x+1:]...)
				}
			}
			flow = max(0, flow-1)
			nodeStart = false
			i++
		case c == ',' && flow > 0:
			nodeStart = true
			i++
		case nodeStart && flow == 0 && (c == '-' || c == '?') && yamlIsGap(b, i+1):
			i++
		case c == ':' && (flow > 0 || yamlIsGap(b, i+1)):
			nodeStart = true
			afterKey = flow == 0
			keyCol = scalarCol
			i++
		default:
			if nodeStart {
				scalarCol = i - lineBegin
			}
			nodeStart = false
			i++
		}
	}

	for _, ba := range blockAnchors {
		ba.anchor.end = yamlBlockEnd(b, yamlEndOfLine(b, ba.anchor.start), ba.indent, ba.afterKey)
	}

	return anchors, aliases
}

// yamlBlockEnd is the first line after from that returns to indent; a compact
// sequence under a key may sit at the key's own indent.
func yamlBlockEnd(b []byte, from int, indent int, keyed bool) int {
	n := len(b)
	s := from
	for s < n {
		if b[s] == '\n' {
			s++
		} else {
			s = yamlEndOfLine(b, s) + 1
		}
		if s >= n {
			break
		}
		j := yamlIndentEnd(b, s)
		if j >= n || yamlIsBreak(b[j]) || b[j] == '#' {
			continue
		}
		d := j - s
		entry := b[j] == '-' && yamlIsGap(b, j+1)
		if d < indent || (d == indent && !(keyed && entry)) {
			return s
		}
	}
	return n
}

func yamlIndentEnd(b []byte, i int) int {
	for i < len(b) && b[i] == ' ' {
		i++
	}
	return i
}

func yamlEndOfLine(b []byte, i int) int {
	for i < len(b) && b[i] != '\n' {
		i++
	}
	return i
}

func yamlEndOfQuoted(b []byte, i int) int {
	q := b[i]
	i++
	for i < len(b) {
		switch {
		case q == '"' && b[i] == '\\':
			i += 2
		case b[i] == q && q == '\'' && i+1 < len(b) && b[i+1] == '\'':
			i += 2
		case b[i] == q:
			return i + 1
		default:
			i++
		}
	}
	return min(i, len(b))
}

func yamlEndOfName(b []byte, i int) int {
	for i < len(b) && !yamlIsGap(b, i) && b[i] != ',' && b[i] != '[' &&
		b[i] != ']' && b[i] != '{' && b[i] != '}' &&
		!(b[i] == ':' && yamlIsGap(b, i+1)) {
		i++
	}
	return i
}

func yamlEndOfFlowScalar(b []byte, i int) int {
	for i < len(b) && !yamlIsBreak(b[i]) && b[i] != ',' && b[i] != ']' && b[i] != '}' {
		i++
	}
	return i
}

/* Copyright (c) 2024-2025 Voxgig, MIT License */

package apidef

// CmpDesc holds component analysis information.
type CmpDesc struct {
	NameDesc   any     `json:"namedesc,omitempty"`
	PathRate   float64 `json:"path_rate"`
	MethodRate float64 `json:"method_rate"`
}

// MethodDesc is the detailed method analysis from heuristic processing.
type MethodDesc struct {
	Path         string         `json:"path"`
	Method       string         `json:"method"`
	Summary      string         `json:"summary"`
	OperationId  string         `json:"operationId,omitempty"`
	Tags         []string       `json:"tags"`
	Parameters   []any          `json:"parameters"`
	Responses    map[string]any `json:"responses"`
	RequestBody  map[string]any `json:"requestBody,omitempty"`
	MethodEntity *MethodEntityDesc `json:"MethodEntity,omitempty"`
}

// MethodEntityDesc describes method-entity relationships during analysis.
type MethodEntityDesc struct {
	Ref         string         `json:"ref"`
	Cmp         string         `json:"cmp,omitempty"`
	OrigCmp     string         `json:"origcmp,omitempty"`
	OrigCmpRef  string         `json:"origcmpref,omitempty"`
	WhyCmp      []string       `json:"why_cmp,omitempty"`
	CmpOccur    int            `json:"cmpoccur"`
	PathRate    float64        `json:"path_rate"`
	MethodRate  float64        `json:"method_rate"`
	EntName     string         `json:"entname"`
	WhyOp       []string       `json:"why_op,omitempty"`
	Rename      map[string]any `json:"rename,omitempty"`
	WhyRename   map[string]any `json:"why_rename,omitempty"`
	RenameOrig  []string       `json:"rename_orig,omitempty"`
	OpName      string         `json:"opname"`
	WhyOpName   []string       `json:"why_opname,omitempty"`
	PM          *PathMatchResult `json:"pm,omitempty"`
}

// EntityDesc holds entity analysis information.
type EntityDesc struct {
	Name     string                      `json:"name"`
	OrigName string                      `json:"origname"`
	Plural   string                      `json:"plural"`
	Path     map[string]*EntityPathDesc  `json:"path"`
	Alias    map[string]string           `json:"alias"`
	Cmp      CmpDesc                     `json:"cmp"`
}

// EntityPathDesc holds entity path analysis information.
type EntityPathDesc struct {
	Op         map[string]any            `json:"op"`
	PM         *PathMatchResult          `json:"pm,omitempty"`
	Rename     map[string]any            `json:"rename,omitempty"`
	WhyRename  map[string]any            `json:"why_rename,omitempty"`
	Action     map[string]any            `json:"action,omitempty"`
	WhyAction  map[string]any            `json:"why_action,omitempty"`
	WhyEnt     []string                  `json:"why_ent,omitempty"`
	WhyPath    []string                  `json:"why_path,omitempty"`
}

// PathDesc describes a path during transform processing.
type PathDesc struct {
	Orig   string         `json:"orig"`
	Method MethodName     `json:"method"`
	Parts  []string       `json:"parts"`
	Rename map[string]any `json:"rename,omitempty"`
	Op     map[string]any `json:"op,omitempty"`
	Def    map[string]any `json:"def,omitempty"`
}

// OpDesc aggregates paths for an operation.
type OpDesc struct {
	Paths []*PathDesc `json:"paths"`
}

// PathMatchResult holds the result of a path pattern match.
type PathMatchResult struct {
	Matches []string `json:"matches"`
	Index   int      `json:"index"`
	Expr    string   `json:"expr"`
	Path    string   `json:"path"`
}

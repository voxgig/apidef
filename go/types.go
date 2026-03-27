/* Copyright (c) 2024-2025 Voxgig, MIT License */

package apidef

// KIT is the central namespace constant for model structures.
const KIT = "kit"

// TypeName represents supported type names.
type TypeName = string

// ApiDefOptions holds configuration options for ApiDef.
type ApiDefOptions struct {
	Def       string         `json:"def,omitempty"`
	Fs        any            `json:"fs,omitempty"`
	Debug     any            `json:"debug,omitempty"`
	Folder    string         `json:"folder,omitempty"`
	Meta      map[string]any `json:"meta,omitempty"`
	OutPrefix string         `json:"outprefix,omitempty"`
	Strategy  string         `json:"strategy,omitempty"`
	Why       *WhyOptions    `json:"why,omitempty"`
}

// WhyOptions controls diagnostic output.
type WhyOptions struct {
	Show bool `json:"show,omitempty"`
}

// ApiDefResult holds the result of an API definition generation.
type ApiDefResult struct {
	OK       bool           `json:"ok"`
	Start    int64          `json:"start"`
	End      int64          `json:"end"`
	Steps    []string       `json:"steps"`
	Err      error          `json:"err,omitempty"`
	Ctrl     map[string]any `json:"ctrl,omitempty"`
	Guide    map[string]any `json:"guide,omitempty"`
	ApiModel map[string]any `json:"apimodel,omitempty"`
	Ctx      *ApiDefContext `json:"ctx,omitempty"`
}

// ApiDefContext holds the processing context during API definition generation.
type ApiDefContext struct {
	Log      Logger         `json:"-"`
	Spec     map[string]any `json:"spec,omitempty"`
	Opts     ApiDefOptions  `json:"opts"`
	DefPath  string         `json:"defpath"`
	Model    map[string]any `json:"model,omitempty"`
	ApiModel map[string]any `json:"apimodel,omitempty"`
	Guide    map[string]any `json:"guide,omitempty"`
	Def      map[string]any `json:"def,omitempty"`
	Note     map[string]any `json:"note,omitempty"`
	Warn     Warner         `json:"-"`
	Metrics  *Metrics       `json:"metrics,omitempty"`
	Work     map[string]any `json:"work,omitempty"`
}

// Metrics holds counters and found items during processing.
type Metrics struct {
	Count MetricsCount        `json:"count"`
	Found map[string]any      `json:"found"`
}

// MetricsCount holds metric counters.
type MetricsCount struct {
	Path         int            `json:"path"`
	Method       int            `json:"method"`
	OrigCmpRefs  map[string]int `json:"origcmprefs"`
	Cmp          int            `json:"cmp"`
	Tag          int            `json:"tag"`
	Entity       int            `json:"entity"`
}

// Guide represents the guide structure mapping API spec to SDK entities.
type Guide struct {
	Control  map[string]any            `json:"control"`
	Entity   map[string]*GuideEntity   `json:"entity"`
	Metrics  GuideMetrics              `json:"metrics"`
}

// GuideMetrics holds guide-level metrics.
type GuideMetrics struct {
	Count GuideMetricsCount  `json:"count"`
	Found map[string]any     `json:"found"`
}

// GuideMetricsCount holds guide metric counters.
type GuideMetricsCount struct {
	Path   int `json:"path"`
	Method int `json:"method"`
	Entity int `json:"entity"`
	Tag    int `json:"tag"`
	Cmp    int `json:"cmp"`
}

// GuideEntity represents an entity in the guide.
type GuideEntity struct {
	Name string                  `json:"name"`
	Orig string                  `json:"orig,omitempty"`
	Path map[string]*GuidePath   `json:"path"`
}

// GuidePath represents a path in the guide.
type GuidePath struct {
	WhyPath []string                          `json:"why_path,omitempty"`
	Action  map[string]*GuidePathAction       `json:"action,omitempty"`
	Rename  *GuidePathRename                  `json:"rename,omitempty"`
	Op      map[string]*GuidePathOp           `json:"op,omitempty"`
}

// GuidePathAction represents an action on a guide path.
type GuidePathAction struct {
	WhyAction []string `json:"why_action,omitempty"`
}

// GuidePathRename holds parameter rename mappings.
type GuidePathRename struct {
	Param map[string]*GuideRenameParam `json:"param,omitempty"`
}

// GuideRenameParam represents a parameter rename.
type GuideRenameParam struct {
	Target    string   `json:"target"`
	WhyRename []string `json:"why_rename,omitempty"`
}

// GuidePathOp represents an operation on a guide path.
type GuidePathOp struct {
	Method    string         `json:"method"`
	WhyOp     []string       `json:"why_op,omitempty"`
	Transform map[string]any `json:"transform,omitempty"`
}

// Logger is the logging interface used throughout apidef.
type Logger interface {
	Info(args ...any)
	Debug(args ...any)
	Warn(args ...any)
	Error(args ...any)
}

// Warner is a function that records warnings during processing.
type Warner interface {
	Warn(details map[string]any)
	History() []map[string]any
	Point() string
}

// TransformResult holds the result of a transform step.
type TransformResult struct {
	OK  bool   `json:"ok"`
	Msg string `json:"msg"`
	Err error  `json:"err,omitempty"`
}

// Transform is a function that transforms the context.
type Transform func(ctx *ApiDefContext) (*TransformResult, error)

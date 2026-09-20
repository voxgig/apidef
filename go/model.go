/* Copyright (c) 2024-2025 Voxgig, MIT License */

package apidef

// OpName represents the operation names available on entities.
type OpName = string

const (
	OpLoad    OpName = "load"
	OpList    OpName = "list"
	OpCreate  OpName = "create"
	OpUpdate  OpName = "update"
	OpRemove  OpName = "remove"
	OpPatch   OpName = "patch"
	OpHead    OpName = "head"
	OpOptions OpName = "options"
)

type MethodName = string

// ModelEntityRelations holds entity relationship information.
type ModelEntityRelations struct {
	Ancestors [][]string `json:"ancestors"`
}

// ModelOpMap maps operation names to their definitions.
type ModelOpMap map[OpName]*ModelOp

// ModelFieldOp holds field-specific operation configuration.
type ModelFieldOp struct {
	Type any  `json:"type"`
	Req  bool `json:"req"`
}

// ModelField represents an entity field definition.
type ModelField struct {
	Name       string                   `json:"n"`
	HumanTitle string                   `json:"h"`
	Type       any                      `json:"t"`
	Req        bool                     `json:"r"`
	Op         map[OpName]*ModelFieldOp `json:"op,omitempty"`

	Short string `json:"sh,omitempty"`

	ReadOnly   bool   `json:"ro,omitempty"`
	WriteOnly  bool   `json:"wo,omitempty"`
	Deprecated bool   `json:"de,omitempty"`
	Format     string `json:"fo,omitempty"`
}

// ModelArg represents an operation argument/parameter.
type ModelArg struct {
	Name    string `json:"n"`
	Orig    string `json:"or,omitempty"`
	Type    any    `json:"t"`
	Kind    string `json:"k"`
	Reqd    bool   `json:"r"`
	Example any    `json:"ex,omitempty"`
}

// ModelContract identifies the source operation.
type ModelContract struct {
	Version int    `json:"version"`
	ID      string `json:"id"`
	Source  string `json:"source"`
}

// ModelPoint represents a point implementation of an operation.
type ModelPoint struct {
	Live      any              `json:"li,omitempty"`
	Contract  *ModelContract   `json:"co,omitempty"`
	Orig      string           `json:"o"`
	Method    MethodName       `json:"m"`
	Segments  []map[string]any `json:"s"`
	Rename    map[string]any   `json:"r,omitempty"`
	Args      map[string]any   `json:"g,omitempty"`
	Transform map[string]any   `json:"t,omitempty"`
	Select    map[string]any   `json:"q,omitempty"`
}

type ModelOp struct {
	Name   OpName        `json:"name"`
	Points []*ModelPoint `json:"points"`
}

// ModelEntity represents an entity definition with operations and fields.
type ModelEntity struct {
	Name      string                 `json:"name"`
	Op        ModelOpMap             `json:"op"`
	Fields    map[string]*ModelField `json:"fields"`
	ID        *ModelEntityID         `json:"id,omitempty"`
	Relations ModelEntityRelations   `json:"relations"`
}

type ModelEntityID struct {
	Name  string   `json:"name"`
	Field string   `json:"field"`
	Parts []string `json:"parts,omitempty"`
	Sep   string   `json:"sep,omitempty"`

	From map[string]string `json:"from,omitempty"`
}

type ModelEntityFlow struct {
	Name   string                 `json:"name"`
	Entity string                 `json:"entity"`
	Kind   string                 `json:"kind"`
	Step   []*ModelEntityFlowStep `json:"step"`
}

// ModelEntityFlowStep represents a single flow step.
type ModelEntityFlowStep struct {
	Op    OpName           `json:"o"`
	Input map[string]any   `json:"i,omitempty"`
	Match map[string]any   `json:"m,omitempty"`
	Data  map[string]any   `json:"d,omitempty"`
	Spec  []map[string]any `json:"s,omitempty"`
	Valid []map[string]any `json:"v,omitempty"`
}

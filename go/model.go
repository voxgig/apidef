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

// MethodName represents HTTP method names.
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
	Name string                  `json:"name"`
	Type any                     `json:"type"`
	Req  bool                    `json:"req"`
	Op   map[OpName]*ModelFieldOp `json:"op,omitempty"`
}

// ModelArg represents an operation argument/parameter.
type ModelArg struct {
	Name string `json:"name"`
	Orig string `json:"orig"`
	Type any    `json:"type"`
	Kind string `json:"kind"`
	Reqd bool   `json:"reqd"`
}

// ModelTarget represents a point implementation of an operation.
type ModelTarget struct {
	Orig      string            `json:"orig"`
	Method    MethodName        `json:"method"`
	Parts     []string          `json:"parts"`
	Rename    map[string]any    `json:"rename,omitempty"`
	Args      map[string]any    `json:"args,omitempty"`
	Transform map[string]any    `json:"transform,omitempty"`
	Select    map[string]any    `json:"select,omitempty"`
}

// ModelOp represents an operation definition.
type ModelOp struct {
	Name   OpName         `json:"name"`
	Points []*ModelTarget `json:"points"`
}

// ModelEntity represents an entity definition with operations and fields.
type ModelEntity struct {
	Name      string               `json:"name"`
	Op        ModelOpMap            `json:"op"`
	Fields    []*ModelField         `json:"fields"`
	ID        map[string]string     `json:"id"`
	Relations ModelEntityRelations  `json:"relations"`
}

// ModelEntityFlow represents a flow definition.
type ModelEntityFlow struct {
	Name   string                 `json:"name"`
	Entity string                 `json:"entity"`
	Kind   string                 `json:"kind"`
	Step   []*ModelEntityFlowStep `json:"step"`
}

// ModelEntityFlowStep represents a single flow step.
type ModelEntityFlowStep struct {
	Op    OpName           `json:"op"`
	Input map[string]any   `json:"input,omitempty"`
	Match map[string]any   `json:"match,omitempty"`
	Data  map[string]any   `json:"data,omitempty"`
	Spec  []map[string]any `json:"spec,omitempty"`
	Valid []map[string]any `json:"valid,omitempty"`
}

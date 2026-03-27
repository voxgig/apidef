/* Copyright (c) 2024-2025 Voxgig, MIT License */

package apidef

// PathDef represents an OpenAPI/Swagger path object.
type PathDef struct {
	Summary     string         `json:"summary,omitempty"`
	Description string         `json:"description,omitempty"`
	Get         *MethodDef     `json:"get,omitempty"`
	Put         *MethodDef     `json:"put,omitempty"`
	Post        *MethodDef     `json:"post,omitempty"`
	Delete      *MethodDef     `json:"delete,omitempty"`
	Options     *MethodDef     `json:"options,omitempty"`
	Head        *MethodDef     `json:"head,omitempty"`
	Patch       *MethodDef     `json:"patch,omitempty"`
	Trace       *MethodDef     `json:"trace,omitempty"`
	Servers     []ServerDef    `json:"servers,omitempty"`
	Parameters  []ParameterDef `json:"parameters,omitempty"`
	Tags        any            `json:"tags,omitempty"`
}

// MethodDef represents an OpenAPI method definition.
type MethodDef struct {
	Tags        []string       `json:"tags,omitempty"`
	Summary     string         `json:"summary,omitempty"`
	Description string         `json:"description,omitempty"`
	OperationId string         `json:"operationId,omitempty"`
	Parameters  []ParameterDef `json:"parameters,omitempty"`
	Deprecated  bool           `json:"deprecated,omitempty"`
	Servers     []ServerDef    `json:"servers,omitempty"`
}

// ServerDef represents an OpenAPI server object.
type ServerDef struct {
	URL         string                       `json:"url"`
	Description string                       `json:"description,omitempty"`
	Variables   map[string]ServerVariableDef  `json:"variables,omitempty"`
}

// ServerVariableDef represents an OpenAPI server variable.
type ServerVariableDef struct {
	Enum        []string `json:"enum,omitempty"`
	Default     string   `json:"default"`
	Description string   `json:"description,omitempty"`
}

// ParameterDef represents an OpenAPI parameter object.
type ParameterDef struct {
	Name        string     `json:"name"`
	In          string     `json:"in"`
	Description string     `json:"description,omitempty"`
	Required    bool       `json:"required,omitempty"`
	Deprecated  bool       `json:"deprecated,omitempty"`
	Schema      *SchemaDef `json:"schema,omitempty"`
	Nullable    bool       `json:"nullable,omitempty"`
	Example     any        `json:"example,omitempty"`
}

// SchemaDef represents an OpenAPI schema object.
type SchemaDef struct {
	Title                string                `json:"title,omitempty"`
	Description          string                `json:"description,omitempty"`
	Type                 string                `json:"type,omitempty"`
	Format               string                `json:"format,omitempty"`
	Enum                 []any                 `json:"enum,omitempty"`
	Items                *SchemaDef            `json:"items,omitempty"`
	Properties           map[string]*SchemaDef `json:"properties,omitempty"`
	Required             []string              `json:"required,omitempty"`
	AdditionalProperties any                   `json:"additionalProperties,omitempty"`
	AllOf                []*SchemaDef          `json:"allOf,omitempty"`
	OneOf                []*SchemaDef          `json:"oneOf,omitempty"`
	AnyOf                []*SchemaDef          `json:"anyOf,omitempty"`
	Nullable             bool                  `json:"nullable,omitempty"`
	Default              any                   `json:"default,omitempty"`
	ExampleValue         any                   `json:"example,omitempty"`
}

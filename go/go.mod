module github.com/voxgig/apidef/go

go 1.24.7

require (
	github.com/jsonicjs/yaml/go v0.1.2
	github.com/voxgig/struct v0.1.0
	github.com/voxgig/util v0.1.0
	golang.org/x/text v0.21.0
)

require github.com/jsonicjs/jsonic/go v0.1.5 // indirect

replace (
	github.com/jsonicjs/jsonic/go v0.1.5 => ./.deps/jsonicjs-jsonic/go
	github.com/jsonicjs/yaml/go v0.1.2 => ./.deps/jsonicjs-yaml/go
	github.com/voxgig/struct v0.1.0 => ./.deps/voxgig-struct/go
	github.com/voxgig/util v0.1.0 => ./.deps/voxgig-util/go
)

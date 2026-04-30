module github.com/voxgig/apidef/go

go 1.24.7

require (
	github.com/jsonicjs/yaml/go v0.1.2
	github.com/voxgig/struct v0.1.0
	github.com/voxgig/util/go v0.1.1
	golang.org/x/text v0.21.0
)

require github.com/jsonicjs/jsonic/go v0.1.22 // indirect

replace (
	github.com/jsonicjs/jsonic/go v0.1.19 => /Users/richard/Projects/jsonicjs/jsonic/go
	github.com/jsonicjs/yaml/go v0.1.2 => /Users/richard/Projects/jsonicjs/yaml/go
	github.com/voxgig/struct v0.1.0 => /Users/richard/Projects/voxgig/struct/go
)

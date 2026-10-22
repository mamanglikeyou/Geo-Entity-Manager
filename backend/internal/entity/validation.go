package entity

import (
	"fmt"
	"maps"
	"math"
	"regexp"
	"slices"
	"strings"
	"unicode/utf8"
)

const (
	MaxNameLength           = 100
	MaxDescriptionLength    = 500
	MaxAttributes           = 20
	MaxAttributeKeyLength   = 50
	MaxAttributeValueLength = 200
)

var attributeKeyPattern = regexp.MustCompile(`^[A-Za-z0-9_-]+$`)

type FieldError struct {
	Field   string
	Message string
}

// ValidationError reports every invalid field at once, so a client can
// highlight all problems in a form instead of fixing them one at a time.
type ValidationError struct {
	Fields []FieldError
}

func (e *ValidationError) Error() string {
	parts := make([]string, len(e.Fields))
	for i, f := range e.Fields {
		parts[i] = f.Field + ": " + f.Message
	}
	return "validation failed: " + strings.Join(parts, "; ")
}

type fieldErrors []FieldError

func (fe *fieldErrors) add(field, format string, args ...any) {
	*fe = append(*fe, FieldError{Field: field, Message: fmt.Sprintf(format, args...)})
}

func (fe fieldErrors) err() error {
	if len(fe) == 0 {
		return nil
	}
	return &ValidationError{Fields: fe}
}

// normalize returns a copy of in with surrounding whitespace removed from
// free-text values and a non-nil attribute map.
func (in Input) normalize() Input {
	in.Name = strings.TrimSpace(in.Name)
	in.Description = strings.TrimSpace(in.Description)

	attrs := make(map[string]string, len(in.Attributes))
	for k, v := range in.Attributes {
		attrs[k] = strings.TrimSpace(v)
	}
	in.Attributes = attrs

	return in
}

func (in Input) validate() error {
	var errs fieldErrors

	switch n := utf8.RuneCountInString(in.Name); {
	case n == 0:
		errs.add("name", "is required")
	case n > MaxNameLength:
		errs.add("name", "must be at most %d characters", MaxNameLength)
	}

	switch {
	case in.Type == "":
		errs.add("type", "is required")
	case !in.Type.Valid():
		errs.add("type", "must be one of: %s", joinValues(allTypes))
	}

	switch {
	case in.Status == "":
		errs.add("status", "is required")
	case !in.Status.Valid():
		errs.add("status", "must be one of: %s", joinValues(allStatuses))
	}

	if utf8.RuneCountInString(in.Description) > MaxDescriptionLength {
		errs.add("description", "must be at most %d characters", MaxDescriptionLength)
	}

	validateAttributes(&errs, in.Attributes)
	validateCoordinate(&errs, "latitude", in.Location.Latitude, 90)
	validateCoordinate(&errs, "longitude", in.Location.Longitude, 180)

	return errs.err()
}

func validateAttributes(errs *fieldErrors, attrs map[string]string) {
	if len(attrs) > MaxAttributes {
		errs.add("attributes", "must have at most %d entries", MaxAttributes)
		return
	}

	// Iterate in key order so the reported errors are deterministic.
	for _, key := range slices.Sorted(maps.Keys(attrs)) {
		switch {
		case utf8.RuneCountInString(key) > MaxAttributeKeyLength:
			errs.add("attributes", "key %q must be at most %d characters", key, MaxAttributeKeyLength)
		case !attributeKeyPattern.MatchString(key):
			errs.add("attributes", "key %q may only contain letters, digits, '_' and '-'", key)
		case utf8.RuneCountInString(attrs[key]) > MaxAttributeValueLength:
			errs.add("attributes."+key, "must be at most %d characters", MaxAttributeValueLength)
		}
	}
}

func validateCoordinate(errs *fieldErrors, field string, v, limit float64) {
	switch {
	// NaN fails every comparison, so it would slip through the range check.
	case math.IsNaN(v) || math.IsInf(v, 0):
		errs.add(field, "must be a finite number")
	case v < -limit || v > limit:
		errs.add(field, "must be between %g and %g", -limit, limit)
	}
}

func joinValues[T ~string](values []T) string {
	s := make([]string, len(values))
	for i, v := range values {
		s[i] = string(v)
	}
	return strings.Join(s, ", ")
}

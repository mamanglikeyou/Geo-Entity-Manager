package entity

import (
	"strings"
	"unicode/utf8"
)

const (
	DefaultListLimit = 500
	MaxListLimit     = 1000
	MaxSearchLength  = 100
)

// BoundingBox is a rectangular map viewport. Boxes that cross the
// antimeridian (MinLongitude > MaxLongitude) are not supported.
type BoundingBox struct {
	MinLongitude float64
	MinLatitude  float64
	MaxLongitude float64
	MaxLatitude  float64
}

type ListFilter struct {
	Type   Type   // empty matches every type
	Status Status // empty matches every status
	Search string // case-insensitive substring of the name
	BBox   *BoundingBox
	Limit  int // 0 means DefaultListLimit
}

func (f ListFilter) normalize() ListFilter {
	f.Search = strings.TrimSpace(f.Search)
	if f.Limit == 0 {
		f.Limit = DefaultListLimit
	}
	return f
}

func (f ListFilter) validate() error {
	var errs fieldErrors

	if f.Type != "" && !f.Type.Valid() {
		errs.add("type", "must be one of: %s", joinValues(allTypes))
	}
	if f.Status != "" && !f.Status.Valid() {
		errs.add("status", "must be one of: %s", joinValues(allStatuses))
	}
	if utf8.RuneCountInString(f.Search) > MaxSearchLength {
		errs.add("search", "must be at most %d characters", MaxSearchLength)
	}
	if f.Limit < 1 || f.Limit > MaxListLimit {
		errs.add("limit", "must be between 1 and %d", MaxListLimit)
	}
	if f.BBox != nil {
		f.BBox.validate(&errs)
	}

	return errs.err()
}

func (b BoundingBox) validate(errs *fieldErrors) {
	before := len(*errs)
	validateCoordinate(errs, "bbox", b.MinLongitude, 180)
	validateCoordinate(errs, "bbox", b.MinLatitude, 90)
	validateCoordinate(errs, "bbox", b.MaxLongitude, 180)
	validateCoordinate(errs, "bbox", b.MaxLatitude, 90)
	if len(*errs) > before {
		return
	}

	if b.MinLatitude > b.MaxLatitude {
		errs.add("bbox", "min latitude must not be greater than max latitude")
	}
	if b.MinLongitude > b.MaxLongitude {
		errs.add("bbox", "min longitude must not be greater than max longitude")
	}
}

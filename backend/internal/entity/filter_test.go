package entity

import (
	"math"
	"strings"
	"testing"
)

func TestListFilterValidation(t *testing.T) {
	jakarta := BoundingBox{MinLongitude: 106.6, MinLatitude: -6.4, MaxLongitude: 107.0, MaxLatitude: -6.0}

	tests := []struct {
		name       string
		filter     ListFilter
		wantFields []string
	}{
		{name: "empty filter", filter: ListFilter{}},
		{name: "all fields set", filter: ListFilter{
			Type: TypeFacility, Status: StatusOffline, Search: "depot", BBox: &jakarta, Limit: MaxListLimit,
		}},
		{name: "whole world", filter: ListFilter{
			BBox: &BoundingBox{MinLongitude: -180, MinLatitude: -90, MaxLongitude: 180, MaxLatitude: 90},
		}},

		{name: "unknown type", filter: ListFilter{Type: "boat"}, wantFields: []string{"type"}},
		{name: "unknown status", filter: ListFilter{Status: "broken"}, wantFields: []string{"status"}},
		{name: "search too long", filter: ListFilter{
			Search: strings.Repeat("a", MaxSearchLength+1),
		}, wantFields: []string{"search"}},
		{name: "negative limit", filter: ListFilter{Limit: -1}, wantFields: []string{"limit"}},
		{name: "limit too high", filter: ListFilter{Limit: MaxListLimit + 1}, wantFields: []string{"limit"}},
		{name: "bbox out of range", filter: ListFilter{
			BBox: &BoundingBox{MinLongitude: -181, MinLatitude: 0, MaxLongitude: 0, MaxLatitude: 0},
		}, wantFields: []string{"bbox"}},
		{name: "bbox with NaN", filter: ListFilter{
			BBox: &BoundingBox{MinLongitude: 0, MinLatitude: math.NaN(), MaxLongitude: 1, MaxLatitude: 1},
		}, wantFields: []string{"bbox"}},
		{name: "bbox latitudes inverted", filter: ListFilter{
			BBox: &BoundingBox{MinLongitude: 0, MinLatitude: 10, MaxLongitude: 1, MaxLatitude: 5},
		}, wantFields: []string{"bbox"}},
		{name: "bbox crossing the antimeridian", filter: ListFilter{
			BBox: &BoundingBox{MinLongitude: 170, MinLatitude: 0, MaxLongitude: -170, MaxLatitude: 1},
		}, wantFields: []string{"bbox"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.filter.normalize().validate()
			assertInvalidFields(t, err, tt.wantFields)
		})
	}
}

func TestListFilterNormalize(t *testing.T) {
	got := ListFilter{Search: "  depot "}.normalize()

	if got.Search != "depot" {
		t.Errorf("Search = %q, want %q", got.Search, "depot")
	}
	if got.Limit != DefaultListLimit {
		t.Errorf("Limit = %d, want %d", got.Limit, DefaultListLimit)
	}
}

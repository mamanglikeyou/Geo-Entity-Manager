package entity

import (
	"errors"
	"fmt"
	"math"
	"slices"
	"strings"
	"testing"
)

func validInput() Input {
	return Input{
		Name:        "Truck 01",
		Type:        TypeVehicle,
		Status:      StatusActive,
		Description: "Delivery truck for the Jakarta area",
		Attributes:  map[string]string{"plate_number": "B 1234 XYZ"},
		Location:    Location{Latitude: -6.2088, Longitude: 106.8456},
	}
}

func TestInputValidation(t *testing.T) {
	tests := []struct {
		name       string
		mutate     func(*Input)
		wantFields []string
	}{
		{name: "valid input", mutate: func(*Input) {}},
		{name: "description and attributes are optional", mutate: func(in *Input) {
			in.Description = ""
			in.Attributes = nil
		}},
		{name: "coordinate bounds are inclusive", mutate: func(in *Input) {
			in.Location = Location{Latitude: 90, Longitude: -180}
		}},
		{name: "name limit counts characters, not bytes", mutate: func(in *Input) {
			in.Name = strings.Repeat("é", MaxNameLength)
		}},

		{name: "missing name", mutate: func(in *Input) { in.Name = "" }, wantFields: []string{"name"}},
		{name: "blank name", mutate: func(in *Input) { in.Name = "   " }, wantFields: []string{"name"}},
		{name: "name too long", mutate: func(in *Input) {
			in.Name = strings.Repeat("a", MaxNameLength+1)
		}, wantFields: []string{"name"}},
		{name: "missing type", mutate: func(in *Input) { in.Type = "" }, wantFields: []string{"type"}},
		{name: "unknown type", mutate: func(in *Input) { in.Type = "boat" }, wantFields: []string{"type"}},
		{name: "missing status", mutate: func(in *Input) { in.Status = "" }, wantFields: []string{"status"}},
		{name: "unknown status", mutate: func(in *Input) { in.Status = "broken" }, wantFields: []string{"status"}},
		{name: "description too long", mutate: func(in *Input) {
			in.Description = strings.Repeat("a", MaxDescriptionLength+1)
		}, wantFields: []string{"description"}},
		{name: "too many attributes", mutate: func(in *Input) {
			in.Attributes = make(map[string]string)
			for i := range MaxAttributes + 1 {
				in.Attributes[fmt.Sprintf("key_%d", i)] = "v"
			}
		}, wantFields: []string{"attributes"}},
		{name: "attribute key with spaces", mutate: func(in *Input) {
			in.Attributes = map[string]string{"plate number": "B 1"}
		}, wantFields: []string{"attributes"}},
		{name: "empty attribute key", mutate: func(in *Input) {
			in.Attributes = map[string]string{"": "x"}
		}, wantFields: []string{"attributes"}},
		{name: "attribute key too long", mutate: func(in *Input) {
			in.Attributes = map[string]string{strings.Repeat("k", MaxAttributeKeyLength+1): "x"}
		}, wantFields: []string{"attributes"}},
		{name: "attribute value too long", mutate: func(in *Input) {
			in.Attributes = map[string]string{"note": strings.Repeat("a", MaxAttributeValueLength+1)}
		}, wantFields: []string{"attributes.note"}},
		{name: "latitude out of range", mutate: func(in *Input) { in.Location.Latitude = 90.0001 }, wantFields: []string{"latitude"}},
		{name: "longitude out of range", mutate: func(in *Input) { in.Location.Longitude = -180.5 }, wantFields: []string{"longitude"}},
		{name: "latitude is NaN", mutate: func(in *Input) { in.Location.Latitude = math.NaN() }, wantFields: []string{"latitude"}},
		{name: "longitude is infinite", mutate: func(in *Input) { in.Location.Longitude = math.Inf(1) }, wantFields: []string{"longitude"}},
		{name: "reports every invalid field", mutate: func(in *Input) {
			*in = Input{Location: Location{Latitude: 100, Longitude: 200}}
		}, wantFields: []string{"name", "type", "status", "latitude", "longitude"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			in := validInput()
			tt.mutate(&in)

			err := in.normalize().validate()
			assertInvalidFields(t, err, tt.wantFields)
		})
	}
}

func TestInputNormalize(t *testing.T) {
	in := Input{
		Name:        "  Truck 01 ",
		Description: "\tnotes\n",
		Attributes:  map[string]string{"plate_number": "  B 1234 XYZ "},
	}

	got := in.normalize()

	if got.Name != "Truck 01" {
		t.Errorf("Name = %q, want %q", got.Name, "Truck 01")
	}
	if got.Description != "notes" {
		t.Errorf("Description = %q, want %q", got.Description, "notes")
	}
	if v := got.Attributes["plate_number"]; v != "B 1234 XYZ" {
		t.Errorf("plate_number = %q, want %q", v, "B 1234 XYZ")
	}
	if in.Attributes["plate_number"] != "  B 1234 XYZ " {
		t.Error("normalize modified the caller's attribute map")
	}
}

func TestInputNormalizeNilAttributes(t *testing.T) {
	if got := (Input{}).normalize(); got.Attributes == nil {
		t.Error("Attributes is nil, want an empty map")
	}
}

// assertInvalidFields checks that err reports exactly the given fields, in
// order. A nil or empty wantFields means err must be nil.
func assertInvalidFields(t *testing.T, err error, wantFields []string) {
	t.Helper()

	if len(wantFields) == 0 {
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		return
	}

	var verr *ValidationError
	if !errors.As(err, &verr) {
		t.Fatalf("error = %v, want *ValidationError", err)
	}

	got := make([]string, len(verr.Fields))
	for i, f := range verr.Fields {
		got[i] = f.Field
	}
	if !slices.Equal(got, wantFields) {
		t.Errorf("invalid fields = %v, want %v", got, wantFields)
	}
}

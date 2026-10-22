// Package entity holds the domain model for geolocated entities and the
// business rules that apply to them. It knows nothing about HTTP or storage.
package entity

import (
	"slices"
	"time"

	"github.com/google/uuid"
)

type Type string

const (
	TypeVehicle   Type = "vehicle"
	TypeIoTDevice Type = "iot_device"
	TypeFacility  Type = "facility"
	TypeOther     Type = "other"
)

var allTypes = []Type{TypeVehicle, TypeIoTDevice, TypeFacility, TypeOther}

func (t Type) Valid() bool { return slices.Contains(allTypes, t) }

type Status string

const (
	StatusActive      Status = "active"
	StatusInactive    Status = "inactive"
	StatusMaintenance Status = "maintenance"
	StatusOffline     Status = "offline"
)

var allStatuses = []Status{StatusActive, StatusInactive, StatusMaintenance, StatusOffline}

func (s Status) Valid() bool { return slices.Contains(allStatuses, s) }

// Location is a WGS84 coordinate in decimal degrees.
type Location struct {
	Latitude  float64
	Longitude float64
}

type Entity struct {
	ID          uuid.UUID
	Name        string
	Type        Type
	Status      Status
	Description string
	// Attributes carries type-specific details (e.g. plate number for a
	// vehicle, firmware version for a device) without a schema change per type.
	Attributes map[string]string
	Location   Location
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

// Input holds the fields a client may set when creating or replacing an entity.
type Input struct {
	Name        string
	Type        Type
	Status      Status
	Description string
	Attributes  map[string]string
	Location    Location
}

// Package seed loads a small set of sample entities so that a fresh install
// has something to show on the map.
package seed

import (
	"context"
	"fmt"

	"geo-entity-manager/backend/internal/entity"
)

// Service is the part of entity.Service seeding needs. Going through the
// service (not the repository) means samples are validated like user input.
type Service interface {
	List(ctx context.Context, filter entity.ListFilter) ([]entity.Entity, error)
	Create(ctx context.Context, in entity.Input) (entity.Entity, error)
}

// SampleData creates the sample entities if, and only if, there are no
// entities yet, so restarting the API never duplicates them or mixes them
// into real data. It returns how many entities were created.
func SampleData(ctx context.Context, svc Service) (int, error) {
	existing, err := svc.List(ctx, entity.ListFilter{Limit: 1})
	if err != nil {
		return 0, fmt.Errorf("check for existing entities: %w", err)
	}
	if len(existing) > 0 {
		return 0, nil
	}

	for i, in := range samples {
		if _, err := svc.Create(ctx, in); err != nil {
			return i, fmt.Errorf("create sample %q: %w", in.Name, err)
		}
	}
	return len(samples), nil
}

func at(lat, lng float64) entity.Location {
	return entity.Location{Latitude: lat, Longitude: lng}
}

var samples = []entity.Input{
	// Jakarta: a delivery fleet and city sensors, dense enough to cluster.
	{Name: "Truck JKT-01", Type: entity.TypeVehicle, Status: entity.StatusActive,
		Description: "Last-mile delivery truck, central Jakarta route.",
		Attributes:  map[string]string{"plate_number": "B 9123 KXA", "driver": "Andi", "capacity_kg": "4000"},
		Location:    at(-6.1862, 106.8340)},
	{Name: "Truck JKT-02", Type: entity.TypeVehicle, Status: entity.StatusMaintenance,
		Description: "Scheduled brake service.",
		Attributes:  map[string]string{"plate_number": "B 9456 KXB", "capacity_kg": "4000"},
		Location:    at(-6.2297, 106.8295)},
	{Name: "Van JKT-07", Type: entity.TypeVehicle, Status: entity.StatusActive,
		Attributes: map[string]string{"plate_number": "B 1873 PLQ", "driver": "Sari"},
		Location:   at(-6.1754, 106.8650)},
	{Name: "Air Quality Sensor – Monas", Type: entity.TypeIoTDevice, Status: entity.StatusActive,
		Description: "PM2.5 and PM10 sensor near the National Monument.",
		Attributes:  map[string]string{"firmware": "2.4.1", "battery_pct": "87"},
		Location:    at(-6.1754, 106.8272)},
	{Name: "Air Quality Sensor – Kemang", Type: entity.TypeIoTDevice, Status: entity.StatusOffline,
		Description: "No heartbeat since the last firmware update.",
		Attributes:  map[string]string{"firmware": "2.3.9"},
		Location:    at(-6.2607, 106.8136)},
	{Name: "Jakarta Distribution Center", Type: entity.TypeFacility, Status: entity.StatusActive,
		Attributes: map[string]string{"area_m2": "12000", "docks": "24"},
		Location:   at(-6.1214, 106.8834)},

	// Other cities across Indonesia.
	{Name: "Warehouse Cikarang", Type: entity.TypeFacility, Status: entity.StatusInactive,
		Description: "Closed for renovation until next quarter.",
		Attributes:  map[string]string{"area_m2": "8000"},
		Location:    at(-6.3005, 107.1527)},
	{Name: "Weather Station Bandung", Type: entity.TypeIoTDevice, Status: entity.StatusActive,
		Attributes: map[string]string{"firmware": "1.8.0", "elevation_m": "768"},
		Location:   at(-6.9147, 107.6098)},
	{Name: "Truck SMG-03", Type: entity.TypeVehicle, Status: entity.StatusActive,
		Attributes: map[string]string{"plate_number": "H 8812 QA"},
		Location:   at(-6.9932, 110.4203)},
	{Name: "Depot Surabaya", Type: entity.TypeFacility, Status: entity.StatusMaintenance,
		Description: "Cold storage unit under repair.",
		Attributes:  map[string]string{"area_m2": "6500", "cold_storage": "true"},
		Location:    at(-7.2575, 112.7521)},
	{Name: "Buoy Bali Strait", Type: entity.TypeOther, Status: entity.StatusActive,
		Description: "Wave height and water temperature buoy.",
		Attributes:  map[string]string{"battery_pct": "64"},
		Location:    at(-8.1500, 114.4000)},
	{Name: "Hub Denpasar", Type: entity.TypeFacility, Status: entity.StatusActive,
		Location: at(-8.6705, 115.2126)},
	{Name: "Hub Medan", Type: entity.TypeFacility, Status: entity.StatusActive,
		Attributes: map[string]string{"area_m2": "9000"},
		Location:   at(3.5952, 98.6722)},
	{Name: "Truck MKS-01", Type: entity.TypeVehicle, Status: entity.StatusOffline,
		Description: "GPS tracker not reporting.",
		Attributes:  map[string]string{"plate_number": "DD 4521 KL"},
		Location:    at(-5.1477, 119.4327)},
	{Name: "River Level Sensor Balikpapan", Type: entity.TypeIoTDevice, Status: entity.StatusActive,
		Attributes: map[string]string{"firmware": "3.0.2"},
		Location:   at(-1.2379, 116.8529)},
}

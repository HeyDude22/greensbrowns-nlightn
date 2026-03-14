"use client";

import { useMemo, useEffect } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, CircleMarker, Marker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { JobSuggestion, OptimizerPickup, OptimizerFarmer } from "@/lib/job-optimizer";
import { CLUSTER_COLORS } from "@/lib/constants";

const farmerIcon = (color: string) =>
  L.divIcon({
    className: "",
    html: `<div style="background:${color};color:white;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:12px;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3)">🌾</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });

interface PickupMarkerData {
  id: string;
  pickup_number: string;
  org_name: string;
  estimated_weight_kg: number | null;
  lat: number;
  lng: number;
  suggestionIndex: number | null;
}

interface SuggestionMapProps {
  suggestions: JobSuggestion[];
  farmers: OptimizerFarmer[];
  skippedPickups: OptimizerPickup[];
  selectedIds: Set<string>;
  onTogglePickup: (id: string) => void;
  onSelectCluster: (index: number) => void;
}

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 0) {
      const bounds = L.latLngBounds(points.map(([lat, lng]) => [lat, lng]));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }
  }, [map, points]);
  return null;
}

export default function SuggestionMap({
  suggestions,
  farmers,
  skippedPickups,
  selectedIds,
  onTogglePickup,
  onSelectCluster,
}: SuggestionMapProps) {
  // Build flat list of all pickup markers with their suggestion index
  const markers = useMemo(() => {
    const result: PickupMarkerData[] = [];
    for (let sIdx = 0; sIdx < suggestions.length; sIdx++) {
      for (const p of suggestions[sIdx].pickups) {
        if (p.lat && p.lng) {
          result.push({
            id: p.id,
            pickup_number: p.pickup_number,
            org_name: p.org_name,
            estimated_weight_kg: p.estimated_weight_kg,
            lat: p.lat,
            lng: p.lng,
            suggestionIndex: sIdx,
          });
        }
      }
    }
    for (const p of skippedPickups) {
      if (p.lat && p.lng) {
        result.push({
          id: p.id,
          pickup_number: p.pickup_number,
          org_name: p.org_name,
          estimated_weight_kg: p.estimated_weight_kg,
          lat: p.lat,
          lng: p.lng,
          suggestionIndex: null,
        });
      }
    }
    return result;
  }, [suggestions, skippedPickups]);

  // Farmer markers with their suggestion color
  const farmerMarkers = useMemo(() => {
    const result: { id: string; name: string; lat: number; lng: number; color: string }[] = [];
    const seen = new Set<string>();
    for (let sIdx = 0; sIdx < suggestions.length; sIdx++) {
      const farmerId = suggestions[sIdx].farmerId;
      if (seen.has(farmerId)) continue;
      seen.add(farmerId);
      const farmer = farmers.find((f) => f.id === farmerId);
      if (farmer?.farm_lat && farmer?.farm_lng) {
        result.push({
          id: farmer.id,
          name: farmer.full_name || "Farmer",
          lat: farmer.farm_lat,
          lng: farmer.farm_lng,
          color: CLUSTER_COLORS[sIdx % CLUSTER_COLORS.length],
        });
      }
    }
    return result;
  }, [suggestions, farmers]);

  const allPoints = useMemo(() => {
    const pts: [number, number][] = markers.map((m) => [m.lat, m.lng]);
    farmerMarkers.forEach((f) => pts.push([f.lat, f.lng]));
    return pts;
  }, [markers, farmerMarkers]);

  return (
    <MapContainer
      center={[12.97, 77.59]}
      zoom={12}
      style={{ height: "400px", width: "100%" }}
      className="rounded-lg"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds points={allPoints} />

      {/* Pickup markers */}
      {markers.map((m) => {
        const isSelected = selectedIds.has(m.id);
        const color =
          m.suggestionIndex !== null
            ? CLUSTER_COLORS[m.suggestionIndex % CLUSTER_COLORS.length]
            : "#9ca3af";

        return (
          <CircleMarker
            key={m.id}
            center={[m.lat, m.lng]}
            radius={isSelected ? 12 : 8}
            fillColor={isSelected ? "#000" : color}
            color={isSelected ? "#000" : color}
            weight={isSelected ? 3 : 2}
            fillOpacity={isSelected ? 0.9 : 0.6}
            eventHandlers={{
              click: () => onTogglePickup(m.id),
            }}
          >
            <Popup>
              <div className="text-xs min-w-[140px]">
                <strong>{m.pickup_number}</strong>
                <br />
                {m.org_name}
                <br />
                {m.estimated_weight_kg ? `${m.estimated_weight_kg} kg` : "Weight TBD"}
                {m.suggestionIndex !== null && (
                  <>
                    <br />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectCluster(m.suggestionIndex!);
                      }}
                      style={{ color, fontWeight: "bold", cursor: "pointer", background: "none", border: "none", padding: 0, textDecoration: "underline" }}
                    >
                      Select cluster #{m.suggestionIndex + 1}
                    </button>
                  </>
                )}
              </div>
            </Popup>
          </CircleMarker>
        );
      })}

      {/* Farmer markers */}
      {farmerMarkers.map((f) => (
        <Marker key={f.id} position={[f.lat, f.lng]} icon={farmerIcon(f.color)}>
          <Popup>
            <div className="text-xs">
              <strong>🌾 {f.name}</strong>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}

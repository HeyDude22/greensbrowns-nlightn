"use client";

import { useMemo, useEffect } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, CircleMarker, Marker, Polyline, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { JobSuggestion, OptimizerPickup } from "@/lib/job-optimizer";
import { CLUSTER_COLORS } from "@/lib/constants";

const farmerIcon = L.divIcon({
  className: "",
  html: `<div style="background:#15803d;color:white;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:14px;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3)">🌾</div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

interface SuggestionMapProps {
  suggestions: JobSuggestion[];
  skippedPickups: OptimizerPickup[];
  highlightedIndex: number | null;
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

export default function SuggestionMap({ suggestions, skippedPickups, highlightedIndex }: SuggestionMapProps) {
  const allPoints = useMemo(() => {
    const pts: [number, number][] = [];
    for (const s of suggestions) {
      for (const p of s.pickups) {
        if (p.lat && p.lng) pts.push([p.lat, p.lng]);
      }
      // Find farmer location from the optimizer data
      // The farmer lat/lng isn't directly on JobSuggestion, but we can approximate from pickups
    }
    for (const p of skippedPickups) {
      if (p.lat && p.lng) pts.push([p.lat, p.lng]);
    }
    return pts;
  }, [suggestions, skippedPickups]);

  // Compute cluster centroids for polylines to farmers
  const farmerPoints = useMemo(() => {
    const pts: { lat: number; lng: number; name: string; color: string }[] = [];
    // We don't have farmer lat/lng on JobSuggestion directly
    // This will be populated if we pass farmer data
    return pts;
  }, []);

  return (
    <MapContainer
      center={[12.97, 77.59]}
      zoom={12}
      style={{ height: "350px", width: "100%" }}
      className="rounded-lg"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds points={allPoints} />

      {/* Suggestion pickup markers */}
      {suggestions.map((suggestion, sIdx) => {
        const color = CLUSTER_COLORS[sIdx % CLUSTER_COLORS.length];
        const isHighlighted = highlightedIndex === sIdx;
        return suggestion.pickups.map((pickup) => {
          if (!pickup.lat || !pickup.lng) return null;
          return (
            <CircleMarker
              key={pickup.id}
              center={[pickup.lat, pickup.lng]}
              radius={isHighlighted ? 12 : 8}
              fillColor={color}
              color={isHighlighted ? "#000" : color}
              weight={isHighlighted ? 3 : 2}
              fillOpacity={0.8}
            >
              <Popup>
                <div className="text-xs">
                  <strong>{pickup.pickup_number}</strong>
                  <br />
                  {pickup.org_name}
                  <br />
                  {pickup.estimated_weight_kg ? `${pickup.estimated_weight_kg} kg` : "Weight TBD"}
                  <br />
                  <span style={{ color }}>Suggestion #{sIdx + 1}</span>
                </div>
              </Popup>
            </CircleMarker>
          );
        });
      })}

      {/* Skipped pickups — gray markers */}
      {skippedPickups.map((pickup) => {
        if (!pickup.lat || !pickup.lng) return null;
        return (
          <CircleMarker
            key={pickup.id}
            center={[pickup.lat, pickup.lng]}
            radius={6}
            fillColor="#9ca3af"
            color="#9ca3af"
            weight={1}
            fillOpacity={0.5}
          >
            <Popup>
              <div className="text-xs">
                <strong>{pickup.pickup_number}</strong>
                <br />
                {pickup.org_name}
                <br />
                <span className="text-gray-500">Skipped (no coordinates or match)</span>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}

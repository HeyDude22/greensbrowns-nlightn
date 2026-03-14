"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Check, X, Pencil, Truck, Sprout, MapPin, Package, Loader2 } from "lucide-react";
import type { JobSuggestion } from "@/lib/job-optimizer";
import { VEHICLE_TYPE_LABELS } from "@/lib/constants";
import type { VehicleType } from "@/types";

interface FarmerOption {
  id: string;
  full_name: string | null;
}

interface VehicleOption {
  id: string;
  registration_number: string;
  vehicle_type: VehicleType;
  capacity_kg: number;
}

interface SuggestionCardProps {
  suggestion: JobSuggestion;
  index: number;
  color: string;
  farmers: FarmerOption[];
  vehicles: VehicleOption[];
  onAccept: (farmerId: string, vehicleId: string) => void;
  onDismiss: () => void;
  onHover: (index: number | null) => void;
  accepting: boolean;
}

export function SuggestionCard({
  suggestion,
  index,
  color,
  farmers,
  vehicles,
  onAccept,
  onDismiss,
  onHover,
  accepting,
}: SuggestionCardProps) {
  const [editing, setEditing] = useState(false);
  const [selectedFarmer, setSelectedFarmer] = useState(suggestion.farmerId);
  const [selectedVehicle, setSelectedVehicle] = useState(() => {
    const match = vehicles.find((v) => v.vehicle_type === suggestion.vehicleType);
    return match?.id ?? "";
  });

  const vehiclesOfType = vehicles.filter((v) => v.vehicle_type === suggestion.vehicleType);

  return (
    <Card
      className="overflow-hidden transition-shadow hover:shadow-md"
      onMouseEnter={() => onHover(index)}
      onMouseLeave={() => onHover(null)}
    >
      <div className="flex">
        {/* Color stripe */}
        <div className="w-2 shrink-0" style={{ backgroundColor: color }} />

        <CardContent className="flex-1 p-4 space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="outline" style={{ borderColor: color, color }}>
                #{index + 1}
              </Badge>
              <span className="text-sm font-medium">
                {suggestion.pickups.length} pickup{suggestion.pickups.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Package className="h-3 w-3" />
              {suggestion.totalWeightKg > 1000
                ? `${(suggestion.totalWeightKg / 1000).toFixed(1)}t`
                : `${Math.round(suggestion.totalWeightKg)}kg`}
            </div>
          </div>

          {/* Pickups list */}
          <div className="space-y-1">
            {suggestion.pickups.map((p) => (
              <div key={p.id} className="flex items-center gap-2 text-xs">
                <MapPin className="h-3 w-3 shrink-0" style={{ color }} />
                <span className="font-medium">{p.pickup_number}</span>
                <span className="text-muted-foreground truncate">{p.org_name}</span>
                {p.estimated_weight_kg && (
                  <span className="text-muted-foreground ml-auto shrink-0">{p.estimated_weight_kg}kg</span>
                )}
              </div>
            ))}
          </div>

          {/* Details */}
          <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground border-t pt-2">
            <div className="flex items-center gap-1">
              <Sprout className="h-3 w-3" />
              {suggestion.farmerName || "Unknown"}
            </div>
            <div className="flex items-center gap-1">
              <Truck className="h-3 w-3" />
              {VEHICLE_TYPE_LABELS[suggestion.vehicleType] || suggestion.vehicleType}
            </div>
            <div>{suggestion.estimatedTrips} trip{suggestion.estimatedTrips !== 1 ? "s" : ""}</div>
            <div>{suggestion.estimatedDistanceKm.toFixed(1)} km</div>
            <div className="col-span-2 font-medium text-foreground">
              Est. cost: ₹{Math.round(suggestion.estimatedCostRs).toLocaleString("en-IN")}
            </div>
          </div>

          {/* Edit mode */}
          {editing && (
            <div className="space-y-2 border-t pt-2">
              <div className="space-y-1">
                <label className="text-xs font-medium">Farmer</label>
                <Select value={selectedFarmer} onValueChange={setSelectedFarmer}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {farmers.map((f) => (
                      <SelectItem key={f.id} value={f.id} className="text-xs">
                        {f.full_name || f.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Vehicle</label>
                <Select value={selectedVehicle} onValueChange={setSelectedVehicle}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(vehiclesOfType.length > 0 ? vehiclesOfType : vehicles).map((v) => (
                      <SelectItem key={v.id} value={v.id} className="text-xs">
                        {v.registration_number} — {VEHICLE_TYPE_LABELS[v.vehicle_type]} ({v.capacity_kg}kg)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <Button
              size="sm"
              className="flex-1"
              onClick={() => onAccept(selectedFarmer, selectedVehicle)}
              disabled={accepting || !selectedVehicle}
            >
              {accepting ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Check className="mr-1 h-3 w-3" />
              )}
              Accept
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditing(!editing)}
            >
              <Pencil className="h-3 w-3" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onDismiss}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </CardContent>
      </div>
    </Card>
  );
}

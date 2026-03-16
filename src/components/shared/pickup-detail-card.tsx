import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PICKUP_STATUS_LABELS, PICKUP_STATUS_COLORS } from "@/lib/constants";
import { Lock } from "lucide-react";
import type { Pickup } from "@/types";

interface PickupDetailCardProps {
  pickup: Pickup;
  vehicleRegNumber: string | null;
  farmerName: string | null;
  orgName?: string | null;
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between py-2.5 border-b border-dashed border-border/60 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right">{children}</span>
    </div>
  );
}

export function PickupDetailCard({
  pickup,
  vehicleRegNumber,
  farmerName,
  orgName,
}: PickupDetailCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between">
          <span>Details</span>
          <Badge
            variant="secondary"
            className={PICKUP_STATUS_COLORS[pickup.status]}
          >
            {PICKUP_STATUS_LABELS[pickup.status]}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {orgName !== undefined && (
          <DetailRow label="Organization">{orgName || "—"}</DetailRow>
        )}
        <DetailRow label="Scheduled Date">
          {new Date(pickup.scheduled_date).toLocaleDateString()}
        </DetailRow>
        <DetailRow label="Time Slot">
          <span className="capitalize">{pickup.scheduled_slot || "—"}</span>
        </DetailRow>
        <DetailRow label="Estimated Weight">
          {pickup.estimated_weight_kg ? (
            <span className="inline-flex items-center gap-1">
              {(Number(pickup.estimated_weight_kg) / 1000).toFixed(2)} tonnes
              {pickup.status !== "requested" && (
                <span title="Weight locked after verification"><Lock className="h-3 w-3 text-amber-600" /></span>
              )}
            </span>
          ) : (
            "—"
          )}
        </DetailRow>
        {pickup.actual_weight_kg && (
          <DetailRow label="Actual Weight">
            {(Number(pickup.actual_weight_kg) / 1000).toFixed(2)} tonnes
          </DetailRow>
        )}
        <DetailRow label="Loading Helper">
          {pickup.loading_helper_required ? "Required" : "Not needed"}
        </DetailRow>
        <DetailRow label="Vehicle">{vehicleRegNumber || "Not assigned"}</DetailRow>
        <DetailRow label="Farmer">{farmerName || "Not assigned"}</DetailRow>

        {pickup.notes && (
          <div className="pt-3 mt-1 border-t">
            <span className="text-sm text-muted-foreground">Notes</span>
            <p className="mt-1 text-sm bg-muted/50 rounded-md p-3">{pickup.notes}</p>
          </div>
        )}

        {pickup.waste_photo_urls && pickup.waste_photo_urls.length > 0 && (
          <div className="pt-3 mt-1 border-t">
            <span className="text-sm text-muted-foreground">Waste Photos</span>
            <div className="flex gap-2 mt-2">
              {pickup.waste_photo_urls.map((url: string, i: number) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                  <img
                    src={url}
                    alt={`Waste photo ${i + 1}`}
                    className="h-24 w-24 rounded-lg border object-cover hover:opacity-80 transition-opacity hover:shadow-md"
                  />
                </a>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

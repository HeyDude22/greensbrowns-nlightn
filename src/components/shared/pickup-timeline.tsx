import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTimeDDMMYYYY } from "@/lib/utils";
import { pickupStatusColor, pickupStatusLabel } from "@/lib/pickup-status-flow";
import { Clock } from "lucide-react";
import type { PickupEvent } from "@/types";

interface PickupTimelineProps {
  events: (PickupEvent & { profile_name?: string })[];
}

export function PickupTimeline({ events }: PickupTimelineProps) {
  const sorted = [...events].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Timeline</CardTitle>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">No events yet.</p>
        ) : (
          <div className="space-y-4">
            {sorted.map((event) => (
              <div key={event.id} className="flex gap-3">
                <div className="mt-1">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="secondary"
                      className={pickupStatusColor(event.status)}
                    >
                      {pickupStatusLabel(event.status)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTimeDDMMYYYY(event.created_at)}
                    </span>
                  </div>
                  {event.profile_name && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      by {event.profile_name}
                    </p>
                  )}
                  {event.notes && (
                    <p className="mt-1 text-sm">{event.notes}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

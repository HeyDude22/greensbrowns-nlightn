"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TRIP_STATUS_LABELS, TRIP_STATUS_COLORS } from "@/lib/constants";
import { formatDateTimeDDMMYYYY } from "@/lib/utils";
import { MapPin, Clock, Image as ImageIcon } from "lucide-react";
import type { PickupTrip } from "@/types";

interface TripCardProps {
  trips: PickupTrip[];
  showGeoData?: boolean;
}

function formatDuration(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return `${hours}h ${remainMins}m`;
}

export function TripCard({ trips, showGeoData = false }: TripCardProps) {
  if (trips.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Trips
          <Badge variant="outline">{trips.length} total</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {trips.map((trip) => (
          <div key={trip.id} className="space-y-3 border-b pb-4 last:border-b-0 last:pb-0">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="font-mono">
                Trip {trip.trip_number}
              </Badge>
              <Badge
                variant="secondary"
                className={TRIP_STATUS_COLORS[trip.status]}
              >
                {TRIP_STATUS_LABELS[trip.status]}
              </Badge>
              {trip.delivered_at && (
                <span className="text-xs text-muted-foreground">
                  {formatDuration(trip.started_at, trip.delivered_at)}
                </span>
              )}
            </div>

            <div className="flex gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Started: {formatDateTimeDDMMYYYY(trip.started_at)}
              </div>
              {trip.delivered_at && (
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Delivered: {formatDateTimeDDMMYYYY(trip.delivered_at)}
                </div>
              )}
            </div>

            {trip.photo_urls.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <ImageIcon className="h-3 w-3" />
                  {trip.photo_urls.length} photo{trip.photo_urls.length !== 1 && "s"}
                </div>
                <div className="flex gap-2 flex-wrap">
                  {trip.photo_urls.map((url, i) => (
                    <a
                      key={i}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="h-20 w-20 rounded-md overflow-hidden border hover:ring-2 ring-primary transition-all"
                    >
                      <img
                        src={url}
                        alt={`Trip ${trip.trip_number} photo ${i + 1}`}
                        className="h-full w-full object-cover"
                      />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {showGeoData && trip.photo_metadata.length > 0 && (
              <div className="space-y-1">
                {trip.photo_metadata
                  .filter((m) => m.lat !== null && m.lng !== null)
                  .map((meta, i) => (
                    <div key={i} className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      {meta.lat?.toFixed(6)}, {meta.lng?.toFixed(6)}
                      <span className="ml-2">{formatDateTimeDDMMYYYY(meta.timestamp)}</span>
                    </div>
                  ))}
              </div>
            )}

            {trip.notes && (
              <p className="text-sm text-muted-foreground">{trip.notes}</p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

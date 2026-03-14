import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Truck, Clock, CheckCircle, MapPin } from "lucide-react";

export default function CollectorDashboard() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Collector Dashboard</h1>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[
          { title: "Today's Jobs", value: "—", icon: Truck },
          { title: "Pending", value: "—", icon: Clock },
          { title: "Completed", value: "—", icon: CheckCircle },
          { title: "Active Route", value: "—", icon: MapPin },
        ].map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Today&apos;s Schedule</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No jobs scheduled for today.</p>
        </CardContent>
      </Card>
    </div>
  );
}

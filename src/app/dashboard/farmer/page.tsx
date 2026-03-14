import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Truck, Leaf, TrendingUp, Package } from "lucide-react";

export default function FarmerDashboard() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Farmer Dashboard</h1>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[
          { title: "Incoming Deliveries", value: "—", icon: Truck },
          { title: "Compost Stock (kg)", value: "—", icon: Leaf },
          { title: "Monthly Received", value: "—", icon: TrendingUp },
          { title: "Total Batches", value: "—", icon: Package },
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
          <CardTitle>Upcoming Deliveries</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No upcoming deliveries.</p>
        </CardContent>
      </Card>
    </div>
  );
}

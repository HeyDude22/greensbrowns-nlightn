import { Card, CardContent } from "@/components/ui/card";

export default function FarmerDeliveriesPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Deliveries</h1>
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">No deliveries found.</p>
        </CardContent>
      </Card>
    </div>
  );
}

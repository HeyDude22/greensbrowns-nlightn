import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function CompostPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Compost Inventory</h1>
      <Card>
        <CardHeader>
          <CardTitle>Stock Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Compost tracking will be implemented here.</p>
        </CardContent>
      </Card>
    </div>
  );
}

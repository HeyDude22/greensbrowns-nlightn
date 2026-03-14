import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Job Details</h1>
      <Card>
        <CardHeader>
          <CardTitle>Job #{id}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Job detail view will be implemented here.</p>
        </CardContent>
      </Card>
    </div>
  );
}

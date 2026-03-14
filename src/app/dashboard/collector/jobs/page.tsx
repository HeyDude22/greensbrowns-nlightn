import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function CollectorJobsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">All Jobs</h1>
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">No jobs found.</p>
        </CardContent>
      </Card>
    </div>
  );
}

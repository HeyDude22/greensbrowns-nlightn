import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  description?: string;
  href?: string;
}

export function StatCard({ title, value, icon: Icon, description, href }: StatCardProps) {
  const card = (
    <Card className={href ? "group hover:shadow-md hover:border-forest/30 transition-all duration-200" : undefined}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold tracking-tight mt-1">{value}</p>
            {description && (
              <p className="text-xs text-muted-foreground mt-1">{description}</p>
            )}
          </div>
          <div className="rounded-lg bg-forest/8 p-2.5 group-hover:bg-forest/15 transition-colors">
            <Icon className="h-5 w-5 text-forest" />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (href) {
    return <Link href={href}>{card}</Link>;
  }

  return card;
}

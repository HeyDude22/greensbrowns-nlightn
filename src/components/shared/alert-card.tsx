import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Severity = "critical" | "warning" | "info";

interface AlertCardProps {
  title: string;
  count: number;
  icon: LucideIcon;
  href: string;
  severity: Severity;
}

const SEVERITY_STYLES: Record<Severity, { card: string; icon: string; bg: string; count: string }> = {
  critical: {
    card: "border-l-4 border-l-red-500 hover:bg-red-50/50",
    icon: "text-red-500",
    bg: "bg-red-50",
    count: "text-red-700",
  },
  warning: {
    card: "border-l-4 border-l-amber-500 hover:bg-amber-50/50",
    icon: "text-amber-500",
    bg: "bg-amber-50",
    count: "text-amber-700",
  },
  info: {
    card: "border-l-4 border-l-blue-500 hover:bg-blue-50/50",
    icon: "text-blue-500",
    bg: "bg-blue-50",
    count: "text-blue-700",
  },
};

export function AlertCard({ title, count, icon: Icon, href, severity }: AlertCardProps) {
  const styles = SEVERITY_STYLES[severity];
  return (
    <Link href={href}>
      <Card className={`transition-all duration-200 hover:shadow-md ${styles.card}`}>
        <CardContent className="flex items-center gap-4 py-4 px-5">
          <div className={`rounded-lg p-2 ${styles.bg}`}>
            <Icon className={`h-5 w-5 ${styles.icon}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-2xl font-bold leading-tight ${styles.count}`}>{count}</p>
            <p className="text-sm text-muted-foreground truncate">{title}</p>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </CardContent>
      </Card>
    </Link>
  );
}

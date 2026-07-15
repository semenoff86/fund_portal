import { Badge } from "@/components/ui/badge";
import type { AssignmentStatus } from "@/lib/api";

const CONFIG: Record<AssignmentStatus, { label: string; variant: "default" | "success" | "warning" | "destructive" | "secondary" }> = {
  ASSIGNED: { label: "Назначен", variant: "default" },
  IN_PROGRESS: { label: "В процессе", variant: "warning" },
  COMPLETED: { label: "Завершён", variant: "success" },
  EXPIRED: { label: "Просрочен", variant: "destructive" },
};

export function AssignmentStatusBadge({ status }: { status: AssignmentStatus | string }) {
  const cfg = CONFIG[status as AssignmentStatus] ?? { label: status, variant: "secondary" as const };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

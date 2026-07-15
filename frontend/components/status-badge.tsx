import { Badge } from "@/components/ui/badge";

type BadgeVariant = "default" | "success" | "secondary" | "warning" | "destructive" | "outline";

const statusConfig: Record<string, { label: string; variant: BadgeVariant }> = {
  ACTIVE: { label: "Активный", variant: "success" },
  ARCHIVED: { label: "Архив", variant: "secondary" },
  PENDING: { label: "Ожидает", variant: "warning" },
  IN_PROGRESS: { label: "В работе", variant: "default" },
  COMPLETED: { label: "Выполнено", variant: "success" },
  REJECTED: { label: "Отклонено", variant: "destructive" },
};

interface StatusBadgeProps {
  status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status] || { label: status, variant: "outline" };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

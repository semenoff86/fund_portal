import { AlertTriangle, Clock } from "lucide-react";

export function DeadlineIndicator({ deadline }: { deadline: string | null }) {
  if (!deadline) {
    return <span className="text-xs text-slate-400">Без дедлайна</span>;
  }
  const now = new Date();
  const due = new Date(deadline);
  const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600">
        <AlertTriangle className="h-3 w-3" />
        Просрочен на {Math.abs(diffDays)} дн.
      </span>
    );
  }
  if (diffDays <= 3) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600">
        <Clock className="h-3 w-3" />
        Осталось {diffDays} дн.
      </span>
    );
  }
  if (diffDays <= 7) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-amber-600">
        <Clock className="h-3 w-3" />
        До {due.toLocaleDateString("ru-RU")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
      <Clock className="h-3 w-3" />
      До {due.toLocaleDateString("ru-RU")}
    </span>
  );
}

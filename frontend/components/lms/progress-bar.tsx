import { cn } from "@/lib/utils";

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  const color =
    value < 80 ? "bg-red-500" : value < 90 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex justify-between text-xs text-slate-500">
        <span>Прогресс</span>
        <span>{value}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
    </div>
  );
}

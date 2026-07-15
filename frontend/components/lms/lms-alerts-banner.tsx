"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { getLmsDashboardAlerts, type LmsDashboardAlert } from "@/lib/api";

const DISMISS_KEY = "lms-alerts-dismissed";

function loadDismissed(): Set<number> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(DISMISS_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as number[]);
  } catch {
    return new Set();
  }
}

function saveDismissed(ids: Set<number>) {
  sessionStorage.setItem(DISMISS_KEY, JSON.stringify([...ids]));
}

export function LmsAlertsBanner() {
  const [alerts, setAlerts] = useState<LmsDashboardAlert[]>([]);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());

  useEffect(() => {
    setDismissed(loadDismissed());
    getLmsDashboardAlerts()
      .then(setAlerts)
      .catch(() => setAlerts([]));
  }, []);

  const visible = alerts.filter((a) => !dismissed.has(a.assignment_id));
  if (visible.length === 0) return null;

  const dismiss = (assignmentId: number) => {
    const next = new Set(dismissed);
    next.add(assignmentId);
    setDismissed(next);
    saveDismissed(next);
  };

  return (
    <div className="space-y-2 border-b border-slate-200 bg-slate-50 px-6 py-3">
      {visible.map((alert) => (
        <Alert
          key={alert.assignment_id}
          variant={alert.is_expired ? "destructive" : "warning"}
          className="relative pr-10"
        >
          <AlertDescription className="flex flex-wrap items-center gap-2">
            {alert.is_expired ? (
              <span>
                Срок прохождения курса «{alert.course_title}» истёк. Запросите разблокировку у HR.
              </span>
            ) : (
              <span>
                Вам назначен курс «{alert.course_title}», необходимо пройти до{" "}
                {alert.deadline_date
                  ? new Date(alert.deadline_date).toLocaleDateString("ru-RU")
                  : "—"}
                .
              </span>
            )}
            <Button variant="link" className="h-auto p-0 text-sm" asChild>
              <Link href={`/dashboard/lms/courses/${alert.course_id}`}>
                {alert.is_expired ? "К курсу" : "Открыть"}
              </Link>
            </Button>
          </AlertDescription>
          <button
            type="button"
            aria-label="Закрыть"
            className="absolute right-3 top-3 text-slate-500 hover:text-slate-800"
            onClick={() => dismiss(alert.assignment_id)}
          >
            <X className="h-4 w-4" />
          </button>
        </Alert>
      ))}
    </div>
  );
}

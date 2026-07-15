"use client";

import { useEffect, useState } from "react";
import { LmsAdminGuard } from "@/components/lms-admin-guard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getLmsOverview, getLmsOverdueAssignments, type LmsOverview } from "@/lib/api";

export default function LmsAnalyticsPage() {
  const [stats, setStats] = useState<LmsOverview | null>(null);
  const [overdue, setOverdue] = useState<Awaited<ReturnType<typeof getLmsOverdueAssignments>>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getLmsOverview(), getLmsOverdueAssignments()])
      .then(([s, o]) => { setStats(s); setOverdue(o); })
      .finally(() => setLoading(false));
  }, []);

  return (
    <LmsAdminGuard>
      <div className="space-y-6">
        <h2 className="text-2xl font-semibold">Аналитика LMS</h2>
        {loading ? <Skeleton className="h-48" /> : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <Card><CardContent className="p-6"><p className="text-3xl font-bold">{stats?.completion_rate}%</p><p className="text-sm text-slate-500">Процент завершения</p></CardContent></Card>
              <Card><CardContent className="p-6"><p className="text-3xl font-bold">{stats?.avg_score ?? "—"}</p><p className="text-sm text-slate-500">Средний балл</p></CardContent></Card>
              <Card><CardContent className="p-6"><p className="text-3xl font-bold text-red-600">{overdue.length}</p><p className="text-sm text-slate-500">Просроченных назначений</p></CardContent></Card>
            </div>
            {/* TODO: Phase 3 — completion rate chart by course, average scores bar chart */}
            <Card>
              <CardHeader><CardTitle className="text-base">Просроченные курсы</CardTitle></CardHeader>
              <CardContent>
                {overdue.length === 0 ? (
                  <p className="text-sm text-slate-500">Нет просроченных назначений</p>
                ) : (
                  <ul className="space-y-2">
                    {overdue.map((a) => (
                      <li key={a.id} className="flex justify-between rounded-md border border-slate-100 p-3 text-sm">
                        <span>{a.full_name}</span>
                        <span className="text-red-600">Курс #{a.course_id}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </LmsAdminGuard>
  );
}

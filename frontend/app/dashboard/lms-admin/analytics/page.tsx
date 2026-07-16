"use client";

import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { LmsAdminGuard } from "@/components/lms-admin-guard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getLmsCompletionDynamics,
  getLmsOverview,
  getLmsOverdueAssignments,
  getLmsScoreDistribution,
  type LmsOverview,
} from "@/lib/api";

export default function LmsAnalyticsPage() {
  const [stats, setStats] = useState<LmsOverview | null>(null);
  const [overdue, setOverdue] = useState<Awaited<ReturnType<typeof getLmsOverdueAssignments>>>([]);
  const [scoreDist, setScoreDist] = useState<{ range: string; count: number }[]>([]);
  const [dynamics, setDynamics] = useState<{ date: string; count: number; label: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getLmsOverview(),
      getLmsOverdueAssignments(),
      getLmsScoreDistribution(),
      getLmsCompletionDynamics(),
    ])
      .then(([s, o, dist, dyn]) => {
        setStats(s);
        setOverdue(o);
        setScoreDist(dist);
        setDynamics(
          dyn.map((d) => ({
            date: d.date,
            count: d.count,
            label: new Date(d.date).toLocaleDateString("ru-RU", {
              day: "2-digit",
              month: "2-digit",
            }),
          })),
        );
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <LmsAdminGuard>
      <div className="space-y-6">
        <h2 className="text-2xl font-semibold">Аналитика LMS</h2>
        {loading ? (
          <Skeleton className="h-48" />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <Card>
                <CardContent className="p-6">
                  <p className="text-3xl font-bold">{stats?.completion_rate}%</p>
                  <p className="text-sm text-slate-500">Процент завершения</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <p className="text-3xl font-bold">{stats?.avg_score ?? "—"}</p>
                  <p className="text-sm text-slate-500">Средний балл</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <p className="text-3xl font-bold text-red-600">{overdue.length}</p>
                  <p className="text-sm text-slate-500">Просроченных назначений</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Распределение баллов</CardTitle>
                </CardHeader>
                <CardContent className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={scoreDist}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="range" tick={{ fill: "#64748b", fontSize: 12 }} />
                      <YAxis allowDecimals={false} tick={{ fill: "#64748b", fontSize: 12 }} />
                      <Tooltip />
                      <Bar dataKey="count" name="Попытки" fill="#2563eb" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Динамика завершений (30 дней)</CardTitle>
                </CardHeader>
                <CardContent className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={dynamics}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 11 }} interval="preserveStartEnd" />
                      <YAxis allowDecimals={false} tick={{ fill: "#64748b", fontSize: 12 }} />
                      <Tooltip
                        labelFormatter={(_, payload) =>
                          payload?.[0]?.payload?.date
                            ? new Date(payload[0].payload.date).toLocaleDateString("ru-RU")
                            : ""
                        }
                      />
                      <Area
                        type="monotone"
                        dataKey="count"
                        name="Завершения"
                        stroke="#0d9488"
                        fill="#5eead4"
                        fillOpacity={0.45}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Просроченные курсы</CardTitle>
              </CardHeader>
              <CardContent>
                {overdue.length === 0 ? (
                  <p className="text-sm text-slate-500">Нет просроченных назначений</p>
                ) : (
                  <ul className="space-y-2">
                    {overdue.map((a) => (
                      <li
                        key={a.id}
                        className="flex justify-between rounded-md border border-slate-100 p-3 text-sm"
                      >
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

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, GraduationCap } from "lucide-react";
import { toast } from "sonner";
import { CourseCard } from "@/components/lms/course-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getMyLmsCourses, getMyLmsProgress, type UserCourseItem } from "@/lib/api";

export default function LmsDashboardPage() {
  const [tab, setTab] = useState("all");
  const [courses, setCourses] = useState<UserCourseItem[]>([]);
  const [stats, setStats] = useState({ total_assigned: 0, completed: 0, in_progress: 0, overdue: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getMyLmsProgress(),
      getMyLmsCourses(),
    ])
      .then(([progress, list]) => {
        setStats(progress);
        setCourses(list);
      })
      .catch(() => toast.error("Не удалось загрузить курсы"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = courses.filter((c) => {
    if (tab === "all") return true;
    if (tab === "overdue") return c.status === "EXPIRED";
    if (tab === "in_progress") return c.status === "IN_PROGRESS";
    if (tab === "completed") return c.status === "COMPLETED";
    return true;
  });

  const inProgress = courses.filter((c) => c.status === "IN_PROGRESS");
  const overdue = courses.filter((c) => c.status === "EXPIRED");

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Учебный портал</h2>
          <p className="mt-1 text-sm text-slate-500">Назначенные курсы, тесты и прогресс</p>
        </div>
        <Button variant="outline" asChild><Link href="/dashboard/lms/my-progress">Мой прогресс</Link></Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: "Всего", value: stats.total_assigned },
          { label: "Завершено", value: stats.completed },
          { label: "В процессе", value: stats.in_progress },
          { label: "Просрочено", value: stats.overdue },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="flex items-center gap-3 p-4">
              <GraduationCap className="h-8 w-8 text-blue-600" />
              <div><p className="text-2xl font-semibold">{s.value}</p><p className="text-xs text-slate-500">{s.label}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      {overdue.length > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <p className="text-sm">У вас {overdue.length} просроченных курсов. Свяжитесь с HR для продления срока.</p>
        </div>
      )}

      {inProgress.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-medium text-slate-700">Продолжить обучение</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {inProgress.slice(0, 3).map((c) => <CourseCard key={c.course_id} course={c} />)}
          </div>
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all">Все</TabsTrigger>
          <TabsTrigger value="in_progress">В процессе</TabsTrigger>
          <TabsTrigger value="completed">Завершённые</TabsTrigger>
          <TabsTrigger value="overdue">Просроченные</TabsTrigger>
        </TabsList>
        <TabsContent value={tab}>
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40" />)}
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-12 text-center text-slate-500">Курсы не найдены</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((c) => <CourseCard key={c.course_id} course={c} />)}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { AssignmentStatusBadge } from "@/components/lms/assignment-status-badge";
import { DeadlineIndicator } from "@/components/lms/deadline-indicator";
import { ProgressBar } from "@/components/lms/progress-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getMyLmsCourse, getUploadUrl, startLmsCourse } from "@/lib/api";

export default function LmsCourseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [course, setCourse] = useState<Awaited<ReturnType<typeof getMyLmsCourse>> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMyLmsCourse(+id)
      .then(setCourse)
      .catch(() => toast.error("Курс недоступен"))
      .finally(() => setLoading(false));
  }, [id]);

  const handleStart = async () => {
    try {
      await startLmsCourse(+id);
      const updated = await getMyLmsCourse(+id);
      setCourse(updated);
      toast.success("Курс начат");
    } catch {
      toast.error("Ошибка");
    }
  };

  if (loading || !course) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">{course.title}</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {course.is_mandatory && <Badge>Обязательный</Badge>}
          <AssignmentStatusBadge status={course.status} />
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Информация</CardTitle></CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <p>Длительность: ~{course.estimated_duration_minutes} мин</p>
          <p>Проходной балл: {course.passing_score}%</p>
          <p>Попыток: {course.max_attempts === -1 ? "безлимит" : course.max_attempts}</p>
          <DeadlineIndicator deadline={course.deadline_date} />
          {course.best_score !== null && <div className="sm:col-span-2"><ProgressBar value={course.best_score} /></div>}
        </CardContent>
      </Card>

      {course.content_html && (
        <Card>
          <CardContent className="prose prose-sm max-w-none p-6" dangerouslySetInnerHTML={{ __html: course.content_html }} />
        </Card>
      )}

      {course.file_path && (
        <Button asChild variant="outline">
          <a href={getUploadUrl(course.file_path)!} target="_blank" rel="noreferrer">Скачать материалы</a>
        </Button>
      )}

      <div className="flex flex-wrap gap-3">
        {course.status === "ASSIGNED" && (
          <Button onClick={handleStart}>Начать курс</Button>
        )}
        {(course.status === "IN_PROGRESS" || course.status === "EXPIRED") && (
          <Button onClick={() => router.push(`/dashboard/lms/courses/${id}/quiz`)}>Пройти тест</Button>
        )}
        {course.status === "COMPLETED" && (
          <Button variant="outline" asChild><Link href={`/dashboard/lms/courses/${id}/results`}>Результаты</Link></Button>
        )}
      </div>
    </div>
  );
}

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { UserCourseItem } from "@/lib/api";
import { AssignmentStatusBadge } from "./assignment-status-badge";
import { DeadlineIndicator } from "./deadline-indicator";
import { ProgressBar } from "./progress-bar";

const CATEGORY_LABELS: Record<string, string> = {
  SAFETY: "Безопасность",
  CREDIT: "Кредитование",
  HR: "HR",
  GENERAL: "Общие",
  COMPLIANCE: "Комплаенс",
};

export function CourseCard({ course }: { course: UserCourseItem }) {
  const actionLabel =
    course.status === "COMPLETED"
      ? "Результаты"
      : course.status === "ASSIGNED"
        ? "Начать"
        : "Продолжить";
  const href =
    course.status === "COMPLETED"
      ? `/dashboard/lms/courses/${course.course_id}/results`
      : `/dashboard/lms/courses/${course.course_id}`;

  return (
    <Card className="border-slate-200 shadow-sm transition-shadow hover:shadow-md">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base font-medium text-slate-900">{course.title}</CardTitle>
          <AssignmentStatusBadge status={course.status} />
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          {course.category && (
            <Badge variant="outline">{CATEGORY_LABELS[course.category] ?? course.category}</Badge>
          )}
          {course.is_mandatory && <Badge variant="default">Обязательный</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {course.description && (
          <p className="line-clamp-2 text-sm text-slate-500">{course.description}</p>
        )}
        <DeadlineIndicator deadline={course.deadline_date} />
        {course.best_score !== null && <ProgressBar value={course.best_score} />}
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-slate-400">
            {course.estimated_duration_minutes > 0
              ? `~${course.estimated_duration_minutes} мин`
              : `${course.attempts_count} попыток`}
          </span>
          <Button size="sm" asChild>
            <Link href={href}>{actionLabel}</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

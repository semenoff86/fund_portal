"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getLmsCourseAttempts, type QuizSubmitResult } from "@/lib/api";

export default function LmsResultsPage() {
  const { id } = useParams<{ id: string }>();
  const [latest, setLatest] = useState<QuizSubmitResult | null>(null);
  const [attempts, setAttempts] = useState<Awaited<ReturnType<typeof getLmsCourseAttempts>>>([]);

  useEffect(() => {
    const cached = sessionStorage.getItem(`lms-quiz-result-${id}`);
    if (cached) setLatest(JSON.parse(cached));
    getLmsCourseAttempts(+id).then(setAttempts);
  }, [id]);

  const result = latest ?? (attempts[0] ? {
    score: attempts[0].score ?? 0,
    passed: attempts[0].passed ?? false,
    correct_answers: attempts[0].reviews.filter((r) => r.is_correct).length,
    total_questions: attempts[0].reviews.length,
    attempt_id: attempts[0].id,
    reviews: attempts[0].reviews,
  } : null);

  if (!result) {
    return <p className="py-12 text-center text-slate-500">Результаты не найдены</p>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Card className="text-center">
        <CardContent className="space-y-4 p-8">
          <p className="text-5xl font-bold text-slate-900">{result.score}%</p>
          <Badge variant={result.passed ? "success" : "destructive"} className="text-base px-4 py-1">
            {result.passed ? <><CheckCircle2 className="mr-1 inline h-4 w-4" />Зачёт</> : <><XCircle className="mr-1 inline h-4 w-4" />Не сдан</>}
          </Badge>
          <p className="text-sm text-slate-500">Правильных ответов: {result.correct_answers} / {result.total_questions}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Разбор ответов</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {result.reviews.map((r, i) => (
            <div key={r.quiz_id} className={`rounded-lg border p-4 ${r.is_correct ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
              <p className="font-medium">{i + 1}. {r.question}</p>
              <p className="mt-2 text-sm">Ваш ответ: {r.options[r.selected_index] ?? "—"}</p>
              {!r.is_correct && <p className="text-sm text-emerald-700">Правильно: {r.options[r.correct_index]}</p>}
              {r.explanation && <p className="mt-2 text-xs text-slate-600">{r.explanation}</p>}
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex gap-3">
        {!result.passed && (
          <Button asChild><Link href={`/dashboard/lms/courses/${id}/quiz`}>Пересдать</Link></Button>
        )}
        <Button variant="outline" asChild><Link href={`/dashboard/lms/courses/${id}`}>К курсу</Link></Button>
      </div>
    </div>
  );
}

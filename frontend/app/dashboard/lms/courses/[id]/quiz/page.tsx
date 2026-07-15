"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { getLmsQuiz, submitLmsQuiz } from "@/lib/api";

export default function LmsQuizPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [questions, setQuestions] = useState<{ id: number; question: string; options: string[] }[]>([]);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getLmsQuiz(+id)
      .then(setQuestions)
      .catch(() => toast.error("Тест недоступен"))
      .finally(() => setLoading(false));
  }, [id]);

  const allAnswered = questions.every((q) => answers[q.id] !== undefined);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const result = await submitLmsQuiz(+id, answers);
      sessionStorage.setItem(`lms-quiz-result-${id}`, JSON.stringify(result));
      router.push(`/dashboard/lms/courses/${id}/results`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка отправки");
    } finally {
      setSubmitting(false);
      setConfirmOpen(false);
    }
  };

  if (loading) return <Skeleton className="h-64" />;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Тест</h2>
        <p className="text-sm text-amber-600">Минимальный проходной балл: 80%</p>
      </div>

      {questions.map((q, i) => (
        <Card key={q.id}>
          <CardHeader><CardTitle className="text-base">Вопрос {i + 1} из {questions.length}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="font-medium text-slate-900">{q.question}</p>
            {q.options.map((opt, j) => (
              <label key={j} className="flex cursor-pointer items-center gap-3 rounded-md border border-slate-100 p-3 hover:bg-slate-50">
                <input
                  type="radio"
                  name={`q-${q.id}`}
                  checked={answers[q.id] === j}
                  onChange={() => setAnswers({ ...answers, [q.id]: j })}
                />
                <span className="text-sm">{String.fromCharCode(65 + j)}. {opt}</span>
              </label>
            ))}
          </CardContent>
        </Card>
      ))}

      <Button disabled={!allAnswered} onClick={() => setConfirmOpen(true)}>Отправить тест</Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Отправить ответы?</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-500">После отправки изменить ответы будет нельзя.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Отмена</Button>
            <Button onClick={handleSubmit} disabled={submitting}>{submitting ? "Отправка…" : "Подтвердить"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

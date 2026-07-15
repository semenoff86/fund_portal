"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Lock } from "lucide-react";
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
import { ApiError, getLmsQuiz, requestLmsUnblock, submitLmsQuiz } from "@/lib/api";

export default function LmsQuizPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [questions, setQuestions] = useState<{ id: number; question: string; options: string[] }[]>([]);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [requested, setRequested] = useState(false);

  useEffect(() => {
    getLmsQuiz(+id)
      .then(setQuestions)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 403) {
          setLocked(true);
        } else {
          toast.error(e instanceof Error ? e.message : "Тест недоступен");
        }
      })
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
      if (e instanceof ApiError && e.status === 403) {
        setLocked(true);
        toast.error(e.message);
      } else {
        toast.error(e instanceof Error ? e.message : "Ошибка отправки");
      }
    } finally {
      setSubmitting(false);
      setConfirmOpen(false);
    }
  };

  const handleRequestUnblock = async () => {
    setRequesting(true);
    try {
      await requestLmsUnblock(+id);
      setRequested(true);
      toast.success("Запрос на разблокировку отправлен HR/администратору");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось отправить запрос");
    } finally {
      setRequesting(false);
    }
  };

  if (loading) return <Skeleton className="h-64" />;

  if (locked) {
    return (
      <div className="mx-auto max-w-lg space-y-6">
        <Card>
          <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
              <Lock className="h-6 w-6 text-red-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Тест заблокирован</h2>
              <p className="mt-2 text-sm text-slate-500">
                Срок прохождения курса истёк. Запросите разблокировку у HR или администратора.
              </p>
            </div>
            <Button onClick={handleRequestUnblock} disabled={requesting || requested}>
              {requested
                ? "Запрос отправлен"
                : requesting
                  ? "Отправка…"
                  : "Запросить разблокировку у HR/Администратора"}
            </Button>
            <Button variant="outline" asChild>
              <a href={`/dashboard/lms/courses/${id}`}>Вернуться к курсу</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Тест</h2>
        <p className="text-sm text-amber-600">Минимальный проходной балл: 80%</p>
      </div>

      {questions.map((q, i) => (
        <Card key={q.id}>
          <CardHeader>
            <CardTitle className="text-base">
              Вопрос {i + 1} из {questions.length}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="font-medium text-slate-900">{q.question}</p>
            {q.options.map((opt, j) => (
              <label
                key={j}
                className="flex cursor-pointer items-center gap-3 rounded-md border border-slate-100 p-3 hover:bg-slate-50"
              >
                <input
                  type="radio"
                  name={`q-${q.id}`}
                  checked={answers[q.id] === j}
                  onChange={() => setAnswers({ ...answers, [q.id]: j })}
                />
                <span className="text-sm">
                  {String.fromCharCode(65 + j)}. {opt}
                </span>
              </label>
            ))}
          </CardContent>
        </Card>
      ))}

      <Button disabled={!allAnswered} onClick={() => setConfirmOpen(true)}>
        Отправить тест
      </Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Отправить ответы?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-500">После отправки изменить ответы будет нельзя.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Отмена
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Отправка…" : "Подтвердить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

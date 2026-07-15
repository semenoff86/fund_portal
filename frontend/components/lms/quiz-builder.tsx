"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface QuizFormData {
  question: string;
  options: string[];
  correct_answer_index: number;
  explanation: string;
}

interface QuizBuilderProps {
  value: QuizFormData;
  onChange: (value: QuizFormData) => void;
  onSubmit: () => void;
  submitting?: boolean;
  submitLabel?: string;
}

export function QuizBuilder({ value, onChange, onSubmit, submitting, submitLabel = "Добавить вопрос" }: QuizBuilderProps) {
  const setOption = (index: number, text: string) => {
    const options = [...value.options];
    options[index] = text;
    onChange({ ...value, options });
  };

  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="space-y-2">
        <Label>Вопрос</Label>
        <Textarea
          value={value.question}
          onChange={(e) => onChange({ ...value, question: e.target.value })}
          rows={2}
        />
      </div>
      {value.options.map((opt, i) => (
        <div key={i} className="flex items-center gap-3">
          <input
            type="radio"
            name="correct"
            checked={value.correct_answer_index === i}
            onChange={() => onChange({ ...value, correct_answer_index: i })}
            className="h-4 w-4 text-blue-600"
          />
          <Input
            placeholder={`Вариант ${String.fromCharCode(65 + i)}`}
            value={opt}
            onChange={(e) => setOption(i, e.target.value)}
          />
        </div>
      ))}
      <div className="space-y-2">
        <Label>Объяснение (необязательно)</Label>
        <Textarea
          value={value.explanation}
          onChange={(e) => onChange({ ...value, explanation: e.target.value })}
          rows={2}
        />
      </div>
      <Button onClick={onSubmit} disabled={submitting}>
        {submitting ? "Сохранение…" : submitLabel}
      </Button>
    </div>
  );
}

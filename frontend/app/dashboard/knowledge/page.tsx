"use client";

import { useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/status-badge";
import { getOrders, type OrderDocument } from "@/lib/api";

const CATEGORIES = [
  { value: "all", label: "Все категории" },
  { value: "HR", label: "HR" },
  { value: "CREDIT", label: "Кредитование" },
  { value: "GENERAL", label: "Общие" },
  { value: "SAFETY", label: "Безопасность" },
];

const STATUSES = [
  { value: "all", label: "Все статусы" },
  { value: "ACTIVE", label: "Активные" },
  { value: "ARCHIVED", label: "Архив" },
];

const CATEGORY_LABELS: Record<string, string> = {
  HR: "HR",
  CREDIT: "Кредитование",
  GENERAL: "Общие",
  SAFETY: "Безопасность",
};

export default function KnowledgePage() {
  const [items, setItems] = useState<OrderDocument[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");

  const pageSize = 10;
  const totalPages = Math.ceil(total / pageSize);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getOrders({
        search: search || undefined,
        category: category !== "all" ? category : undefined,
        status: status !== "all" ? status : undefined,
        page,
        page_size: pageSize,
      });
      setItems(data.items);
      setTotal(data.total);
    } catch {
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [search, category, status, page]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">База знаний</h2>
        <p className="mt-1 text-sm text-slate-500">
          Приказы, регламенты и внутренние документы МКК
        </p>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-medium">Фильтры</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <form onSubmit={handleSearch} className="flex flex-1 gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Поиск по названию и содержанию..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="pl-9"
                  aria-label="Поиск документов"
                />
              </div>
              <Button type="submit">Найти</Button>
            </form>

            <Select value={category} onValueChange={(v) => { setCategory(v); setPage(1); }}>
              <SelectTrigger className="w-full sm:w-48" aria-label="Категория">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
              <SelectTrigger className="w-full sm:w-40" aria-label="Статус">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" role="table">
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3 text-left font-medium text-slate-600">Название</th>
                  <th className="px-6 py-3 text-left font-medium text-slate-600">Категория</th>
                  <th className="px-6 py-3 text-left font-medium text-slate-600">Статус</th>
                  <th className="px-6 py-3 text-left font-medium text-slate-600">Дата</th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-b border-slate-100">
                        <td className="px-6 py-4" colSpan={4}>
                          <Skeleton className="h-4 w-full" />
                        </td>
                      </tr>
                    ))
                  : items.length === 0
                    ? (
                        <tr>
                          <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                            Документы не найдены
                          </td>
                        </tr>
                      )
                    : items.map((doc) => (
                        <tr
                          key={doc.id}
                          className="border-b border-slate-100 transition-colors hover:bg-slate-50"
                        >
                          <td className="px-6 py-4">
                            <p className="font-medium text-slate-900">{doc.title}</p>
                            {doc.content_text && (
                              <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">
                                {doc.content_text}
                              </p>
                            )}
                          </td>
                          <td className="px-6 py-4 text-slate-600">
                            {CATEGORY_LABELS[doc.category] || doc.category}
                          </td>
                          <td className="px-6 py-4">
                            <StatusBadge status={doc.status} />
                          </td>
                          <td className="px-6 py-4 text-slate-600">
                            {doc.issue_date
                              ? new Date(doc.issue_date).toLocaleDateString("ru-RU")
                              : "—"}
                          </td>
                        </tr>
                      ))}
              </tbody>
            </table>
          </div>

          {!loading && totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4">
              <p className="text-sm text-slate-500">
                Всего: {total} · Страница {page} из {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Назад
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Вперёд
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

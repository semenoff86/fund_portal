"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, FileText, Loader2, MessageSquarePlus, Send, User } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  createChatSession,
  getChatSession,
  getChatSessions,
  sendChatSessionMessage,
  type ChatMessageItem,
  type ChatSession,
  type ChatSource,
} from "@/lib/api";

function renderWithCitations(text: string) {
  const parts = text.split(/(\[\d+\])/g);
  return parts.map((part, i) => {
    const match = part.match(/^\[(\d+)\]$/);
    if (match) {
      return (
        <sup
          key={i}
          className="mx-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded bg-blue-100 px-1 text-[10px] font-semibold text-blue-700"
        >
          {match[1]}
        </sup>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function SourcesBlock({ sources }: { sources: ChatSource[] }) {
  if (!sources.length) return null;
  return (
    <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Источники</p>
      {sources.map((s) => (
        <div
          key={s.id}
          className="rounded-md border border-slate-200 bg-white p-2 text-xs hover:border-blue-200"
        >
          <div className="flex items-center gap-1.5 font-medium text-slate-800">
            <FileText className="h-3.5 w-3.5 text-blue-600" />
            <span>[{s.id}] {s.file}</span>
          </div>
          <p className="mt-1 line-clamp-2 text-slate-500">{s.snippet}</p>
        </div>
      ))}
    </div>
  );
}

export default function AiChatPage() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [input, setInput] = useState("");
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const list = await getChatSessions();
      setSessions(list);
      if (list.length && activeId === null) {
        setActiveId(list[0].id);
      }
    } catch {
      toast.error("Не удалось загрузить историю чатов");
    } finally {
      setLoadingSessions(false);
    }
  }, [activeId]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    setLoadingMessages(true);
    getChatSession(activeId)
      .then((s) => setMessages(s.messages))
      .catch(() => toast.error("Не удалось загрузить сообщения"))
      .finally(() => setLoadingMessages(false));
  }, [activeId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const handleNewChat = async () => {
    try {
      const session = await createChatSession();
      setSessions((prev) => [session, ...prev]);
      setActiveId(session.id);
      setMessages([]);
    } catch {
      toast.error("Не удалось создать чат");
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;

    let sessionId = activeId;
    if (!sessionId) {
      try {
        const session = await createChatSession();
        setSessions((prev) => [session, ...prev]);
        sessionId = session.id;
        setActiveId(session.id);
      } catch {
        toast.error("Не удалось создать чат");
        return;
      }
    }

    setInput("");
    setSending(true);

    const tempUser: ChatMessageItem = {
      id: Date.now(),
      role: "user",
      content: text,
      sources: null,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUser]);

    try {
      const res = await sendChatSessionMessage(sessionId, text);
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempUser.id),
        res.user_message,
        res.assistant_message,
      ]);
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId ? { ...s, updated_at: res.assistant_message.created_at } : s,
        ),
      );
      loadSessions();
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== tempUser.id));
      toast.error(err instanceof Error ? err.message : "Ошибка отправки");
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4 animate-fade-in">
      <Card className="flex w-64 shrink-0 flex-col overflow-hidden border-slate-200">
        <div className="border-b border-slate-200 p-3">
          <Button className="w-full" size="sm" onClick={handleNewChat}>
            <MessageSquarePlus className="mr-2 h-4 w-4" />
            Новый чат
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {loadingSessions ? (
            <div className="space-y-2 p-2">
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
            </div>
          ) : sessions.length === 0 ? (
            <p className="p-3 text-center text-xs text-slate-400">Нет чатов</p>
          ) : (
            sessions.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveId(s.id)}
                className={`mb-1 w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                  activeId === s.id
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <p className="line-clamp-2 font-medium">{s.title}</p>
              </button>
            ))
          )}
        </div>
      </Card>

      <Card className="flex flex-1 flex-col overflow-hidden border-slate-200">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">AI-ассистент МКК</h2>
          <p className="text-sm text-slate-500">
            Ответы на основе внутренних документов с указанием источников
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4" role="log" aria-live="polite">
          {loadingMessages ? (
            <Skeleton className="h-24 w-2/3" />
          ) : messages.length === 0 && !sending ? (
            <div className="flex h-full flex-col items-center justify-center text-center text-slate-400">
              <Bot className="mb-3 h-10 w-10 text-blue-300" />
              <p className="text-sm">Задайте вопрос по уставу, регламентам или приказам Фонда</p>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
              >
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                    msg.role === "user" ? "bg-blue-600" : "bg-slate-100"
                  }`}
                >
                  {msg.role === "user" ? (
                    <User className="h-4 w-4 text-white" />
                  ) : (
                    <Bot className="h-4 w-4 text-blue-600" />
                  )}
                </div>
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                    msg.role === "user"
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-900"
                  }`}
                >
                  <div className="whitespace-pre-wrap leading-relaxed">
                    {msg.role === "assistant" ? renderWithCitations(msg.content) : msg.content}
                  </div>
                  {msg.role === "assistant" && msg.sources && (
                    <SourcesBlock sources={msg.sources} />
                  )}
                </div>
              </div>
            ))
          )}

          {sending && (
            <div className="flex gap-3" aria-label="AI печатает">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100">
                <Bot className="h-4 w-4 text-blue-600" />
              </div>
              <div className="rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-500">
                AI печатает… (до 15 сек)
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="border-t border-slate-200 p-4">
          <div className="flex gap-2">
            <Textarea
              placeholder="Введите вопрос по документам Фонда…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              className="min-h-[52px] resize-none"
              disabled={sending}
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              size="icon"
              className="h-[52px] w-[52px] shrink-0"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

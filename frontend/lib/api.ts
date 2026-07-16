import { getRefreshToken, getToken, removeToken, setToken } from "./auth";

const API_PORT = process.env.NEXT_PUBLIC_API_PORT || "8000";

/** API base URL: всегда тот же хост, что и у страницы в браузере (работает по IP в LAN). */
export function getApiUrl(): string {
  if (typeof window !== "undefined") {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:${API_PORT}`;
  }
  return process.env.NEXT_PUBLIC_API_URL || `http://localhost:${API_PORT}`;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

let refreshInFlight: Promise<boolean> | null = null;

/** Exchange refresh_token for a new access_token. Returns true on success. */
async function tryRefreshAccessToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  try {
    const response = await fetch(`${getApiUrl()}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!response.ok) return false;
    const data = (await response.json()) as { access_token: string };
    setToken(data.access_token);
    return true;
  } catch {
    return false;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  allowRetry = true,
): Promise<T> {
  const token = getToken();
  const headers: HeadersInit = {
    ...(options.headers || {}),
  };

  if (!(options.body instanceof FormData)) {
    (headers as Record<string, string>)["Content-Type"] = "application/json";
  }

  if (token) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  let response: Response;
  try {
    response = await fetch(`${getApiUrl()}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new ApiError(0, "Сервер не отвечает. Перезапустите backend на порту 8000.");
    }
    throw new ApiError(
      0,
      "Не удалось подключиться к серверу. Убедитесь, что backend запущен (порт 8000).",
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (response.status === 401 && allowRetry && !path.startsWith("/api/auth/")) {
    if (!refreshInFlight) {
      refreshInFlight = tryRefreshAccessToken().finally(() => {
        refreshInFlight = null;
      });
    }
    const refreshed = await refreshInFlight;
    if (refreshed) {
      return request<T>(path, options, false);
    }
    removeToken();
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
    throw new ApiError(401, "Не авторизован");
  }

  if (response.status === 401) {
    removeToken();
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
    throw new ApiError(401, "Не авторизован");
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Ошибка сервера" }));
    const message =
      typeof error.detail === "string"
        ? error.detail
        : Array.isArray(error.detail)
          ? error.detail.map((e: { msg: string }) => e.msg).join(", ")
          : "Ошибка сервера";
    throw new ApiError(response.status, message);
  }

  if (response.status === 204) return {} as T;
  return response.json();
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function login(username: string, password: string) {
  return request<{
    access_token: string;
    refresh_token: string;
    token_type: string;
    expires_in: number;
  }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function refreshSession() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    throw new ApiError(401, "Нет refresh-токена");
  }
  return request<{ access_token: string; token_type: string; expires_in: number }>(
    "/api/auth/refresh",
    {
      method: "POST",
      body: JSON.stringify({ refresh_token: refreshToken }),
    },
    false,
  );
}


// ── Profile ───────────────────────────────────────────────────────────────────

export interface UserProfile {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role: string;
  department: string | null;
  avatar_url: string | null;
  bio: string | null;
  phone: string | null;
  created_at: string;
  updated_at: string;
}

export async function getProfile() {
  return request<UserProfile>("/api/profile/me");
}

export async function updateProfile(data: Partial<UserProfile>) {
  return request<UserProfile>("/api/profile/me", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function uploadAvatar(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return request<{ avatar_url: string }>("/api/profile/avatar", {
    method: "POST",
    body: formData,
  });
}

export function getAvatarUrl(avatarUrl: string | null): string | null {
  if (!avatarUrl) return null;
  if (avatarUrl.startsWith("http")) return avatarUrl;
  return `${getApiUrl()}${avatarUrl}`;
}

// ── Orders ────────────────────────────────────────────────────────────────────

export interface OrderDocument {
  id: number;
  title: string;
  category: "HR" | "CREDIT" | "GENERAL" | "SAFETY";
  status: "ACTIVE" | "ARCHIVED";
  issue_date: string | null;
  file_path: string | null;
  content_text: string | null;
  version: number;
  is_active: boolean;
}

export interface OrderListResponse {
  items: OrderDocument[];
  total: number;
  page: number;
  page_size: number;
}

export async function getOrders(params: {
  category?: string;
  status?: string;
  search?: string;
  page?: number;
  page_size?: number;
  is_active?: boolean;
  include_inactive?: boolean;
}) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") searchParams.set(key, String(value));
  });
  return request<OrderListResponse>(`/api/orders?${searchParams.toString()}`);
}

// ── Service Desk ──────────────────────────────────────────────────────────────

export interface ServiceRequest {
  id: number;
  request_type: string;
  status: string;
  description: string | null;
  created_at: string;
}

export async function createServiceRequest(data: {
  request_type: string;
  description?: string;
}) {
  return request<ServiceRequest>("/api/requests", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getMyRequests() {
  return request<ServiceRequest[]>("/api/requests/my");
}

// ── Document Templates ────────────────────────────────────────────────────────

export interface DocumentTemplateListItem {
  slug: string;
  title: string;
  description: string;
  category: string;
  has_source_file: boolean;
}

export interface DocumentTemplateField {
  key: string;
  label: string;
  type: string;
  source?: string | null;
  readonly?: boolean;
  required?: boolean;
  placeholder?: string | null;
  value?: string | null;
}

export interface DocumentTemplateDetail {
  slug: string;
  title: string;
  description: string;
  category: string;
  has_source_file: boolean;
  fields: DocumentTemplateField[];
  prefill: Record<string, string>;
}

export async function getDocumentTemplates() {
  return request<DocumentTemplateListItem[]>("/api/document-templates");
}

export async function getDocumentTemplate(slug: string) {
  return request<DocumentTemplateDetail>(`/api/document-templates/${slug}`);
}

export async function generateDocument(slug: string, values: Record<string, string>) {
  const token = getToken();
  let response: Response;
  try {
    response = await fetch(`${getApiUrl()}/api/document-templates/${slug}/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ values }),
    });
  } catch {
    throw new ApiError(0, "Не удалось подключиться к серверу");
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Ошибка генерации" }));
    const message = typeof error.detail === "string" ? error.detail : "Ошибка генерации";
    throw new ApiError(response.status, message);
  }

  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match?.[1] ? decodeURIComponent(match[1]) : `${slug}.docx`;
  return { blob, filename };
}

// ── RAG Chat ──────────────────────────────────────────────────────────────────

export interface ChatSource {
  id: number;
  file: string;
  snippet: string;
}

export interface ChatSession {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessageItem {
  id: number;
  role: "user" | "assistant";
  content: string;
  sources: ChatSource[] | null;
  created_at: string;
}

async function requestLong<T>(path: string, options: RequestInit = {}, timeoutMs = 90000): Promise<T> {
  const token = getToken();
  const headers: HeadersInit = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) {
    (headers as Record<string, string>)["Content-Type"] = "application/json";
  }
  if (token) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(`${getApiUrl()}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new ApiError(0, "AI не ответил вовремя. Попробуйте ещё раз.");
    }
    throw new ApiError(0, "Не удалось подключиться к серверу.");
  } finally {
    clearTimeout(timeoutId);
  }
  if (response.status === 401) {
    removeToken();
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
    throw new ApiError(401, "Не авторизован");
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Ошибка сервера" }));
    const message = typeof error.detail === "string" ? error.detail : "Ошибка сервера";
    throw new ApiError(response.status, message);
  }
  return response.json();
}

export async function createChatSession(title?: string) {
  return requestLong<ChatSession>("/api/chat/sessions", {
    method: "POST",
    body: JSON.stringify({ title }),
  });
}

export async function getChatSessions() {
  return requestLong<ChatSession[]>("/api/chat/sessions");
}

export async function getChatSession(sessionId: number) {
  return requestLong<ChatSession & { messages: ChatMessageItem[] }>(
    `/api/chat/sessions/${sessionId}`,
  );
}

export async function sendChatSessionMessage(sessionId: number, content: string) {
  return requestLong<{
    answer: string;
    sources: ChatSource[];
    user_message: ChatMessageItem;
    assistant_message: ChatMessageItem;
  }>(`/api/chat/sessions/${sessionId}/message`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });
}

// ── Admin ─────────────────────────────────────────────────────────────────────

export interface AdminUser {
  id: number;
  username: string;
  full_name: string;
  role: string;
  department: string | null;
  is_active: boolean;
}

export interface AdminTemplate {
  id: number;
  name: string;
  category: string;
  file_path: string;
  created_at: string;
}

export interface AdminKnowledgeDoc extends OrderDocument {
  created_at: string;
}

export async function getAdminUsers() {
  return request<AdminUser[]>("/api/admin/users");
}

export async function createAdminUser(data: {
  username: string;
  password: string;
  full_name: string;
  role: string;
  department?: string;
}) {
  return request<AdminUser>("/api/admin/users", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function toggleAdminUserActive(userId: number) {
  return request<AdminUser>(`/api/admin/users/${userId}/toggle-active`, { method: "PATCH" });
}

export async function deleteAdminUser(userId: number) {
  return request<void>(`/api/admin/users/${userId}`, { method: "DELETE" });
}

export async function getAdminTemplates() {
  return request<AdminTemplate[]>("/api/admin/templates");
}

export async function uploadAdminTemplate(data: { name: string; category: string; file: File }) {
  const formData = new FormData();
  formData.append("name", data.name);
  formData.append("category", data.category);
  formData.append("file", data.file);
  return request<AdminTemplate>("/api/admin/templates/upload", {
    method: "POST",
    body: formData,
  });
}

export async function deleteAdminTemplate(templateId: number) {
  return request<void>(`/api/admin/templates/${templateId}`, { method: "DELETE" });
}

export async function getAdminKnowledge() {
  return request<AdminKnowledgeDoc[]>("/api/admin/knowledge");
}

export async function createAdminKnowledge(data: {
  title: string;
  category: string;
  status: string;
  issue_date?: string;
  file: File;
}) {
  const formData = new FormData();
  formData.append("title", data.title);
  formData.append("category", data.category);
  formData.append("status", data.status);
  if (data.issue_date) formData.append("issue_date", data.issue_date);
  formData.append("file", data.file);
  return request<AdminKnowledgeDoc>("/api/admin/knowledge", {
    method: "POST",
    body: formData,
  });
}

export async function updateAdminKnowledge(
  docId: number,
  data: {
    title?: string;
    category?: string;
    status?: string;
    issue_date?: string;
    file?: File;
  },
) {
  const formData = new FormData();
  if (data.title !== undefined) formData.append("title", data.title);
  if (data.category !== undefined) formData.append("category", data.category);
  if (data.status !== undefined) formData.append("status", data.status);
  if (data.issue_date !== undefined) formData.append("issue_date", data.issue_date);
  if (data.file) formData.append("file", data.file);
  return request<AdminKnowledgeDoc>(`/api/admin/knowledge/${docId}`, {
    method: "PUT",
    body: formData,
  });
}

export async function deleteAdminKnowledge(docId: number) {
  return request<void>(`/api/admin/knowledge/${docId}`, { method: "DELETE" });
}

export async function logout() {
  try {
    await request<void>("/api/auth/logout", { method: "POST" });
  } catch {
    // Client still clears local token even if audit call fails
  } finally {
    removeToken();
  }
}

export function getUploadUrl(filePath: string | null): string | null {
  if (!filePath) return null;
  if (filePath.startsWith("http")) return filePath;
  return `${getApiUrl()}${filePath}`;
}

// ── LMS Admin ─────────────────────────────────────────────────────────────────

export type CourseCategory = "SAFETY" | "CREDIT" | "HR" | "GENERAL" | "COMPLIANCE";
export type AssignmentStatus = "ASSIGNED" | "IN_PROGRESS" | "COMPLETED" | "EXPIRED";

export interface LmsCourseListItem {
  id: number;
  title: string;
  description: string | null;
  category: CourseCategory | null;
  is_mandatory: boolean;
  deadline_days: number | null;
  passing_score: number;
  max_attempts: number;
  estimated_duration_minutes: number;
  is_active: boolean;
  created_at: string;
  quiz_count: number;
}

export interface LmsQuiz {
  id: number;
  course_id: number;
  question: string;
  options: string[];
  correct_answer_index: number;
  explanation: string | null;
}

export interface LmsCourseDetail extends LmsCourseListItem {
  content_html: string | null;
  file_path: string | null;
  quizzes: LmsQuiz[];
}

export interface LmsAssignment {
  id: number;
  user_id: number;
  course_id: number;
  username: string;
  full_name: string;
  assigned_at: string;
  deadline_date: string | null;
  status: AssignmentStatus;
  completed_at: string | null;
  attempts_count: number;
  best_score: number | null;
}

export interface LmsOverview {
  total_courses: number;
  active_courses: number;
  total_users: number;
  completion_rate: number;
  overdue_courses_count: number;
  avg_score: number | null;
  recent_assignments: LmsAssignment[];
}

export interface UserCourseItem {
  course_id: number;
  title: string;
  description: string | null;
  category: CourseCategory | null;
  is_mandatory: boolean;
  passing_score: number;
  max_attempts: number;
  estimated_duration_minutes: number;
  assignment_id: number;
  status: AssignmentStatus;
  deadline_date: string | null;
  attempts_count: number;
  best_score: number | null;
  completed_at: string | null;
}

export interface QuizAnswerReview {
  quiz_id: number;
  question: string;
  options: string[];
  selected_index: number;
  correct_index: number;
  is_correct: boolean;
  explanation: string | null;
}

export interface QuizSubmitResult {
  score: number;
  passed: boolean;
  correct_answers: number;
  total_questions: number;
  attempt_id: number;
  reviews: QuizAnswerReview[];
}

export interface NotificationItem {
  id: number;
  type: string;
  title: string;
  message: string;
  course_id: number | null;
  is_read: boolean;
  created_at: string;
  link: string | null;
}

function buildQuery(params: Record<string, string | number | boolean | undefined>) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== "") sp.set(k, String(v));
  });
  const q = sp.toString();
  return q ? `?${q}` : "";
}

// ── Audit log ─────────────────────────────────────────────────────────────────

export interface AuditLogEntry {
  id: number;
  user_id: number | null;
  username: string | null;
  action: string;
  object_type: string | null;
  object_id: string | null;
  success: boolean;
  ip_address: string | null;
  created_at: string;
}

export interface AuditLogList {
  items: AuditLogEntry[];
  total: number;
  page: number;
  page_size: number;
  retention_months: number;
}

export async function getAuditLogs(params?: {
  user_id?: number;
  action?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
}) {
  return request<AuditLogList>(`/api/admin/audit${buildQuery(params ?? {})}`);
}

export async function getAuditActions() {
  return request<string[]>("/api/admin/audit/actions");
}

export async function getLmsAdminCourses(params?: {
  category?: string;
  is_mandatory?: boolean;
  is_active?: boolean;
  search?: string;
}) {
  return request<LmsCourseListItem[]>(`/api/admin/courses${buildQuery(params ?? {})}`);
}

export async function getLmsAdminCourse(id: number) {
  return request<LmsCourseDetail>(`/api/admin/courses/${id}`);
}

export async function createLmsCourse(formData: FormData) {
  return request<LmsCourseDetail>("/api/admin/courses", { method: "POST", body: formData });
}

export async function updateLmsCourse(id: number, formData: FormData) {
  return request<LmsCourseDetail>(`/api/admin/courses/${id}`, { method: "PUT", body: formData });
}

export async function deleteLmsCourse(id: number) {
  return request<void>(`/api/admin/courses/${id}`, { method: "DELETE" });
}

export async function addLmsQuiz(courseId: number, data: Omit<LmsQuiz, "id" | "course_id">) {
  return request<LmsQuiz>(`/api/admin/courses/${courseId}/quizzes`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateLmsQuiz(quizId: number, data: Partial<Omit<LmsQuiz, "id" | "course_id">>) {
  return request<LmsQuiz>(`/api/admin/quizzes/${quizId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteLmsQuiz(quizId: number) {
  return request<void>(`/api/admin/quizzes/${quizId}`, { method: "DELETE" });
}

export async function assignLmsCourse(courseId: number, userIds: number[]) {
  return request<LmsAssignment[]>(`/api/admin/courses/${courseId}/assign`, {
    method: "POST",
    body: JSON.stringify({ user_ids: userIds }),
  });
}

export async function bulkAssignLmsCourses(courseIds: number[], userIds: number[]) {
  return request<{ assigned_count: number }>("/api/admin/courses/assign/bulk", {
    method: "POST",
    body: JSON.stringify({ course_ids: courseIds, user_ids: userIds }),
  });
}

export async function getLmsCourseAssignments(courseId: number) {
  return request<LmsAssignment[]>(`/api/admin/courses/${courseId}/assignments`);
}

export async function extendLmsAssignmentDeadline(assignmentId: number, newDeadlineDate: string) {
  return request<LmsAssignment>(`/api/admin/lms/assignments/${assignmentId}/extend-deadline`, {
    method: "POST",
    body: JSON.stringify({ new_deadline_date: newDeadlineDate }),
  });
}

export interface DeadlineExtensionLog {
  id: number;
  assignment_id: number;
  old_deadline: string | null;
  new_deadline: string;
  changed_by_user_id: number | null;
  changed_by_name: string | null;
  changed_at: string;
}

export async function getLmsDeadlineLogs(assignmentId: number) {
  return request<DeadlineExtensionLog[]>(
    `/api/admin/lms/assignments/${assignmentId}/deadline-logs`,
  );
}

export async function approveLmsUnblock(assignmentId: number) {
  return request<{ ok: boolean; assignment: LmsAssignment }>(
    `/api/admin/lms/assignments/${assignmentId}/approve-unblock`,
    { method: "POST" },
  );
}

export async function getLmsOverview() {
  return request<LmsOverview>("/api/admin/lms/analytics/overview");
}

export async function getLmsScoreDistribution() {
  return request<{ range: string; count: number }[]>(
    "/api/admin/lms/analytics/score-distribution",
  );
}

export async function getLmsCompletionDynamics() {
  return request<{ date: string; count: number }[]>(
    "/api/admin/lms/analytics/completion-dynamics",
  );
}

export async function getLmsCourseResults(courseId: number, status?: string) {
  return request<
    {
      user_id: number;
      username: string;
      full_name: string;
      status: AssignmentStatus;
      attempts_count: number;
      best_score: number | null;
      last_attempt_at: string | null;
      deadline_date: string | null;
    }[]
  >(`/api/admin/lms/analytics/courses/${courseId}/results${buildQuery({ status })}`);
}

export async function getLmsOverdueAssignments() {
  return request<LmsAssignment[]>("/api/admin/lms/deadlines/overdue");
}

export async function sendLmsDeadlineWarnings() {
  return request<{ warnings_sent: number }>("/api/admin/lms/notifications/send-deadline-warnings", {
    method: "POST",
  });
}

export async function exportLmsReport(params?: { course_id?: number; status?: string }) {
  const token = getToken();
  const response = await fetch(
    `${getApiUrl()}/api/admin/lms/reports/export${buildQuery(params ?? {})}`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  );
  if (!response.ok) throw new ApiError(response.status, "Ошибка экспорта");
  return response.blob();
}

// ── LMS User ──────────────────────────────────────────────────────────────────

export async function getMyLmsCourses(status?: string) {
  return request<UserCourseItem[]>(`/api/lms/courses${buildQuery({ status })}`);
}

export async function getMyLmsCourse(courseId: number) {
  return request<UserCourseItem & { content_html: string | null; file_path: string | null; id: number }>(
    `/api/lms/courses/${courseId}`,
  );
}

export async function startLmsCourse(courseId: number) {
  return request<{ status: string }>(`/api/lms/courses/${courseId}/start`, { method: "POST" });
}

export async function getLmsQuiz(courseId: number) {
  return request<{ id: number; question: string; options: string[] }[]>(
    `/api/lms/courses/${courseId}/quiz`,
  );
}

export async function submitLmsQuiz(courseId: number, answers: Record<number, number>) {
  return request<QuizSubmitResult>(`/api/lms/courses/${courseId}/quiz/submit`, {
    method: "POST",
    body: JSON.stringify({ answers }),
  });
}

export async function requestLmsUnblock(courseId: number) {
  return request<{ ok: boolean; notified_count: number }>(
    `/api/lms/courses/${courseId}/request-unblock`,
    { method: "POST" },
  );
}

export interface LmsDashboardAlert {
  assignment_id: number;
  course_id: number;
  course_title: string;
  status: AssignmentStatus;
  deadline_date: string | null;
  is_expired: boolean;
}

export async function getLmsDashboardAlerts() {
  return request<LmsDashboardAlert[]>("/api/lms/dashboard-alerts");
}

export async function getLmsCourseAttempts(courseId: number) {
  return request<
    {
      id: number;
      score: number | null;
      passed: boolean | null;
      started_at: string;
      completed_at: string | null;
      is_final: boolean;
      reviews: QuizAnswerReview[];
    }[]
  >(`/api/lms/courses/${courseId}/results`);
}

export async function getMyLmsProgress() {
  return request<{
    total_assigned: number;
    completed: number;
    in_progress: number;
    overdue: number;
    courses: UserCourseItem[];
  }>("/api/lms/my-progress");
}

// ── Notifications ─────────────────────────────────────────────────────────────

export async function getNotifications(params?: { is_read?: boolean; page?: number }) {
  return request<{ items: NotificationItem[]; total: number; page: number; page_size: number }>(
    `/api/notifications${buildQuery(params ?? {})}`,
  );
}

export async function markNotificationRead(id: number) {
  return request<NotificationItem>(`/api/notifications/${id}/read`, { method: "PUT" });
}

export async function markAllNotificationsRead() {
  return request<void>("/api/notifications/read-all", { method: "PUT" });
}

export async function getUnreadNotificationCount() {
  return request<{ count: number }>("/api/notifications/unread-count");
}

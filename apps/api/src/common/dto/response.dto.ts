/**
 * M-1: Shared response DTOs for the API.
 * Replacing raw Promise<any> return types with typed interfaces
 * improves IDE support, refactoring safety, and self-documentation.
 *
 * These are partial / progressive — not every field is listed,
 * but the critical response shapes for auth, courses, and enrollments
 * are covered first as the highest-traffic endpoints.
 */

// ─── Auth ──────────────────────────────────────────────────────────────────────

export interface LoginResponseDto {
  userId: string;
  email: string;
  roles: string[];
  message: string;
}

export interface UserSessionDto {
  id: string;
  email: string;
  roles: Array<{ id: string; name: string }>;
  createdAt: Date;
}

// ─── Pagination ────────────────────────────────────────────────────────────────

export interface PaginatedMetaDto {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponseDto<T> {
  data: T[];
  meta: PaginatedMetaDto;
}

// ─── Courses ───────────────────────────────────────────────────────────────────

export interface CourseTrainerDto {
  id: string;
  user: { email: string };
}

export interface CourseSummaryDto {
  id: string;
  title: string;
  slug: string;
  description: string;
  difficulty: string;
  status: string;
  category: { id: string; name: string } | null;
  trainer: CourseTrainerDto | null;
  _count: { enrollments: number; modules: number };
  createdAt: Date;
  updatedAt: Date;
}

export interface CourseDetailDto extends CourseSummaryDto {
  modules: CourseModuleDto[];
  courseSkills: Array<{ skill: { id: string; name: string } }>;
  prerequisites: Array<{ prerequisite: { id: string; title: string; slug: string } }>;
}

export interface CourseModuleDto {
  id: string;
  title: string;
  description: string | null;
  sequenceOrder: number;
  contentUrl: string | null;
  resources: CourseResourceDto[];
}

export interface CourseResourceDto {
  id: string;
  title: string;
  type: string;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: Date;
}

// ─── Enrollment ────────────────────────────────────────────────────────────────

export interface EnrollmentSummaryDto {
  id: string;
  status: string;
  enrolledAt: Date;
  completedAt: Date | null;
  course: CourseSummaryDto;
  certificate?: CertificateSummaryDto | null;
}

// ─── Certificate ───────────────────────────────────────────────────────────────

export interface CertificateSummaryDto {
  id: string;
  certificateNumber: string;
  issuedAt: Date;
  verificationToken: string;
}

// ─── Assessment ────────────────────────────────────────────────────────────────

export interface AttemptResultDto {
  attemptId: string;
  assessmentId: string;
  score: number;
  maxScore: number;
  passed: boolean;
  percentile: number;
  submittedAt: Date;
  answers: Array<{
    questionId: string;
    selectedOptionId: string;
    isCorrect: boolean;
    pointsEarned: number;
  }>;
}

// ─── Matching ──────────────────────────────────────────────────────────────────

export interface MatchResultDto {
  trainerId: string;
  trainerUserId: string;
  trainerName?: string;
  matchScore: number;
  reasons: string[];
  breakdown: Record<string, number>;
}

export interface MatchResponseDto {
  traineeProfileId: string;
  neededSkills: number;
  totalTrainersEvaluated: number;
  matches: MatchResultDto[];
  computedAt: string;
}

// ─── Admin ─────────────────────────────────────────────────────────────────────

export interface AdminDashboardDto {
  users: { trainees: number; trainers: number };
  courses: { total: number; published: number };
  enrollments: { total: number; completed: number; completionRate: number };
  certificates: number;
  skillGaps: Array<{ gapClassification: string; _count: { _all: number } }>;
}

// ─── Audit ─────────────────────────────────────────────────────────────────────

export interface AuditLogDto {
  id: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  ipAddress: string | null;
  metadata: Record<string, any> | null;
  createdAt: Date;
}

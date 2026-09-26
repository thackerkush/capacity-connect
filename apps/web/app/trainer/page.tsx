'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { StatCard } from '@/components/StatCard';
import { SkeletonCard } from '@/components/SkeletonCard';
import { AddModuleModal } from '@/components/AddModuleModal';
import { api } from '@/lib/api-client';
import { toast } from 'sonner';
import {
  BookOpen,
  Users,
  PlusCircle,
  Sparkles,
  FileText,
  Layers,
  SendHorizonal,
  Archive,
  Clock,
  CheckCircle2,
  XCircle,
  BadgeAlert,
} from 'lucide-react';

// ─── Status Badge ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  string,
  { label: string; className: string; Icon: React.ElementType }
> = {
  draft: {
    label: 'Draft',
    className: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
    Icon: FileText,
  },
  pending_approval: {
    label: 'Pending Review',
    className: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    Icon: Clock,
  },
  published: {
    label: 'Published',
    className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    Icon: CheckCircle2,
  },
  archived: {
    label: 'Archived',
    className: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    Icon: Archive,
  },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG['draft'];
  const Icon = cfg.Icon;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${cfg.className}`}
    >
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

// ─── Course Action Buttons ────────────────────────────────────────────────────

interface CourseActionsProps {
  course: any;
  onAddModule: (course: any) => void;
  onSubmit: (courseId: string, moduleCount: number) => void;
  onArchive: (courseId: string) => void;
}

function CourseActions({ course, onAddModule, onSubmit, onArchive }: CourseActionsProps) {
  const moduleCount: number = course._count?.modules ?? 0;

  if (course.status === 'draft') {
    return (
      <div className="flex items-center gap-2 flex-wrap justify-end">
        {/* Add Module */}
        <button
          onClick={() => onAddModule(course)}
          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-all flex items-center gap-1.5"
        >
          <Layers className="w-3.5 h-3.5" />
          Add Module
        </button>

        {/* Submit for Approval */}
        <div className="relative group">
          <button
            onClick={() => onSubmit(course.id, moduleCount)}
            disabled={moduleCount === 0}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <SendHorizonal className="w-3.5 h-3.5" />
            Submit for Review
          </button>

          {/* Tooltip when modules are missing */}
          {moduleCount === 0 && (
            <div className="absolute bottom-full right-0 mb-2 w-52 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-[11px] text-amber-400 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
              <div className="flex items-start gap-1.5">
                <BadgeAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                Add at least 1 module before submitting for review.
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (course.status === 'pending_approval') {
    return (
      <div className="flex items-center gap-1.5 text-amber-400 text-xs font-semibold">
        <Clock className="w-4 h-4 animate-pulse" />
        Under Administrative Review
      </div>
    );
  }

  if (course.status === 'published') {
    return (
      <button
        onClick={() => onArchive(course.id)}
        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 transition-all flex items-center gap-1.5"
      >
        <Archive className="w-3.5 h-3.5" />
        Archive Course
      </button>
    );
  }

  if (course.status === 'archived') {
    return (
      <div className="flex items-center gap-1.5 text-rose-400 text-xs font-semibold">
        <Archive className="w-4 h-4" />
        Archived
      </div>
    );
  }

  return null;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TrainerDashboard() {
  const [courses, setCourses] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Modal state
  const [addModuleCourse, setAddModuleCourse] = useState<any | null>(null);

  const fetchData = useCallback(() => {
    setIsLoading(true);
    Promise.all([
      // H-7: Fetch only THIS trainer's courses (all statuses).
      // Passing `mine=true` — the backend resolves the trainer from the JWT cookie.
      api.get('/courses?mine=true&limit=50').catch(() => ({ data: [] })),
      api.get('/trainer/profile').catch(() => null),
    ])
      .then(([coursesRes, profileRes]) => {
        setCourses(coursesRes.data || []);
        setProfile(profileRes);
      })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Action Handlers ──────────────────────────────────────────────────────────

  const handleOpenAddModule = (course: any) => {
    setAddModuleCourse(course);
  };

  const handleSubmitForReview = async (courseId: string, moduleCount: number) => {
    if (moduleCount === 0) {
      toast.error('Add at least one module before submitting for review.');
      return;
    }
    try {
      await api.post(`/courses/${courseId}/submit`);
      toast.success('Course submitted for administrative review! You will be notified upon approval.');
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Submission failed. Please try again.');
    }
  };

  const handleArchive = async (courseId: string) => {
    if (!window.confirm('Archive this published course? Trainees will no longer be able to enroll.')) return;
    try {
      await api.patch(`/courses/${courseId}/archive`);
      toast.success('Course archived successfully.');
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Archive failed. Please try again.');
    }
  };

  // ── Derived Stats ────────────────────────────────────────────────────────────

  const totalEnrollments = courses.reduce(
    (acc, c) => acc + (c._count?.enrollments ?? 0),
    0,
  );
  const pendingCount = courses.filter((c) => c.status === 'pending_approval').length;
  const publishedCount = courses.filter((c) => c.status === 'published').length;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Trainer Studio Console
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Author courses, upload learning resources, build MCQ question banks, and monitor student metrics.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/trainer/courses/new"
            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 font-bold text-xs text-white shadow-lg shadow-blue-500/20 transition-all flex items-center gap-1.5"
          >
            <PlusCircle className="w-4 h-4" /> Build Course
          </Link>
          <Link
            href="/trainer/assessments/new"
            className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 font-bold text-xs text-white shadow-lg shadow-purple-500/20 transition-all flex items-center gap-1.5"
          >
            <FileText className="w-4 h-4" /> Author Assessment
          </Link>
        </div>
      </div>

      {/* ── Stats Overview ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard
          title="Authored Courses"
          value={courses.length}
          subtitle="Capacity modules"
          icon={BookOpen}
          color="purple"
        />
        <StatCard
          title="Active Students"
          value={totalEnrollments}
          subtitle="Enrolled trainees"
          icon={Users}
          color="blue"
        />
        <StatCard
          title="Published Courses"
          value={publishedCount}
          subtitle="Live in catalog"
          icon={CheckCircle2}
          color="emerald"
        />
        <StatCard
          title="Average Rating"
          value={
            profile?.trainerRatingAvg
              ? `${Number(profile.trainerRatingAvg).toFixed(1)} / 5.0`
              : 'N/A'
          }
          subtitle="Trainee satisfaction"
          icon={Sparkles}
          color="amber"
        />
      </div>

      {/* ── Pending Review Banner ── */}
      {pendingCount > 0 && (
        <div className="flex items-center gap-3 px-5 py-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm font-medium">
          <Clock className="w-5 h-5 shrink-0 animate-pulse" />
          <span>
            You have{' '}
            <strong>{pendingCount}</strong>{' '}
            {pendingCount === 1 ? 'course' : 'courses'} awaiting administrative review.
          </span>
        </div>
      )}

      {/* ── Courses List ── */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-white">Authored Course Modules</h2>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-4">
            <SkeletonCard count={3} />
          </div>
        ) : courses.length > 0 ? (
          <div className="space-y-3">
            {courses.map((course) => (
              <div
                key={course.id}
                className="glass-card rounded-2xl p-5 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                {/* Course Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <StatusBadge status={course.status} />
                    <span className="text-xs text-slate-500">{course.category?.name}</span>
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                      {course.difficulty}
                    </span>
                  </div>
                  <h4 className="text-base font-bold text-white truncate">{course.title}</h4>
                  <div className="flex items-center gap-4 mt-1.5">
                    <span className="text-xs text-slate-400">
                      <span className="font-semibold text-slate-300">
                        {course._count?.modules ?? 0}
                      </span>{' '}
                      {(course._count?.modules ?? 0) === 1 ? 'Module' : 'Modules'}
                    </span>
                    <span className="text-xs text-slate-400">
                      <span className="font-semibold text-emerald-400">
                        {course._count?.enrollments ?? 0}
                      </span>{' '}
                      Enrolled
                    </span>
                    <span className="text-xs text-slate-500">
                      {course.durationMinutes} min
                    </span>
                  </div>
                </div>

                {/* Contextual Actions */}
                <div className="shrink-0">
                  <CourseActions
                    course={course}
                    onAddModule={handleOpenAddModule}
                    onSubmit={handleSubmitForReview}
                    onArchive={handleArchive}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="glass-card p-8 rounded-2xl text-center text-slate-400 text-sm">
            You haven't authored any courses yet.{' '}
            <Link href="/trainer/courses/new" className="text-blue-400 hover:underline font-semibold">
              Build your first course
            </Link>
            .
          </div>
        )}
      </div>

      {/* ── Add Module Modal ── */}
      {addModuleCourse && (
        <AddModuleModal
          courseId={addModuleCourse.id}
          courseTitle={addModuleCourse.title}
          isOpen={!!addModuleCourse}
          onClose={() => setAddModuleCourse(null)}
          onSuccess={fetchData}
        />
      )}
    </div>
  );
}

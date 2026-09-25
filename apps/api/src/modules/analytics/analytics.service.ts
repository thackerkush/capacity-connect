import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CourseStatus, EnrollmentStatus } from '@repo/db';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Admin dashboard metrics overview
   */
  async getAdminDashboard(): Promise<any> {
    const [
      totalTrainees,
      totalTrainers,
      totalCourses,
      publishedCourses,
      totalEnrollments,
      completedEnrollments,
      totalCertificates,
    ] = await Promise.all([
      this.prisma.traineeProfile.count(),
      this.prisma.trainerProfile.count(),
      // M-5: Exclude soft-deleted courses from the totals
      this.prisma.course.count({ where: { deletedAt: null } }),
      this.prisma.course.count({ where: { status: CourseStatus.published, deletedAt: null } }),
      this.prisma.enrollment.count(),
      this.prisma.enrollment.count({ where: { status: EnrollmentStatus.completed } }),
      this.prisma.certificate.count(),
    ]);

    // Top critical skill gaps across the org
    const topGaps = await this.prisma.skillGapAnalysis.groupBy({
      by: ['gapClassification'],
      _count: { _all: true },
    });

    return {
      users: {
        trainees: totalTrainees,
        trainers: totalTrainers,
      },
      courses: {
        total: totalCourses,
        published: publishedCourses,
      },
      enrollments: {
        total: totalEnrollments,
        completed: completedEnrollments,
        completionRate: totalEnrollments > 0 ? (completedEnrollments / totalEnrollments) * 100 : 0,
      },
      certificates: totalCertificates,
      skillGaps: topGaps,
    };
  }

  /**
   * Trainee personal dashboard stats
   */
  async getTraineeDashboard(userId: string): Promise<any> {
    const profile = await this.prisma.traineeProfile.findUnique({
      where: { userId },
    });
    if (!profile) throw new NotFoundException('Trainee profile not found');

    const [
      activeEnrollments,
      completedEnrollments,
      certificates,
      competencies,
    ] = await Promise.all([
      this.prisma.enrollment.count({
        where: { traineeId: profile.id, status: { in: [EnrollmentStatus.started, EnrollmentStatus.in_progress] } },
      }),
      this.prisma.enrollment.count({
        where: { traineeId: profile.id, status: EnrollmentStatus.completed },
      }),
      this.prisma.certificate.count({
        where: { traineeId: profile.id },
      }),
      this.prisma.traineeCompetency.findMany({
        where: { traineeProfileId: profile.id },
        select: { currentLevel: true, requiredLevel: true },
      }),
    ]);

    let avgCurrent = 0;
    let avgRequired = 0;
    if (competencies.length > 0) {
      avgCurrent = competencies.reduce((acc, c) => acc + c.currentLevel, 0) / competencies.length;
      avgRequired = competencies.reduce((acc, c) => acc + c.requiredLevel, 0) / competencies.length;
    }

    return {
      activeEnrollments,
      completedEnrollments,
      certificates,
      competencyStats: {
        assessedSkills: competencies.length,
        avgCurrentLevel: avgCurrent,
        avgRequiredLevel: avgRequired,
        overallGap: Math.max(0, avgRequired - avgCurrent),
      },
    };
  }

  /**
   * Organization-wide Competency Heatmap
   * M-6: Replaced in-memory aggregation with a raw SQL GROUP BY query.
   * The previous approach loaded every TraineeCompetency + joins into Node.js memory,
   * which could cause OOM with thousands of employees.
   */
  async getHeatmap(): Promise<any> {
    const rows: Array<{
      department: string;
      skill: string;
      avg_current: number;
      avg_required: number;
      count: bigint;
    }> = await this.prisma.$queryRaw`
      SELECT
        COALESCE(d.name, 'Unassigned')        AS department,
        s.name                                 AS skill,
        AVG(tc."currentLevel")::float          AS avg_current,
        AVG(tc."requiredLevel")::float         AS avg_required,
        COUNT(*)                               AS count
      FROM "TraineeCompetency" tc
      JOIN "TraineeProfile"    tp ON tp.id = tc."traineeProfileId"
      JOIN "Competency"        c  ON c.id  = tc."competencyId"
      JOIN "CompetencySkill"   cs ON cs."competencyId" = c.id
      JOIN "Skill"             s  ON s.id  = cs."skillId"
      LEFT JOIN "Department"   d  ON d.id  = tp."departmentId"
      GROUP BY COALESCE(d.name, 'Unassigned'), s.name
      ORDER BY department, skill
    `;

    // Group flat rows into { department, skills[] } structure
    const heatmap = new Map<string, { skill: string; avgCurrentLevel: number; avgRequiredLevel: number; count: number }[]>();
    for (const row of rows) {
      if (!heatmap.has(row.department)) heatmap.set(row.department, []);
      heatmap.get(row.department)!.push({
        skill: row.skill,
        avgCurrentLevel: Number(row.avg_current),
        avgRequiredLevel: Number(row.avg_required),
        count: Number(row.count),
      });
    }

    return [...heatmap.entries()].map(([department, skills]) => ({ department, skills }));
  }

  /**
   * Critical gap feed - trainees with gap classification 'critical'
   */
  async getCriticalGapFeed(): Promise<any> {
    const gaps = await this.prisma.skillGapAnalysis.findMany({
      where: { gapClassification: 'critical' },
      include: {
        traineeCompetency: {
          include: {
            competency: { select: { name: true } },
            traineeProfile: {
              include: { user: { select: { email: true } } },
            },
          },
        },
      },
      orderBy: { gapValue: 'desc' },
      take: 10,
    });

    return gaps.map((g) => ({
      id: g.id,
      gapValue: g.gapValue,
      gapClassification: g.gapClassification,
      trainee: {
        user: { email: g.traineeCompetency.traineeProfile.user.email },
      },
      traineeCompetency: {
        competency: { name: g.traineeCompetency.competency.name },
      },
    }));
  }

  /**
   * Difficult assessments - assessments where pass rate < 50%
   */
  async getDifficultAssessments(): Promise<any> {
    const assessments = await this.prisma.assessment.findMany({
      include: {
        course: { select: { title: true } },
        attempts: {
          where: { submittedAt: { not: null } },
          select: { passed: true },
        },
      },
    });

    return assessments
      .map((a) => {
        const submitted = a.attempts.length;
        const passed = a.attempts.filter((at) => at.passed).length;
        const passRatePct = submitted > 0 ? Math.round((passed / submitted) * 100) : null;
        return {
          id: a.id,
          subject: a.subject,
          course: a.course,
          passRatePct,
          submitted,
        };
      })
      .filter((a) => a.passRatePct !== null && a.passRatePct < 50)
      .sort((a, b) => (a.passRatePct ?? 0) - (b.passRatePct ?? 0));
  }

  /**
   * Reports - Courses (returns JSON suitable for CSV export on the client)
   * M-5: Now filters out soft-deleted courses with deletedAt: null
   */
  async getCoursesReport(): Promise<any> {
    const courses = await this.prisma.course.findMany({
      where: { deletedAt: null }, // M-5: exclude soft-deleted courses from reports
      include: {
        category: true,
        trainer: { include: { user: true } },
        _count: {
          select: { enrollments: true, certificates: true, modules: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return courses.map((c) => ({
      id: c.id,
      title: c.title,
      slug: c.slug,
      category: c.category?.name ?? 'Unknown',
      trainerEmail: c.trainer?.user?.email ?? 'Unknown',
      difficulty: c.difficulty,
      status: c.status,
      moduleCount: c._count.modules,
      enrollmentCount: c._count.enrollments,
      certificateCount: c._count.certificates,
      completionRatePct:
        c._count.enrollments > 0
          ? Math.round((c._count.certificates / c._count.enrollments) * 100)
          : 0,
      createdAt: c.createdAt,
    }));
  }
}

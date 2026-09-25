import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { ExplainSkillGapDto, RecommendTrainersDto, DraftCourseOutlineDto } from './dto/ai-request.dto';
import { CourseStatus, Difficulty } from '@repo/db';

/**
 * AI Service for Capacity Connect.
 *
 * SECURITY CONSTRAINTS ENFORCED:
 * 1. Assistive Only: This service only provides suggestions and explanations.
 * 2. No Permission-Table Writes: This service structurally lacks methods to mutate User, Role, Permission, UserRole, or RolePermission tables.
 * 3. Draft Status: Any generative content (e.g. course outlines) that is persisted is strictly forced to 'draft' status.
 */
@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Explains a skill gap in natural language. (READ-ONLY)
   * H-2: Audit log is written inside a transaction for consistency.
   */
  async explainSkillGap(dto: ExplainSkillGapDto, userId: string, ipAddress: string | null = null): Promise<any> {
    const gap = await this.prisma.skillGapAnalysis.findUnique({
      where: { id: dto.skillGapId },
      include: {
        traineeCompetency: {
          include: { competency: true },
        },
      },
    });

    if (!gap) throw new NotFoundException('Skill gap not found');

    // Simulate AI generation delay
    await new Promise((resolve) => setTimeout(resolve, 800));

    const compName = gap.traineeCompetency.competency.name;
    const reqLevel = gap.traineeCompetency.requiredLevel;
    const curLevel = gap.traineeCompetency.currentLevel;

    const result = {
      skillGapId: gap.id,
      explanation: `AI Analysis: The gap in ${compName} (Required: Level ${reqLevel}, Current: Level ${curLevel}) indicates a ${gap.gapClassification} priority. To bridge this ${gap.gapValue}-level gap, we recommend focusing on practical applications and enrolling in intermediate-level courses covering ${compName}.`,
      suggestedActions: [
        `Enroll in a course for ${compName}`,
        `Find a mentor specializing in ${compName}`,
        `Complete a hands-on project to reach Level ${curLevel + 1}`,
      ],
    };

    // H-2: Wrap audit log in a transaction to stay consistent with the rest of the codebase.
    await this.prisma.$transaction(async (tx) => {
      await this.auditService.log({
        actorUserId: userId,
        action: 'ai.explain_skill_gap',
        entityType: 'SkillGapAnalysis',
        entityId: gap.id,
        ipAddress,
        metadata: null,
        prisma: tx,
      });
    });

    return result;
  }

  /**
   * Recommends trainers using the Matching Engine results + AI narrative. (READ-ONLY)
   * H-2: Audit log is written inside a transaction for consistency.
   */
  async recommendTrainers(dto: RecommendTrainersDto, userId: string, ipAddress: string | null = null): Promise<any> {
    // We reuse the existing matching scores from Phase 8.
    const matches = await this.prisma.trainerMatchScore.findMany({
      where: { traineeId: dto.traineeId },
      orderBy: { matchScore: 'desc' },
      take: 3,
      include: {
        trainer: {
          include: { user: { select: { email: true } }, department: true },
        },
      },
    });

    // Simulate AI generation delay
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const recommendations = matches.map((match) => {
      const email = match.trainer.user.email;
      const dept = match.trainer.department?.name || 'External';
      const scorePct = Math.round(Number(match.matchScore) * 100);

      return {
        trainerId: match.trainer.id,
        email,
        matchScorePct: scorePct,
        aiNarrative: `Based on a ${scorePct}% match score, ${email} from ${dept} is highly recommended. Their expertise aligns perfectly with your current skill gaps, and their availability matches your schedule.`,
      };
    });

    const result = {
      traineeId: dto.traineeId,
      aiSummary: `We have identified ${recommendations.length} ideal mentors for your learning path based on your latest skill gap analysis.`,
      recommendations,
    };

    // H-2: Wrap audit log in a transaction for consistency.
    await this.prisma.$transaction(async (tx) => {
      await this.auditService.log({
        actorUserId: userId,
        action: 'ai.recommend_trainers',
        entityType: 'User',
        entityId: dto.traineeId,
        ipAddress,
        metadata: null,
        prisma: tx,
      });
    });

    return result;
  }

  /**
   * Generates a draft course outline.
   * ENFORCES DRAFT STATUS: If saved to DB, it forces status = 'draft'.
   * H-6: No longer auto-creates a category if none exist — throws instead.
   */
  async draftCourseOutline(dto: DraftCourseOutlineDto, trainerUserId: string, ipAddress: string | null = null): Promise<any> {
    const trainerProfile = await this.prisma.trainerProfile.findUnique({
      where: { userId: trainerUserId },
    });
    if (!trainerProfile) throw new ForbiddenException('Only trainers can draft courses');

    // H-6: Fail explicitly if no categories exist rather than silently polluting data.
    const categoryId = await this._requireDefaultCategoryId();

    // Simulate AI generation delay
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const aiTitle = `Mastering ${dto.topic}`;
    const aiDescription = `An AI-generated comprehensive guide to ${dto.topic}${dto.targetAudience ? ` tailored for ${dto.targetAudience}` : ''}.`;

    const aiModules = [
      { title: 'Introduction & Foundations', sequenceOrder: 1 },
      { title: 'Core Concepts', sequenceOrder: 2 },
      { title: 'Advanced Applications', sequenceOrder: 3 },
    ];

    return this.prisma.$transaction(async (tx) => {
      const draftCourse = await tx.course.create({
        data: {
          title: aiTitle,
          slug: `ai-draft-${Date.now()}`,
          description: aiDescription,
          trainerId: trainerProfile.id,
          categoryId,
          difficulty: (dto.difficulty as Difficulty) || Difficulty.beginner,
          status: CourseStatus.draft,
          modules: {
            create: aiModules,
          },
        },
        include: { modules: true },
      });

      await this.auditService.log({
        actorUserId: trainerUserId,
        action: 'ai.draft_course_outline',
        entityType: 'Course',
        entityId: draftCourse.id,
        ipAddress,
        metadata: { title: draftCourse.title },
        prisma: tx,
      });

      return {
        message: 'AI drafted a course outline successfully.',
        statusEnforced: CourseStatus.draft,
        course: draftCourse,
      };
    });
  }

  /**
   * H-6: Requires at least one category to exist.
   * Throws BadRequestException instead of silently creating one.
   */
  private async _requireDefaultCategoryId(): Promise<string> {
    const cat = await this.prisma.courseCategory.findFirst();
    if (!cat) {
      throw new BadRequestException(
        'No course categories exist. An admin must create at least one category before AI can draft courses.',
      );
    }
    return cat.id;
  }
}

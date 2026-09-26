import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import {
  ExplainSkillGapDto,
  RecommendTrainersDto,
  DraftCourseOutlineDto,
} from './dto/ai-request.dto';
import { CourseStatus, Difficulty } from '@repo/db';

// ─── Gemini API types ─────────────────────────────────────────────────────────

interface GeminiPart {
  text: string;
}

interface GeminiContent {
  parts: GeminiPart[];
}

interface GeminiRequest {
  contents: GeminiContent[];
  generationConfig?: {
    responseMimeType?: string;
    temperature?: number;
    maxOutputTokens?: number;
  };
}

// ─── Expected structured response shapes from Gemini ─────────────────────────

interface CourseOutlineGeminiResponse {
  title: string;
  description: string;
  modules: { title: string; sequenceOrder: number }[];
}

interface SkillGapGeminiResponse {
  explanation: string;
  suggestedActions: string[];
}

interface TrainerRecommendationGeminiResponse {
  aiSummary: string;
  narratives: { email: string; narrative: string }[];
}

/**
 * AI Service for Capacity Connect.
 *
 * SECURITY CONSTRAINTS ENFORCED:
 * 1. Assistive Only: This service only provides suggestions and explanations.
 * 2. No Permission-Table Writes: This service structurally lacks methods to mutate
 *    User, Role, Permission, UserRole, or RolePermission tables.
 * 3. Draft Status: Any generative content (e.g. course outlines) that is persisted
 *    is strictly forced to 'draft' status — Gemini cannot override this.
 * 4. Rate Limiting: A configurable delay (default: 4500ms) is enforced between Gemini
 *    API calls to stay within the free-tier limit of 15 req/min.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly provider: string;
  private readonly geminiApiKey: string;
  private readonly geminiDelayMs: number;
  private readonly geminiModel: string;
  private readonly geminiBaseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly config: ConfigService,
  ) {
    this.provider = this.config.get<string>('ai.provider') ?? 'stub';
    this.geminiApiKey = this.config.get<string>('ai.geminiApiKey') ?? '';
    this.geminiDelayMs = this.config.get<number>('ai.geminiDelayMs') ?? 4500;
    this.geminiModel = this.config.get<string>('ai.geminiModel') ?? 'gemini-2.0-flash';
    this.geminiBaseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';

    this.logger.log(`AI Provider: ${this.provider} | Model: ${this.geminiModel}`);
  }

  // ─── Private: Gemini HTTP call ────────────────────────────────────────────────

  /**
   * Sends a structured prompt to Gemini and returns the parsed JSON response.
   * Uses `responseMimeType: 'application/json'` to guarantee structured output.
   * Enforces a minimum delay before calling to respect free-tier rate limits.
   */
  private async callGemini<T>(prompt: string, retries = 2, modelOverride?: string): Promise<T> {
    if (!this.geminiApiKey) {
      throw new InternalServerErrorException(
        'GEMINI_API_KEY is not configured. Set it in your .env file.',
      );
    }

    const currentModel = modelOverride || this.geminiModel;

    // Rate-limit safety delay — stays within 15 req/min on the free tier
    await this._delay(this.geminiDelayMs);

    const url = `${this.geminiBaseUrl}/${currentModel}:generateContent`;

    const requestBody: GeminiRequest = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.7,
        maxOutputTokens: 1024,
      },
    };

    this.logger.debug(`Calling Gemini [${currentModel}] — prompt length: ${prompt.length}`);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-goog-api-key': this.geminiApiKey,
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(12000),
      });
    } catch (err: any) {
      this.logger.warn(`Network error with Gemini [${currentModel}]: ${err?.message}`);
      if (currentModel !== 'gemini-flash-latest') {
        this.logger.log(`Attempting fallback model 'gemini-flash-latest'...`);
        return this.callGemini<T>(prompt, 1, 'gemini-flash-latest');
      }
      throw new InternalServerErrorException('Failed to reach the Gemini API. Check network connectivity.');
    }

    // 503 (overloaded) or 404 (model deprecated/unavailable) → try fallback model or retry
    if ((response.status === 503 || response.status === 404) && currentModel !== 'gemini-flash-latest') {
      this.logger.warn(`Gemini [${currentModel}] returned ${response.status}. Switching to fallback model 'gemini-flash-latest'...`);
      return this.callGemini<T>(prompt, 1, 'gemini-flash-latest');
    }

    // 503 retry with exponential backoff on current model
    if (response.status === 503 && retries > 0) {
      const backoffMs = (3 - retries) * 2000 + 1000;
      this.logger.warn(`Gemini 503 received. Retrying in ${backoffMs}ms (${retries} retries left)...`);
      await this._delay(backoffMs);
      return this.callGemini<T>(prompt, retries - 1, currentModel);
    }

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(`Gemini API error ${response.status}: ${errorText}`);
      throw new InternalServerErrorException(
        `Gemini API returned ${response.status}. Check your API key and quota.`,
      );
    }

    const raw = await response.json() as any;

    // Extract the text content from Gemini's response envelope
    const textContent: string = raw?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';

    try {
      return JSON.parse(textContent) as T;
    } catch {
      this.logger.error('Failed to parse Gemini JSON response', textContent);
      throw new InternalServerErrorException('Gemini returned malformed JSON. Try again.');
    }
  }

  // ─── Private: Stub fallbacks (used when AI_PROVIDER=stub) ────────────────────

  private _stubSkillGap(compName: string, curLevel: number, reqLevel: number, gapValue: number, gapClassification: string): SkillGapGeminiResponse {
    return {
      explanation: `AI Analysis: The gap in ${compName} (Required: Level ${reqLevel}, Current: Level ${curLevel}) indicates a ${gapClassification} priority. To bridge this ${gapValue}-level gap, we recommend focusing on practical applications and enrolling in intermediate-level courses covering ${compName}.`,
      suggestedActions: [
        `Enroll in a course for ${compName}`,
        `Find a mentor specializing in ${compName}`,
        `Complete a hands-on project to reach Level ${curLevel + 1}`,
      ],
    };
  }

  private _stubCourseOutline(topic: string, targetAudience?: string): CourseOutlineGeminiResponse {
    return {
      title: `Mastering ${topic}`,
      description: `A comprehensive guide to ${topic}${targetAudience ? ` tailored for ${targetAudience}` : ''}.`,
      modules: [
        { title: 'Introduction & Foundations', sequenceOrder: 1 },
        { title: 'Core Concepts & Architecture', sequenceOrder: 2 },
        { title: 'Advanced Applications & Best Practices', sequenceOrder: 3 },
        { title: 'Real-World Projects & Case Studies', sequenceOrder: 4 },
      ],
    };
  }

  private _stubTrainerRecommendations(matches: any[]): TrainerRecommendationGeminiResponse {
    return {
      aiSummary: `We have identified ${matches.length} ideal mentors for your learning path based on your latest skill gap analysis.`,
      narratives: matches.map((m) => ({
        email: m.trainer.user.email,
        narrative: `Based on a ${Math.round(Number(m.matchScore) * 100)}% match score, ${m.trainer.user.email} is highly recommended. Their expertise aligns perfectly with your skill gaps.`,
      })),
    };
  }

  // ─── Public: explainSkillGap ──────────────────────────────────────────────────

  /**
   * Explains a skill gap in natural language using Gemini AI. (READ-ONLY)
   * Falls back to stub if AI_PROVIDER=stub.
   */
  async explainSkillGap(
    dto: ExplainSkillGapDto,
    userId: string,
    ipAddress: string | null = null,
  ): Promise<any> {
    const gap = await this.prisma.skillGapAnalysis.findUnique({
      where: { id: dto.skillGapId },
      include: {
        traineeCompetency: {
          include: { competency: true },
        },
      },
    });

    if (!gap) throw new NotFoundException('Skill gap not found');

    const compName = gap.traineeCompetency.competency.name;
    const reqLevel = gap.traineeCompetency.requiredLevel;
    const curLevel = gap.traineeCompetency.currentLevel;

    let aiResult: SkillGapGeminiResponse;

    if (this.provider === 'gemini') {
      const prompt = `
You are an enterprise learning and development AI assistant.
Analyze the following skill gap and provide a clear, actionable explanation.

Competency: "${compName}"
Current Level: ${curLevel} / 5
Required Level: ${reqLevel} / 5
Gap Value: ${gap.gapValue} levels
Gap Classification: ${gap.gapClassification}

Respond ONLY with valid JSON in this exact schema:
{
  "explanation": "A 2-3 sentence professional explanation of the gap and its business impact.",
  "suggestedActions": ["Action 1", "Action 2", "Action 3"]
}

Rules:
- suggestedActions must have exactly 3 specific, actionable items.
- Do NOT include any markdown, code fences, or extra text outside the JSON.
`.trim();

      try {
        aiResult = await this.callGemini<SkillGapGeminiResponse>(prompt);
      } catch (err: any) {
        this.logger.warn(`Gemini explainSkillGap failed: ${err?.message}. Falling back to template.`);
        aiResult = this._stubSkillGap(compName, curLevel, reqLevel, gap.gapValue, gap.gapClassification);
      }
    } else {
      await this._delay(800);
      aiResult = this._stubSkillGap(compName, curLevel, reqLevel, gap.gapValue, gap.gapClassification);
    }

    const result = {
      skillGapId: gap.id,
      explanation: aiResult.explanation,
      suggestedActions: aiResult.suggestedActions,
    };

    await this.prisma.$transaction(async (tx) => {
      await this.auditService.log({
        actorUserId: userId,
        action: 'ai.explain_skill_gap',
        entityType: 'SkillGapAnalysis',
        entityId: gap.id,
        ipAddress,
        metadata: { provider: this.provider },
        prisma: tx,
      });
    });

    return result;
  }

  // ─── Public: recommendTrainers ────────────────────────────────────────────────

  /**
   * Recommends trainers using match scores + Gemini-generated narratives. (READ-ONLY)
   */
  async recommendTrainers(
    dto: RecommendTrainersDto,
    userId: string,
    ipAddress: string | null = null,
  ): Promise<any> {
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

    let aiResult: TrainerRecommendationGeminiResponse;

    if (this.provider === 'gemini') {
      const matchSummary = matches.map((m) => ({
        email: m.trainer.user.email,
        department: m.trainer.department?.name ?? 'General',
        matchScorePct: Math.round(Number(m.matchScore) * 100),
        yearsExperience: m.trainer.yearsExperience,
        rating: m.trainer.trainerRatingAvg,
      }));

      const prompt = `
You are an enterprise learning and development AI assistant.
Generate personalized trainer recommendation narratives for a trainee.

Trainer candidates (top matches from the matching engine):
${JSON.stringify(matchSummary, null, 2)}

Respond ONLY with valid JSON in this exact schema:
{
  "aiSummary": "A 1-2 sentence overview of the recommendations.",
  "narratives": [
    { "email": "trainer@example.com", "narrative": "2-3 sentence personalized recommendation." }
  ]
}

Rules:
- Include one narrative object per trainer in the same order as the input.
- Be specific about their experience and department.
- Do NOT include any markdown, code fences, or extra text outside the JSON.
`.trim();

      try {
        aiResult = await this.callGemini<TrainerRecommendationGeminiResponse>(prompt);
      } catch (err: any) {
        this.logger.warn(`Gemini recommendTrainers failed: ${err?.message}. Falling back to template.`);
        aiResult = this._stubTrainerRecommendations(matches);
      }
    } else {
      await this._delay(1000);
      aiResult = this._stubTrainerRecommendations(matches);
    }

    const recommendations = matches.map((match, idx) => {
      const scorePct = Math.round(Number(match.matchScore) * 100);
      const narrativeObj = aiResult.narratives?.[idx];
      return {
        trainerId: match.trainer.id,
        email: match.trainer.user.email,
        matchScorePct: scorePct,
        aiNarrative: narrativeObj?.narrative ?? `${match.trainer.user.email} is a ${scorePct}% match for your learning path.`,
      };
    });

    const result = {
      traineeId: dto.traineeId,
      aiSummary: aiResult.aiSummary,
      recommendations,
    };

    await this.prisma.$transaction(async (tx) => {
      await this.auditService.log({
        actorUserId: userId,
        action: 'ai.recommend_trainers',
        entityType: 'User',
        entityId: dto.traineeId,
        ipAddress,
        metadata: { provider: this.provider },
        prisma: tx,
      });
    });

    return result;
  }

  // ─── Public: draftCourseOutline ───────────────────────────────────────────────

  /**
   * Generates a draft course outline using Gemini AI.
   * ENFORCES DRAFT STATUS: The saved course is ALWAYS set to status='draft'.
   * Gemini cannot escalate this — it only generates content, never writes status.
   */
  async draftCourseOutline(
    dto: DraftCourseOutlineDto,
    trainerUserId: string,
    ipAddress: string | null = null,
  ): Promise<any> {
    const trainerProfile = await this.prisma.trainerProfile.findUnique({
      where: { userId: trainerUserId },
    });
    if (!trainerProfile) throw new ForbiddenException('Only trainers can draft courses');

    const categoryId = await this._requireDefaultCategoryId();

    let outline: CourseOutlineGeminiResponse;

    if (this.provider === 'gemini') {
      const prompt = `
You are an expert enterprise learning curriculum designer.
Design a structured course outline for the following topic.

Topic: "${dto.topic}"
Target Audience: "${dto.targetAudience ?? 'Enterprise Professionals'}"
Difficulty Level: "${dto.difficulty ?? 'beginner'}"

Generate a professional course outline with 4-6 well-structured modules that progressively build knowledge.

Respond ONLY with valid JSON in this exact schema:
{
  "title": "A professional, engaging course title (max 80 chars)",
  "description": "A compelling 2-3 sentence course description covering learning outcomes and target skills (max 500 chars)",
  "modules": [
    { "title": "Module title (max 100 chars)", "sequenceOrder": 1 },
    { "title": "Module title (max 100 chars)", "sequenceOrder": 2 }
  ]
}

Rules:
- Modules must be 4 to 6 items minimum.
- sequenceOrder must be sequential starting from 1.
- Module titles should be descriptive and professional (e.g. "Module 1: Cloud Architecture Fundamentals").
- Do NOT include any markdown, code fences, or extra text outside the JSON.
`.trim();

      try {
        outline = await this.callGemini<CourseOutlineGeminiResponse>(prompt);
      } catch (err: any) {
        this.logger.warn(`Gemini draftCourseOutline failed: ${err?.message}. Falling back to template.`);
        outline = this._stubCourseOutline(dto.topic, dto.targetAudience);
      }

      // Validate the shape — fallback to stub fields if Gemini returns incomplete data
      if (!outline.title) outline.title = `Mastering ${dto.topic}`;
      if (!outline.description) outline.description = `A comprehensive guide to ${dto.topic}.`;
      if (!Array.isArray(outline.modules) || outline.modules.length === 0) {
        outline.modules = this._stubCourseOutline(dto.topic).modules;
      }
    } else {
      await this._delay(1500);
      outline = this._stubCourseOutline(dto.topic, dto.targetAudience);
    }

    return this.prisma.$transaction(async (tx) => {
      // SECURITY: Status is always forced to 'draft'. Gemini output CANNOT change this.
      const draftCourse = await tx.course.create({
        data: {
          title: outline.title,
          slug: `ai-draft-${Date.now()}`,
          description: outline.description,
          trainerId: trainerProfile.id,
          categoryId,
          difficulty: (dto.difficulty as Difficulty) || Difficulty.beginner,
          status: CourseStatus.draft, // ← HARDCODED, never from AI output
          modules: {
            create: outline.modules.map((m) => ({
              title: m.title,
              sequenceOrder: m.sequenceOrder,
            })),
          },
        },
        include: { modules: { orderBy: { sequenceOrder: 'asc' } } },
      });

      await this.auditService.log({
        actorUserId: trainerUserId,
        action: 'ai.draft_course_outline',
        entityType: 'Course',
        entityId: draftCourse.id,
        ipAddress,
        metadata: {
          title: draftCourse.title,
          provider: this.provider,
          moduleCount: draftCourse.modules.length,
        },
        prisma: tx,
      });

      return {
        message: 'AI drafted a course outline successfully.',
        statusEnforced: CourseStatus.draft,
        provider: this.provider,
        course: draftCourse,
      };
    });
  }

  // ─── Private helpers ──────────────────────────────────────────────────────────

  private _delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Requires at least one category to exist.
   * Throws BadRequestException instead of silently creating one (H-6).
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

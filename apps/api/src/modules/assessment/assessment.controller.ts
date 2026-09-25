import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { extractIp } from '../../common/utils/extract-ip';
import { AssessmentService } from './assessment.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateAssessmentDto } from './dto/create-assessment.dto';
import { AddQuestionDto } from './dto/add-question.dto';
import { SubmitAttemptDto } from './dto/submit-attempt.dto';

@Controller('api/v1')
export class AssessmentController {
  constructor(private readonly assessmentService: AssessmentService) {}

  // ─── Assessment Management (Trainer) ──────────────────────────────────────────

  @Post('assessments')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('trainer', 'admin')
  @HttpCode(HttpStatus.CREATED)
  createAssessment(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateAssessmentDto,
    @Req() req: Request,
  ): Promise<any> {
    return this.assessmentService.createAssessment(userId, dto, extractIp(req));
  }

  @Get('assessments/:id')
  @UseGuards(JwtAuthGuard)
  // H-4: Validate the UUID format of the id param before it hits the service.
  getAssessment(@Param('id', ParseUUIDPipe) id: string): Promise<any> {
    return this.assessmentService.getAssessment(id);
  }

  @Post('assessments/:id/questions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('trainer', 'admin')
  @HttpCode(HttpStatus.CREATED)
  addQuestion(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) assessmentId: string,
    @Body() dto: AddQuestionDto,
    @Req() req: Request,
  ): Promise<any> {
    return this.assessmentService.addQuestion(userId, assessmentId, dto, extractIp(req));
  }

  @Delete('assessments/:id/questions/:questionId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('trainer', 'admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteQuestion(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) assessmentId: string,
    @Param('questionId', ParseUUIDPipe) questionId: string,
  ): Promise<any> {
    return this.assessmentService.deleteQuestion(userId, assessmentId, questionId);
  }

  // ─── Attempt Endpoints (Trainee) ──────────────────────────────────────────────

  /**
   * Start attempt — returns shuffled questions WITHOUT isCorrect fields.
   * H-5: Rate-limited to 10 starts per 5 minutes to prevent brute-force cheating.
   */
  @Post('assessments/:id/start')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('trainee')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 10, ttl: 300000 } })
  startAttempt(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) assessmentId: string,
  ): Promise<any> {
    return this.assessmentService.startAttempt(userId, assessmentId);
  }

  /**
   * Submit attempt answers — graded server-side, returns score + pass/fail.
   * H-5: Rate-limited to 10 submissions per 5 minutes to prevent automated answer farming.
   */
  @Post('assessments/:id/attempts/:attemptId/submit')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('trainee')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 300000 } })
  submitAttempt(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) assessmentId: string,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Body() dto: SubmitAttemptDto,
    @Req() req: Request,
  ): Promise<any> {
    return this.assessmentService.submitAttempt(userId, assessmentId, attemptId, dto, extractIp(req));
  }

  @Get('assessments/:id/attempts')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('trainee')
  getMyAttempts(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) assessmentId: string,
  ): Promise<any> {
    return this.assessmentService.getMyAttempts(userId, assessmentId);
  }

  @Get('assessments/:id/attempts/:attemptId/results')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('trainee')
  getAttemptResult(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) assessmentId: string,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
  ): Promise<any> {
    return this.assessmentService.getAttemptResult(userId, assessmentId, attemptId);
  }

  // ─── Pre/Post-Test Intelligence ────────────────────────────────────────────────

  @Get('courses/:courseId/pre-post-delta')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('trainee')
  getPrePostDelta(
    @CurrentUser('id') userId: string,
    @Param('courseId', ParseUUIDPipe) courseId: string,
  ): Promise<any> {
    return this.assessmentService.getPrePostDelta(userId, courseId);
  }

  // ─── Admin/Trainer: All Results ────────────────────────────────────────────────

  @Get('assessments/:id/admin-results')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'trainer')
  getAdminResults(@Param('id', ParseUUIDPipe) assessmentId: string): Promise<any> {
    return this.assessmentService.getAdminResults(assessmentId);
  }
}

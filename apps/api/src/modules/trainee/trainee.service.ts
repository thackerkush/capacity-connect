import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { UpdateTraineeProfileDto } from './dto/update-trainee-profile.dto';
import { CreateInterestDto } from './dto/create-interest.dto';
import { CreateWorkExperienceDto } from './dto/create-work-experience.dto';
import { CreateQualificationDto } from './dto/create-qualification.dto';

@Injectable()
export class TraineeService {
  constructor(
    private prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async getProfile(userId: string) {
    const profile = await this.prisma.traineeProfile.findUnique({
      where: { userId },
      include: {
        department: true,
        interests: true,
        workExperiences: true,
        qualifications: true,
      },
    });
    if (!profile) {
      throw new NotFoundException('Trainee profile not found');
    }
    return profile;
  }

  async updateProfile(userId: string, data: UpdateTraineeProfileDto) {
    const profile = await this.prisma.traineeProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Trainee profile not found');

    // M-3: Audit profile updates so changes are traceable
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.traineeProfile.update({
        where: { id: profile.id },
        data,
      });
      await this.auditService.log({
        actorUserId: userId,
        action: 'trainee.profile.updated',
        entityType: 'TraineeProfile',
        entityId: profile.id,
        ipAddress: null,
        metadata: null,
        prisma: tx,
      });
      return updated;
    });
  }

  async addInterest(userId: string, data: CreateInterestDto) {
    const profile = await this.prisma.traineeProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Trainee profile not found');

    // M-3: Audit interest additions
    return this.prisma.$transaction(async (tx) => {
      const interest = await tx.interest.create({
        data: { ...data, traineeProfileId: profile.id },
      });
      await this.auditService.log({
        actorUserId: userId,
        action: 'trainee.interest.added',
        entityType: 'Interest',
        entityId: interest.id,
        ipAddress: null,
        metadata: { interestName: data.interestName },
        prisma: tx,
      });
      return interest;
    });
  }

  async addWorkExperience(userId: string, data: CreateWorkExperienceDto) {
    const profile = await this.prisma.traineeProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Trainee profile not found');

    // M-3: Audit work experience additions
    return this.prisma.$transaction(async (tx) => {
      const experience = await tx.workExperience.create({
        data: {
          ...data,
          startDate: new Date(data.startDate),
          endDate: data.endDate ? new Date(data.endDate) : null,
          traineeProfileId: profile.id,
        },
      });
      await this.auditService.log({
        actorUserId: userId,
        action: 'trainee.work_experience.added',
        entityType: 'WorkExperience',
        entityId: experience.id,
        ipAddress: null,
        metadata: { organization: data.organization, role: data.role },
        prisma: tx,
      });
      return experience;
    });
  }

  async addQualification(userId: string, data: CreateQualificationDto) {
    const profile = await this.prisma.traineeProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Trainee profile not found');

    // M-3: Audit qualification additions
    return this.prisma.$transaction(async (tx) => {
      const qualification = await tx.qualification.create({
        data: {
          ...data,
          profileOwnerId: profile.id,
          profileOwnerType: 'trainee',
        },
      });
      await this.auditService.log({
        actorUserId: userId,
        action: 'trainee.qualification.added',
        entityType: 'Qualification',
        entityId: qualification.id,
        ipAddress: null,
        metadata: { degree: data.degree },
        prisma: tx,
      });
      return qualification;
    });
  }
}

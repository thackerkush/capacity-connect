import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { UpdateTrainerProfileDto } from './dto/update-trainer-profile.dto';
import { CreateAvailabilityDto } from './dto/create-availability.dto';
import { CreateExpertiseDto } from './dto/create-expertise.dto';

@Injectable()
export class TrainerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async getProfile(userId: string): Promise<any> {
    const profile = await this.prisma.trainerProfile.findUnique({
      where: { userId },
      include: {
        expertise: { include: { skill: true } },
        availability: true,
      },
    });

    if (!profile) {
      throw new NotFoundException('Trainer profile not found');
    }

    return profile;
  }

  async updateProfile(userId: string, data: UpdateTrainerProfileDto): Promise<any> {
    // H-1: Verify the profile exists before attempting to update.
    const existing = await this.prisma.trainerProfile.findUnique({ where: { userId } });
    if (!existing) throw new NotFoundException('Trainer profile not found');

    // M-4: Audit profile updates so changes are traceable
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.trainerProfile.update({ where: { userId }, data });
      await this.auditService.log({
        actorUserId: userId,
        action: 'trainer.profile.updated',
        entityType: 'TrainerProfile',
        entityId: existing.id,
        ipAddress: null,
        metadata: null,
        prisma: tx,
      });
      return updated;
    });
  }

  async addAvailability(userId: string, data: CreateAvailabilityDto) {
    const profile = await this.getProfile(userId);

    // M-4: Audit availability additions
    return this.prisma.$transaction(async (tx) => {
      const availability = await tx.trainerAvailability.create({
        data: { ...data, trainerProfileId: profile.id },
      });
      await this.auditService.log({
        actorUserId: userId,
        action: 'trainer.availability.added',
        entityType: 'TrainerAvailability',
        entityId: availability.id,
        ipAddress: null,
        metadata: { dayOfWeek: data.dayOfWeek },
        prisma: tx,
      });
      return availability;
    });
  }

  async addExpertise(userId: string, data: CreateExpertiseDto) {
    const profile = await this.getProfile(userId);

    // M-4: Audit expertise additions
    return this.prisma.$transaction(async (tx) => {
      const expertise = await tx.trainerExpertise.create({
        data: { ...data, trainerProfileId: profile.id },
      });
      await this.auditService.log({
        actorUserId: userId,
        action: 'trainer.expertise.added',
        entityType: 'TrainerExpertise',
        entityId: expertise.id,
        ipAddress: null,
        metadata: { skillId: data.skillId },
        prisma: tx,
      });
      return expertise;
    });
  }

  async deleteAvailability(userId: string, availabilityId: string) {
    const profile = await this.getProfile(userId);
    const availability = await this.prisma.trainerAvailability.findUnique({
      where: { id: availabilityId },
    });

    if (!availability || availability.trainerProfileId !== profile.id) {
      throw new NotFoundException('Availability not found or does not belong to you');
    }

    // M-4: Audit availability deletions
    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.trainerAvailability.delete({ where: { id: availabilityId } });
      await this.auditService.log({
        actorUserId: userId,
        action: 'trainer.availability.deleted',
        entityType: 'TrainerAvailability',
        entityId: availabilityId,
        ipAddress: null,
        metadata: null,
        prisma: tx,
      });
      return deleted;
    });
  }

  async deleteExpertise(userId: string, expertiseId: string) {
    const profile = await this.getProfile(userId);
    const expertise = await this.prisma.trainerExpertise.findUnique({
      where: { id: expertiseId },
    });

    if (!expertise || expertise.trainerProfileId !== profile.id) {
      throw new NotFoundException('Expertise not found or does not belong to you');
    }

    // M-4: Audit expertise deletions
    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.trainerExpertise.delete({ where: { id: expertiseId } });
      await this.auditService.log({
        actorUserId: userId,
        action: 'trainer.expertise.deleted',
        entityType: 'TrainerExpertise',
        entityId: expertiseId,
        ipAddress: null,
        metadata: null,
        prisma: tx,
      });
      return deleted;
    });
  }
}

import { Module } from '@nestjs/common';
import { TrainerController } from './trainer.controller';
import { TrainerService } from './trainer.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditService } from '../../common/services/audit.service';

@Module({
  imports: [PrismaModule],
  controllers: [TrainerController],
  // M-4: Register AuditService so TrainerService can inject it
  providers: [TrainerService, AuditService],
  exports: [TrainerService],
})
export class TrainerModule {}

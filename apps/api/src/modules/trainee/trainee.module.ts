import { Module } from '@nestjs/common';
import { TraineeController } from './trainee.controller';
import { TraineeService } from './trainee.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditService } from '../../common/services/audit.service';

@Module({
  imports: [PrismaModule],
  controllers: [TraineeController],
  // M-3: Register AuditService so TraineeService can inject it
  providers: [TraineeService, AuditService],
})
export class TraineeModule {}

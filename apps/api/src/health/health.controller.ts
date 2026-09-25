import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../modules/prisma/prisma.service';

/**
 * L-6: Health check controller.
 * The docker-compose.yml healthcheck hits GET /api/v1/health.
 * Returns a lightweight response so the orchestrator can determine
 * whether the API + database are reachable without triggering auth.
 */
@Controller('api/v1/health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(): Promise<{ status: string; db: string; uptime: number; timestamp: string }> {
    // Probe the database with the lightest possible query
    let dbStatus = 'ok';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      dbStatus = 'error';
    }

    return {
      status: dbStatus === 'ok' ? 'ok' : 'degraded',
      db: dbStatus,
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}

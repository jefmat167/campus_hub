import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
  MemoryHealthIndicator,
  DiskHealthIndicator,
} from '@nestjs/terminus';
import { RedisHealthIndicator } from './redis.health';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly memory: MemoryHealthIndicator,
    private readonly disk: DiskHealthIndicator,
    private readonly redis: RedisHealthIndicator,
  ) {}

  /**
   * Basic health check - for load balancer
   */
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.db.pingCheck('database'),
    ]);
  }

  /**
   * Detailed health check - for monitoring
   */
  @Get('detailed')
  @HealthCheck()
  checkDetailed() {
    return this.health.check([
      // Database checks
      () => this.db.pingCheck('postgres'),
      () => this.redis.isHealthy('redis'),

      // Memory check (heap should be under 500MB)
      () => this.memory.checkHeap('memory_heap', 500 * 1024 * 1024),

      // RSS memory check (under 1GB)
      () => this.memory.checkRSS('memory_rss', 1024 * 1024 * 1024),

      // Disk check (at least 10% free space)
      () =>
        this.disk.checkStorage('disk', {
          path: process.platform === 'win32' ? 'C:\\' : '/',
          thresholdPercent: 0.1,
        }),
    ]);
  }

  /**
   * Liveness probe - is the app running?
   */
  @Get('live')
  live() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  /**
   * Readiness probe - is the app ready to accept traffic?
   */
  @Get('ready')
  @HealthCheck()
  ready() {
    return this.health.check([
      () => this.db.pingCheck('database'),
      () => this.redis.isHealthy('redis'),
    ]);
  }
}

import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
  MemoryHealthIndicator,
  DiskHealthIndicator,
} from '@nestjs/terminus';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { RedisHealthIndicator } from './redis.health';
import { SkipResponseTransform } from '../../common/interceptors/response-transform.interceptor';

@ApiTags('Health')
@Controller('health')
@SkipResponseTransform()
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
  @ApiOperation({ summary: 'Basic health check', description: 'Quick health check for load balancers. Checks database connectivity.' })
  @ApiResponse({ status: 200, description: 'Health check passed', schema: { example: { status: 'ok', details: { database: { status: 'up' } } } } })
  @ApiResponse({ status: 503, description: 'Health check failed', schema: { example: { status: 'error', error: { database: { status: 'down', message: 'Connection refused' } } } } })
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
  @ApiOperation({ summary: 'Detailed health check', description: 'Comprehensive health check for monitoring. Checks database, Redis, memory, and disk.' })
  @ApiResponse({ status: 200, description: 'All health checks passed', schema: { example: { status: 'ok', details: { postgres: { status: 'up' }, redis: { status: 'up', message: 'Redis is reachable' }, memory_heap: { status: 'up' }, memory_rss: { status: 'up' }, disk: { status: 'up' } } } } })
  @ApiResponse({ status: 503, description: 'One or more health checks failed' })
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
  @ApiOperation({ summary: 'Liveness probe', description: 'Kubernetes liveness probe. Returns OK if the process is running.' })
  @ApiResponse({ status: 200, description: 'Process is alive', schema: { example: { status: 'ok', timestamp: '2026-03-19T14:30:00.000Z' } } })
  live() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  /**
   * Readiness probe - is the app ready to accept traffic?
   */
  @Get('ready')
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness probe', description: 'Kubernetes readiness probe. Checks if the app can accept traffic (database and Redis are up).' })
  @ApiResponse({ status: 200, description: 'App is ready', schema: { example: { status: 'ok', details: { database: { status: 'up' }, redis: { status: 'up', message: 'Redis is reachable' } } } } })
  @ApiResponse({ status: 503, description: 'App not ready to accept traffic' })
  ready() {
    return this.health.check([
      () => this.db.pingCheck('database'),
      () => this.redis.isHealthy('redis'),
    ]);
  }
}

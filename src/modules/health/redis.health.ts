import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisHealthIndicator extends HealthIndicator implements OnModuleDestroy {
  private client: Redis | null = null;

  constructor(private readonly configService: ConfigService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      // Create client if not exists
      if (!this.client) {
        this.client = new Redis({
          host: this.configService.get<string>('REDIS_HOST', 'localhost'),
          port: this.configService.get<number>('REDIS_PORT', 6379),
          password: this.configService.get<string>('REDIS_PASSWORD'),
          maxRetriesPerRequest: 1,
          connectTimeout: 5000,
        });
      }

      // Ping Redis
      const result = await this.client.ping();

      if (result === 'PONG') {
        return super.getStatus(key, true, { message: 'Redis is reachable' });
      }

      throw new Error('Redis ping failed');
    } catch (error: any) {
      throw new HealthCheckError(
        'Redis health check failed',
        super.getStatus(key, false, { message: error.message }),
      );
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
    }
  }
}

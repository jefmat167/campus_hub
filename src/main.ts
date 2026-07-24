import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConsoleLogger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Request, Response, NextFunction } from 'express';
import { join } from 'path';
import { getQueueToken } from '@nestjs/bullmq';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Queue } from 'bullmq';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { QUEUE_NAMES } from './modules/bull-board/bull-board.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: new ConsoleLogger({ prefix: 'CampusHub', timestamp: true }),
    rawBody: true, // expose req.rawBody for exact-bytes webhook signature verification
  });

  const configService = app.get(ConfigService);

  app.use(cookieParser());

  // Configure view engine (EJS)
  app.setBaseViewsDir(join(__dirname, 'views'));
  app.setViewEngine('ejs');

  // Global prefix
  app.setGlobalPrefix('api/v1');

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global exception filter
  app.useGlobalFilters(new HttpExceptionFilter());

  // CORS
  const corsOrigin = configService.get<string>('CORS_ORIGIN', '*');
  const adminOrigin = configService.get<string>('ADMIN_CORS_ORIGIN', '');
  const origins = adminOrigin
    ? [corsOrigin, adminOrigin].filter(Boolean)
    : corsOrigin;

  app.enableCors({
    origin: origins,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Swagger API Documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Campus Hub API')
    .setDescription(
      `## Nigerian University Student Platform - Backend API

### Overview
Campus Hub is a comprehensive platform for Nigerian university students providing:
- **Marketplace** - Buy and sell items within your university community
- **Housing** - Find accommodation and roommates
- **Social** - Anonymous posts, polls, and discussions
- **Wallet** - Secure payments with escrow protection

### Authentication
All protected endpoints require a valid JWT token in the Authorization header:
\`\`\`
Authorization: Bearer <your_jwt_token>
\`\`\`

### Rate Limiting
- Short: 3 requests per second
- Medium: 100 requests per minute
- Long: 1000 requests per hour

### Response Format
All responses follow this structure:
\`\`\`json
{
  "success": true,
  "data": {...},
  "message": "Optional message",
  "meta": { "total": 100, "page": 1, "limit": 20 }
}
\`\`\`
`,
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth',
    )
    .addTag('Auth', 'Authentication endpoints')
    .addTag('Users', 'User profile management')
    .addTag('Universities', 'University, faculty, and department data')
    .addTag('Marketplace', 'Listings and favorites')
    .addTag('Offers', 'Offer management')
    .addTag('Chat', 'Messaging system')
    .addTag('Reviews', 'User reviews and ratings')
    .addTag('Wallet', 'Wallet and transactions')
    .addTag('Payment', 'Payment processing and withdrawals')
    .addTag('Escrow', 'Escrow transactions and disputes')
    .addTag('Social (Anonymous Forum)', 'Anonymous posts and polls')
    .addTag('Housing', 'Housing listings and roommate matching')
    .addTag('News & Articles', 'News articles and blog')
    .addTag('Notifications', 'Push notifications and preferences')
    .addTag('Upload', 'File uploads for listings, profiles, and documents')
    .addTag('Verification', 'User verification and document submission')
    .addTag('Moderation', 'Content moderation and reports')
    .addTag('Health', 'Health check endpoints')
    .addServer(`${configService.getOrThrow("API_SERVER")}`, 'test')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    customSiteTitle: 'Campus Hub API Documentation',
    customfavIcon: '/favicon.ico',
    customCss: `
      .swagger-ui .topbar { display: none }
      .swagger-ui .info .title { font-size: 2.5em }
    `,
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'none',
      filter: true,
      showRequestDuration: true,
    },
  });

  // Bull Board - Queue Monitoring Dashboard
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queues');

  const queues = QUEUE_NAMES.map((name) => {
    const queue = app.get<Queue>(getQueueToken(name));
    return new BullMQAdapter(queue);
  });

  createBullBoard({
    queues,
    serverAdapter,
  });

  // Basic auth for queue dashboard in production
  const isProduction = configService.get<string>('NODE_ENV') === 'production';
  const bullBoardUser = configService.get<string>('BULL_BOARD_USER');
  const bullBoardPassword = configService.get<string>('BULL_BOARD_PASSWORD');

  if (isProduction && bullBoardUser && bullBoardPassword) {
    app.use('/admin/queues', (req: Request, res: Response, next: NextFunction) => {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Basic ')) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Queue Dashboard"');
        return res.status(401).send('Authentication required');
      }

      const base64Credentials = authHeader.split(' ')[1];
      const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
      const [username, password] = credentials.split(':');

      if (username === bullBoardUser && password === bullBoardPassword) {
        return next();
      }

      res.setHeader('WWW-Authenticate', 'Basic realm="Queue Dashboard"');
      return res.status(401).send('Invalid credentials');
    });
  }

  app.use('/admin/queues', serverAdapter.getRouter());

  const port = configService.get<number>('PORT', 3000);
  await app.listen(port);

  console.log(`Application is running on: http://localhost:${port}/api/v1`);
  console.log(`API Documentation available at: http://localhost:${port}/docs`);
  console.log(`Queue Dashboard available at: http://localhost:${port}/admin/queues`);
}

bootstrap();

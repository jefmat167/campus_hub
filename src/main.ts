import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConsoleLogger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { join } from 'path';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: new ConsoleLogger({ prefix: 'CampusHub', timestamp: true })
  });

  const configService = app.get(ConfigService);

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
  app.enableCors({
    origin: configService.get<string>('CORS_ORIGIN', '*'),
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
    .addServer(`${configService.getOrThrow("API_SERVER")}`, 'Staging')
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

  const port = configService.get<number>('PORT', 3000);
  await app.listen(port);

  console.log(`Application is running on: http://localhost:${port}/api/v1`);
  console.log(`API Documentation available at: http://localhost:${port}/docs`);
}

bootstrap();

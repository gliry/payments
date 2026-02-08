import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(',') || '*',
    credentials: true,
  });

  app.setGlobalPrefix('v1');

  const config = new DocumentBuilder()
    .setTitle('OmniFlow API')
    .setDescription(
      'Non-custodial API for cross-chain USDC payments. ' +
      'Users sign all transactions with Passkey. ' +
      'Pattern: Prepare \u2192 Sign \u2192 Submit.',
    )
    .setVersion('2.0')
    .addBearerAuth()
    .addTag('auth', 'Registration and login with Passkey')
    .addTag('wallet', 'Wallet info, balances, and delegate management')
    .addTag('operations', 'Collect, send, and bridge operations')
    .addTag('webhooks', 'Webhook management')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  // Serve static files from backend/public (test client at /index.html)
  // Disable caching for HTML files to ensure latest version is always served
  app.useStaticAssets(join(__dirname, '..', 'public'), {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
    },
  });

  app.enableShutdownHooks();

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`OmniFlow API running on: http://localhost:${port}`);
  console.log(`Swagger docs: http://localhost:${port}/api`);
}

bootstrap();

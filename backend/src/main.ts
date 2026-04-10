import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { json } from 'express';
import { getCorsOriginOption } from './config/cors';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Enable CORS for frontend
  app.enableCors({
    origin: getCorsOriginOption(),
    credentials: true,
  });

  // Enable JSON body parsing for POST requests
  app.use(json());

  const port = process.env.PORT || 3000;
  const host = process.env.HOST || '0.0.0.0';
  await app.listen(port, host);
  console.log(`Application is running on: http://${host}:${port}`);
  console.log(`WebSocket events available at: ws://${host}:${port}/events`);
}

bootstrap();

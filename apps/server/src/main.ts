import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { getCorsOptions } from './cors';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors(getCorsOptions());
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();

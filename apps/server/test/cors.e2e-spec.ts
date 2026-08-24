import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { getCorsOptions } from '../src/cors';

describe('CORS (e2e)', () => {
  let app: INestApplication<App>;
  const originalEnv = process.env.ALLOWED_ORIGIN;

  beforeEach(async () => {
    process.env.ALLOWED_ORIGIN = 'https://crazy8.example.com';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.enableCors(getCorsOptions());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    process.env.ALLOWED_ORIGIN = originalEnv;
  });

  it('allows the configured origin', () => {
    return request(app.getHttpServer())
      .options('/rooms')
      .set('Origin', 'https://crazy8.example.com')
      .set('Access-Control-Request-Method', 'POST')
      .expect(204)
      .expect('access-control-allow-origin', 'https://crazy8.example.com');
  });

  it('does not allow an arbitrary origin', () => {
    return request(app.getHttpServer())
      .options('/rooms')
      .set('Origin', 'https://evil.example.com')
      .set('Access-Control-Request-Method', 'POST')
      .expect((res) => {
        expect(res.headers['access-control-allow-origin']).not.toBe(
          'https://evil.example.com',
        );
      });
  });
});

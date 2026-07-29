import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return a greeting that includes the engine-derived deck size', () => {
      expect(appController.getHello()).toBe(
        'Hello World! Engine says: a 4-player deck has 52 cards',
      );
    });
  });
});

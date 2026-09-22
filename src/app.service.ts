import { Injectable } from '@nestjs/common';

// Service trivial usado apenas pelo AppController (rota "/" de smoke test).
@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }
}

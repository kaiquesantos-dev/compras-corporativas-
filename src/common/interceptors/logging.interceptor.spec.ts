import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { LoggingInterceptor } from './logging.interceptor';

function buildContext(
  overrides: Partial<{ user: { id: number; role: string } }> = {},
) {
  const request = {
    method: 'GET',
    originalUrl: '/purchase-requests',
    user: overrides.user,
  };
  const response = { statusCode: 200 };

  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
}

describe('LoggingInterceptor', () => {
  it('logs a structured JSON line including method, url, statusCode and duration', (done) => {
    const interceptor = new LoggingInterceptor();
    const context = buildContext({ user: { id: 7, role: 'ADMIN' } });
    const next: CallHandler = { handle: () => of({ ok: true }) };

    const logSpy = jest
      .spyOn((interceptor as any).logger, 'log')
      .mockImplementation();

    interceptor.intercept(context, next).subscribe(() => {
      expect(logSpy).toHaveBeenCalledTimes(1);
      const logged = JSON.parse(logSpy.mock.calls[0][0] as string);
      expect(logged).toMatchObject({
        method: 'GET',
        url: '/purchase-requests',
        userId: 7,
        role: 'ADMIN',
        statusCode: 200,
      });
      expect(typeof logged.durationMs).toBe('number');
      done();
    });
  });

  it('logs null userId/role when the route is public (no authenticated user)', (done) => {
    const interceptor = new LoggingInterceptor();
    const context = buildContext();
    const next: CallHandler = { handle: () => of({ ok: true }) };

    const logSpy = jest
      .spyOn((interceptor as any).logger, 'log')
      .mockImplementation();

    interceptor.intercept(context, next).subscribe(() => {
      const logged = JSON.parse(logSpy.mock.calls[0][0] as string);
      expect(logged.userId).toBeNull();
      expect(logged.role).toBeNull();
      done();
    });
  });
});

import { ArgumentsHost, BadRequestException, HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AllExceptionsFilter } from './all-exceptions.filter';

function createHost(response: {
  status: ReturnType<typeof vi.fn>;
}): ArgumentsHost {
  return {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({}),
    }),
  } as unknown as ArgumentsHost;
}

describe('AllExceptionsFilter', () => {
  it('passes through an HttpException status and message unchanged', () => {
    const filter = new AllExceptionsFilter();
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const host = createHost({ status });

    filter.catch(new BadRequestException('displayName is required'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(json).toHaveBeenCalledWith({
      statusCode: HttpStatus.BAD_REQUEST,
      message: 'displayName is required',
    });
  });

  it('normalizes a non-HttpException into a generic 500 without leaking its real message', () => {
    const filter = new AllExceptionsFilter();
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const host = createHost({ status });

    filter.catch(new Error('some internal detail nobody should see'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'INTERNAL_SERVER_ERROR',
    });
  });
});

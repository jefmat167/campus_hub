import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpStatus,
} from '@nestjs/common';
import { ArgumentsHost } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let json: jest.Mock;
  let status: jest.Mock;
  let host: ArgumentsHost;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    json = jest.fn();
    status = jest.fn().mockReturnValue({ json });
    host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ url: '/api/v1/test' }),
      }),
    } as unknown as ArgumentsHost;
  });

  const body = () => json.mock.calls[0][0] as Record<string, unknown>;

  it('shapes a string-thrown HttpException with no extra keys', () => {
    filter.catch(new BadRequestException('Plain message'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(body()).toEqual({
      statusCode: 400,
      message: 'Plain message',
      error: 'Bad Request',
      timestamp: expect.any(String),
      path: '/api/v1/test',
    });
  });

  it('preserves validation-pipe errors (message array) unchanged', () => {
    filter.catch(
      new BadRequestException({
        statusCode: 400,
        message: ['title must be longer than 5 characters'],
        error: 'Bad Request',
      }),
      host,
    );

    expect(body()).toEqual({
      statusCode: 400,
      message: ['title must be longer than 5 characters'],
      error: 'Bad Request',
      timestamp: expect.any(String),
      path: '/api/v1/test',
    });
  });

  it('passes the thrower structured fields through (tier guard shape)', () => {
    filter.catch(
      new ForbiddenException({
        message: 'Amount exceeds your tier limit. Maximum allowed: ₦30,000',
        field: 'amount',
        limit: 30000,
        amount: 45000,
        currentTier: 'tier_0',
        upgradeRequired: true,
      }),
      host,
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
    expect(body()).toMatchObject({
      statusCode: 403,
      message: 'Amount exceeds your tier limit. Maximum allowed: ₦30,000',
      error: 'ForbiddenException',
      field: 'amount',
      limit: 30000,
      amount: 45000,
      currentTier: 'tier_0',
      upgradeRequired: true,
    });
  });

  it('passes code fields through (PIN shape)', () => {
    filter.catch(
      new ForbiddenException({
        message: 'Set a transaction PIN before making this transaction.',
        code: 'PIN_NOT_SET',
      }),
      host,
    );

    expect(body()).toMatchObject({
      statusCode: 403,
      code: 'PIN_NOT_SET',
    });
  });

  it('passes array extras through (checkout issues shape)', () => {
    const issues = [{ cartItemId: 'x', reason: 'listing_unavailable' }];
    filter.catch(
      new BadRequestException({
        message: 'Some items can no longer be checked out.',
        issues,
      }),
      host,
    );

    expect(body().issues).toEqual(issues);
  });

  it('never lets extras override the canonical keys', () => {
    filter.catch(
      new ConflictException({
        message: 'Real message',
        path: '/spoofed',
        timestamp: 'spoofed',
        listingId: 'abc',
      }),
      host,
    );

    const res = body();
    expect(res.path).toBe('/api/v1/test');
    expect(res.timestamp).not.toBe('spoofed');
    expect(res.statusCode).toBe(409);
    expect(res.message).toBe('Real message');
    expect(res.listingId).toBe('abc');
  });

  it('maps non-HttpException errors to a generic 500 with no leakage', () => {
    filter.catch(new Error('secret internals'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(body()).toEqual({
      statusCode: 500,
      message: 'Internal server error',
      error: 'InternalServerError',
      timestamp: expect.any(String),
      path: '/api/v1/test',
    });
  });
});

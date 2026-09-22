import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { StudentAccountGuard } from './student-account.guard';
import { AccountType } from '../../database/entities/user.entity';

function makeContext(user: unknown, isPublic = false) {
  const reflector: any = {
    getAllAndOverride: jest.fn(() => isPublic),
  };
  const context = {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
  return { guard: new StudentAccountGuard(reflector), context };
}

describe('StudentAccountGuard', () => {
  it('lets student accounts through', () => {
    const { guard, context } = makeContext({
      id: 'u1',
      accountType: AccountType.STUDENT,
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects vendor-only accounts with STUDENT_ACCOUNT_REQUIRED', () => {
    const { guard, context } = makeContext({
      id: 'u1',
      accountType: AccountType.VENDOR,
    });
    try {
      guard.canActivate(context);
      fail('expected ForbiddenException');
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toMatchObject({
        code: 'STUDENT_ACCOUNT_REQUIRED',
      });
    }
  });

  it('fails closed when accountType is missing from request.user', () => {
    const { guard, context } = makeContext({ id: 'u1' });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('rejects unauthenticated requests', () => {
    const { guard, context } = makeContext(undefined);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('bypasses @Public() routes (inline admin endpoints)', () => {
    const { guard, context } = makeContext(undefined, true);
    expect(guard.canActivate(context)).toBe(true);
  });
});

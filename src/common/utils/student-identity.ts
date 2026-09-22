import { ForbiddenException } from '@nestjs/common';
import { Gender } from '../../database/entities/user.entity';

/**
 * Narrowing helpers for student-only code paths. Since accounts can now exist
 * without academic identity (vendor-only accounts, rev-2 spec 01.5), the
 * student-identity columns are nullable. Routes behind StudentAccountGuard
 * can't actually receive a null, but these helpers make that guarantee
 * explicit at the use site — and fail closed if a guard is ever missing.
 */
export function requireUniversityId(user: {
  universityId: string | null;
}): string {
  if (!user.universityId) {
    throw new ForbiddenException(
      'This feature is only available to student accounts.',
    );
  }
  return user.universityId;
}

export function requireGender(user: { gender: Gender | null }): Gender {
  if (!user.gender) {
    throw new ForbiddenException(
      'This feature is only available to student accounts.',
    );
  }
  return user.gender;
}

import { NotFoundException } from '@nestjs/common';
import { RoommateService } from './roommate.service';
import { Gender } from '../../database/entities/user.entity';
import { RoommateProfileStatus } from '../../database/entities/roommate.entity';

/**
 * Focused on the gender-segregation rule: roommate discovery must be same-gender
 * only, keyed on the authoritative account gender (never the client-supplied
 * profile value). Covers the write-path override + the two by-id guards
 * (`getProfile`, `expressInterest`). The query-builder list methods
 * (`getAllProfiles`, `findMatches`) apply the same `profile.gender = :gender`
 * filter and aren't exercised here.
 */
function makeService() {
  const profileRepo: any = {
    findOne: jest.fn(),
    create: (o: any) => ({ ...o }),
    save: jest.fn(async (p: any) => p),
    increment: jest.fn(async () => ({})),
  };
  const interestRepo: any = {
    find: jest.fn(async () => []),
    findOne: jest.fn(async () => null),
    create: (o: any) => ({ ...o }),
    save: jest.fn(async (i: any) => i),
  };
  const svc = new RoommateService(profileRepo, interestRepo);
  return { svc, profileRepo, interestRepo };
}

describe('RoommateService gender segregation', () => {
  describe('createOrUpdateProfile forces the account gender', () => {
    it('ignores a spoofed DTO gender when creating a new profile', async () => {
      const { svc, profileRepo } = makeService();
      profileRepo.findOne.mockResolvedValueOnce(null); // no existing profile

      const saved = await svc.createOrUpdateProfile(
        'u1',
        'uni1',
        Gender.MALE, // authoritative account gender
        { gender: Gender.FEMALE, age: 21 } as any, // client lies
      );

      expect(saved.gender).toBe(Gender.MALE);
    });

    it('re-asserts the account gender when updating an existing profile', async () => {
      const { svc, profileRepo } = makeService();
      profileRepo.findOne.mockResolvedValueOnce({
        id: 'p1',
        userId: 'u1',
        gender: Gender.MALE,
      });

      const saved = await svc.createOrUpdateProfile('u1', 'uni1', Gender.MALE, {
        gender: Gender.FEMALE,
      } as any);

      expect(saved.gender).toBe(Gender.MALE);
    });
  });

  describe('getProfile', () => {
    const target = {
      id: 'p1',
      gender: Gender.FEMALE,
      status: RoommateProfileStatus.ACTIVE,
      user: {
        id: 'u2',
        fullName: 'A',
        email: 'a@x.com',
        phone: '1',
        profilePhotoUrl: null,
        verificationTier: 'tier_1',
      },
    };

    it('hides an opposite-gender profile (404) and does not count the view', async () => {
      const { svc, profileRepo } = makeService();
      profileRepo.findOne.mockResolvedValueOnce({ ...target });

      await expect(svc.getProfile('p1', Gender.MALE)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(profileRepo.increment).not.toHaveBeenCalled();
    });

    it('returns a same-gender profile and counts the view', async () => {
      const { svc, profileRepo } = makeService();
      profileRepo.findOne.mockResolvedValueOnce({ ...target });

      const res = await svc.getProfile('p1', Gender.FEMALE);

      expect(res).toBeDefined();
      expect(profileRepo.increment).toHaveBeenCalled();
    });
  });

  describe('expressInterest', () => {
    it('blocks interest in an opposite-gender profile (404) and saves nothing', async () => {
      const { svc, profileRepo, interestRepo } = makeService();
      profileRepo.findOne.mockResolvedValueOnce({
        id: 'p1',
        userId: 'u2',
        gender: Gender.FEMALE,
      });

      await expect(
        svc.expressInterest('u1', Gender.MALE, 'p1', {} as any),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(interestRepo.save).not.toHaveBeenCalled();
    });
  });
});

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, In } from 'typeorm';
import {
  RoommateProfile,
  RoommateProfileStatus,
  RoommateInterest,
  CleanlinessLevel,
  NoiseLevel,
  SleepSchedule,
} from '../../database/entities/roommate.entity';
import { User } from '../../database/entities/user.entity';
import {
  CreateRoommateProfileDto,
  ExpressInterestDto,
  SearchRoommateProfilesDto,
} from './dto';

@Injectable()
export class RoommateService {
  private readonly logger = new Logger(RoommateService.name);

  constructor(
    @InjectRepository(RoommateProfile)
    private profileRepo: Repository<RoommateProfile>,
    @InjectRepository(RoommateInterest)
    private interestRepo: Repository<RoommateInterest>,
  ) {}

  /**
   * Sanitize user object to remove sensitive data
   */
  private sanitizeUser(user: User): Record<string, any> {
    if (!user) return user;

    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      profilePhotoUrl: user.profilePhotoUrl,
      verificationTier: user.verificationTier,
    };
  }

  /**
   * Sanitize user in a roommate profile
   */
  private sanitizeProfileUser(profile: RoommateProfile): RoommateProfile {
    if (profile.user) {
      (profile as any).user = this.sanitizeUser(profile.user);
    }
    return profile;
  }

  /**
   * Sanitize users in an array of profiles
   */
  private sanitizeProfilesUsers(profiles: RoommateProfile[]): RoommateProfile[] {
    return profiles.map((profile) => this.sanitizeProfileUser(profile));
  }

  /**
   * Sanitize user in a roommate interest
   */
  private sanitizeInterestUsers(interest: RoommateInterest): RoommateInterest {
    if ((interest as any).fromUser) {
      (interest as any).fromUser = this.sanitizeUser((interest as any).fromUser);
    }
    if ((interest as any).toUser) {
      (interest as any).toUser = this.sanitizeUser((interest as any).toUser);
    }
    return interest;
  }

  /**
   * Sanitize users in an array of interests
   */
  private sanitizeInterestsUsers(interests: RoommateInterest[]): RoommateInterest[] {
    return interests.map((interest) => this.sanitizeInterestUsers(interest));
  }

  /**
   * Create or update roommate profile
   */
  async createOrUpdateProfile(
    userId: string,
    universityId: string,
    dto: CreateRoommateProfileDto,
  ): Promise<RoommateProfile> {
    let profile = await this.profileRepo.findOne({
      where: { userId },
    });

    if (profile) {
      // Update existing
      Object.assign(profile, dto);
      if (dto.moveInDate) {
        profile.moveInDate = new Date(dto.moveInDate);
      }
    } else {
      // Create new
      profile = this.profileRepo.create({
        userId,
        universityId,
        ...dto,
        moveInDate: dto.moveInDate ? new Date(dto.moveInDate) : null,
      });
    }

    const saved = await this.profileRepo.save(profile);
    this.logger.log(`Roommate profile ${saved.id} saved for user ${userId}`);

    return saved;
  }

  /**
   * Get user's roommate profile
   */
  async getMyProfile(userId: string): Promise<RoommateProfile> {
    const profile = await this.profileRepo.findOne({
      where: { userId },
      relations: ['user', 'university'],
    });

    if (!profile) {
      throw new NotFoundException('Roommate profile not found. Please create one.');
    }

    return this.sanitizeProfileUser(profile);
  }

  /**
   * Get a roommate profile by ID
   */
  async getProfile(profileId: string): Promise<RoommateProfile> {
    const profile = await this.profileRepo.findOne({
      where: { id: profileId, status: RoommateProfileStatus.ACTIVE },
      relations: ['user', 'university'],
    });

    if (!profile) {
      throw new NotFoundException('Roommate profile not found');
    }

    // Increment view count
    await this.profileRepo.increment({ id: profileId }, 'viewCount', 1);

    return this.sanitizeProfileUser(profile);
  }

  /**
   * Get all active roommate profiles with filters
   */
  async getAllProfiles(
    userId: string,
    universityId: string,
    dto: SearchRoommateProfilesDto,
  ): Promise<{ profiles: RoommateProfile[]; total: number }> {
    const page = dto.page || 1;
    const limit = dto.limit || 20;

    const queryBuilder = this.profileRepo
      .createQueryBuilder('profile')
      .leftJoinAndSelect('profile.user', 'user')
      .where('profile.universityId = :universityId', { universityId })
      .andWhere('profile.status = :status', { status: RoommateProfileStatus.ACTIVE })
      .andWhere('profile.userId != :userId', { userId });

    // Apply gender filter
    if (dto.gender) {
      queryBuilder.andWhere('profile.gender = :gender', { gender: dto.gender });
    }

    // Apply budget filters (find profiles with overlapping budget ranges)
    if (dto.minBudget !== undefined) {
      queryBuilder.andWhere('profile.budgetMax >= :minBudget', {
        minBudget: dto.minBudget,
      });
    }
    if (dto.maxBudget !== undefined) {
      queryBuilder.andWhere('profile.budgetMin <= :maxBudget', {
        maxBudget: dto.maxBudget,
      });
    }

    // Apply area filter (search in preferredAreas JSONB array)
    if (dto.area) {
      queryBuilder.andWhere('profile.preferredAreas @> :area', {
        area: JSON.stringify([dto.area]),
      });
    }

    // Order by newest first
    queryBuilder.orderBy('profile.createdAt', 'DESC');

    const [profiles, total] = await queryBuilder
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      profiles: this.sanitizeProfilesUsers(profiles),
      total,
    };
  }

  /**
   * Find compatible roommates
   */
  async findMatches(
    userId: string,
    page = 1,
    limit = 20,
  ): Promise<{ matches: Array<{ profile: RoommateProfile; score: number }>; total: number }> {
    const myProfile = await this.profileRepo.findOne({
      where: { userId },
    });

    if (!myProfile) {
      throw new BadRequestException('Please create a roommate profile first');
    }

    // Get already interested profiles to exclude
    const existingInterests = await this.interestRepo.find({
      where: { fromUserId: userId },
      select: ['toUserId'],
    });
    const excludeUserIds = existingInterests.map((i) => i.toUserId);
    excludeUserIds.push(userId); // Exclude self

    // Find potential matches in same university
    const queryBuilder = this.profileRepo
      .createQueryBuilder('profile')
      .leftJoinAndSelect('profile.user', 'user')
      .where('profile.universityId = :universityId', { universityId: myProfile.universityId })
      .andWhere('profile.status = :status', { status: RoommateProfileStatus.ACTIVE })
      .andWhere('profile.userId NOT IN (:...excludeUserIds)', { excludeUserIds });

    // Apply gender preference filter
    if (myProfile.preferredGender) {
      queryBuilder.andWhere('profile.gender = :gender', {
        gender: myProfile.preferredGender,
      });
    }

    // Apply budget overlap filter
    queryBuilder.andWhere(
      '(profile.budgetMin <= :maxBudget AND profile.budgetMax >= :minBudget)',
      { minBudget: myProfile.budgetMin, maxBudget: myProfile.budgetMax },
    );

    // Apply smoking preference
    if (myProfile.nonSmokerOnly) {
      queryBuilder.andWhere('profile.smokes = false');
    }

    // Apply drinking preference
    if (myProfile.nonDrinkerOnly) {
      queryBuilder.andWhere('profile.drinks = false');
    }

    // Apply pet preference
    if (myProfile.noPetsAllowed) {
      queryBuilder.andWhere('profile.hasPets = false');
    }

    const [profiles, total] = await queryBuilder
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    // Calculate compatibility scores
    const matches = profiles.map((profile) => ({
      profile: this.sanitizeProfileUser(profile),
      score: this.calculateCompatibility(myProfile, profile),
    }));

    // Sort by compatibility score
    matches.sort((a, b) => b.score - a.score);

    return { matches, total };
  }

  /**
   * Calculate compatibility score between two profiles
   * Returns a score from 0-100
   */
  private calculateCompatibility(
    profile1: RoommateProfile,
    profile2: RoommateProfile,
  ): number {
    let score = 0;
    let maxScore = 0;

    // Budget compatibility (20 points)
    maxScore += 20;
    const budgetOverlap = this.calculateBudgetOverlap(
      profile1.budgetMin,
      profile1.budgetMax,
      profile2.budgetMin,
      profile2.budgetMax,
    );
    score += budgetOverlap * 20;

    // Cleanliness compatibility (15 points)
    maxScore += 15;
    score += this.compareEnumValues(
      profile1.cleanliness,
      profile2.cleanliness,
      profile1.preferredCleanliness,
      profile2.preferredCleanliness,
    ) * 15;

    // Noise level compatibility (15 points)
    maxScore += 15;
    score += this.compareEnumValues(
      profile1.noiseLevel,
      profile2.noiseLevel,
      profile1.preferredNoiseLevel,
      profile2.preferredNoiseLevel,
    ) * 15;

    // Sleep schedule compatibility (15 points)
    maxScore += 15;
    score += this.compareSleepSchedule(
      profile1.sleepSchedule,
      profile2.sleepSchedule,
      profile1.preferredSleepSchedule,
      profile2.preferredSleepSchedule,
    ) * 15;

    // Age compatibility (10 points)
    maxScore += 10;
    score += this.compareAge(profile1, profile2) * 10;

    // Lifestyle compatibility (10 points)
    maxScore += 10;
    let lifestyleScore = 0;
    let lifestyleFactors = 0;

    // Smoking
    lifestyleFactors++;
    if (profile1.smokes === profile2.smokes) lifestyleScore++;

    // Drinking
    lifestyleFactors++;
    if (profile1.drinks === profile2.drinks) lifestyleScore++;

    // Visitors
    lifestyleFactors++;
    if (profile1.allowsVisitors === profile2.allowsVisitors) lifestyleScore++;

    score += (lifestyleScore / lifestyleFactors) * 10;

    // Area preference overlap (10 points)
    maxScore += 10;
    if (profile1.preferredAreas?.length && profile2.preferredAreas?.length) {
      const overlap = profile1.preferredAreas.filter((a) =>
        profile2.preferredAreas?.includes(a),
      ).length;
      const maxAreas = Math.max(
        profile1.preferredAreas.length,
        profile2.preferredAreas.length,
      );
      score += (overlap / maxAreas) * 10;
    } else {
      score += 5; // Neutral if no area preferences
    }

    // Interests overlap (5 points)
    maxScore += 5;
    if (profile1.interests?.length && profile2.interests?.length) {
      const overlap = profile1.interests.filter((i) =>
        profile2.interests?.includes(i.toLowerCase()),
      ).length;
      const maxInterests = Math.max(
        profile1.interests.length,
        profile2.interests.length,
      );
      score += (overlap / maxInterests) * 5;
    } else {
      score += 2.5; // Neutral if no interests listed
    }

    return Math.round((score / maxScore) * 100);
  }

  /**
   * Calculate budget overlap ratio (0-1)
   */
  private calculateBudgetOverlap(
    min1: number,
    max1: number,
    min2: number,
    max2: number,
  ): number {
    const overlapStart = Math.max(Number(min1), Number(min2));
    const overlapEnd = Math.min(Number(max1), Number(max2));

    if (overlapStart > overlapEnd) return 0;

    const overlap = overlapEnd - overlapStart;
    const range1 = Number(max1) - Number(min1);
    const range2 = Number(max2) - Number(min2);
    const maxRange = Math.max(range1, range2);

    return maxRange > 0 ? overlap / maxRange : 1;
  }

  /**
   * Compare enum values considering preferences
   */
  private compareEnumValues(
    value1: string,
    value2: string,
    pref1: string | null,
    pref2: string | null,
  ): number {
    // If values match exactly
    if (value1 === value2) return 1;

    // If preference matches
    if (pref1 && value2 === pref1) return 0.8;
    if (pref2 && value1 === pref2) return 0.8;

    // Otherwise partial score based on distance
    return 0.4;
  }

  /**
   * Compare sleep schedules with flexibility consideration
   */
  private compareSleepSchedule(
    schedule1: SleepSchedule,
    schedule2: SleepSchedule,
    pref1: SleepSchedule | null,
    pref2: SleepSchedule | null,
  ): number {
    // Flexible matches with anything
    if (schedule1 === SleepSchedule.FLEXIBLE || schedule2 === SleepSchedule.FLEXIBLE) {
      return 0.9;
    }

    // Exact match
    if (schedule1 === schedule2) return 1;

    // Adjacent schedules (early-normal or normal-night)
    const scheduleOrder = [
      SleepSchedule.EARLY_BIRD,
      SleepSchedule.NORMAL,
      SleepSchedule.NIGHT_OWL,
    ];
    const idx1 = scheduleOrder.indexOf(schedule1);
    const idx2 = scheduleOrder.indexOf(schedule2);

    if (Math.abs(idx1 - idx2) === 1) return 0.6;

    // Opposite schedules (early bird vs night owl)
    return 0.2;
  }

  /**
   * Compare age preferences
   */
  private compareAge(
    profile1: RoommateProfile,
    profile2: RoommateProfile,
  ): number {
    let score = 1;

    // Check if profile2's age is within profile1's preference
    if (profile1.preferredAgeMin && profile2.age < profile1.preferredAgeMin) {
      score *= 0.5;
    }
    if (profile1.preferredAgeMax && profile2.age > profile1.preferredAgeMax) {
      score *= 0.5;
    }

    // Check if profile1's age is within profile2's preference
    if (profile2.preferredAgeMin && profile1.age < profile2.preferredAgeMin) {
      score *= 0.5;
    }
    if (profile2.preferredAgeMax && profile1.age > profile2.preferredAgeMax) {
      score *= 0.5;
    }

    return score;
  }

  /**
   * Express interest in a roommate
   */
  async expressInterest(
    fromUserId: string,
    toProfileId: string,
    dto: ExpressInterestDto,
  ): Promise<RoommateInterest> {
    const toProfile = await this.profileRepo.findOne({
      where: { id: toProfileId },
    });

    if (!toProfile) {
      throw new NotFoundException('Roommate profile not found');
    }

    if (toProfile.userId === fromUserId) {
      throw new BadRequestException('You cannot express interest in yourself');
    }

    // Check for existing interest
    const existing = await this.interestRepo.findOne({
      where: { fromUserId, toUserId: toProfile.userId },
    });

    if (existing) {
      throw new ConflictException('You have already expressed interest');
    }

    // Calculate compatibility score
    const fromProfile = await this.profileRepo.findOne({
      where: { userId: fromUserId },
    });

    const compatibilityScore = fromProfile
      ? this.calculateCompatibility(fromProfile, toProfile)
      : null;

    const interest = this.interestRepo.create({
      fromUserId,
      toUserId: toProfile.userId,
      message: dto.message || null,
      compatibilityScore,
    });

    const saved = await this.interestRepo.save(interest);

    // Increment interest count on profile
    await this.profileRepo.increment(
      { id: toProfileId },
      'interestReceivedCount',
      1,
    );

    this.logger.log(`User ${fromUserId} expressed interest in ${toProfile.userId}`);

    return saved;
  }

  /**
   * Respond to interest (accept/decline)
   */
  async respondToInterest(
    interestId: string,
    userId: string,
    accept: boolean,
  ): Promise<RoommateInterest> {
    const interest = await this.interestRepo.findOne({
      where: { id: interestId, toUserId: userId },
    });

    if (!interest) {
      throw new NotFoundException('Interest not found');
    }

    if (interest.status !== 'pending') {
      throw new BadRequestException('This interest has already been responded to');
    }

    interest.status = accept ? 'accepted' : 'declined';

    const saved = await this.interestRepo.save(interest);

    // If accepted, check if mutual match
    if (accept) {
      const mutualInterest = await this.interestRepo.findOne({
        where: {
          fromUserId: userId,
          toUserId: interest.fromUserId,
          status: 'accepted',
        },
      });

      if (mutualInterest) {
        // Mark both profiles as matched
        await this.profileRepo.update(
          { userId: In([userId, interest.fromUserId]) },
          { status: RoommateProfileStatus.MATCHED },
        );

        this.logger.log(`Mutual match between ${userId} and ${interest.fromUserId}`);
      }
    }

    return saved;
  }

  /**
   * Get received interests
   */
  async getReceivedInterests(
    userId: string,
    status?: 'pending' | 'accepted' | 'declined',
  ): Promise<RoommateInterest[]> {
    const where: Record<string, unknown> = { toUserId: userId };
    if (status) where.status = status;

    const interests = await this.interestRepo.find({
      where,
      relations: ['fromUser'],
      order: { createdAt: 'DESC' },
    });

    return this.sanitizeInterestsUsers(interests);
  }

  /**
   * Get sent interests
   */
  async getSentInterests(userId: string): Promise<RoommateInterest[]> {
    const interests = await this.interestRepo.find({
      where: { fromUserId: userId },
      relations: ['toUser'],
      order: { createdAt: 'DESC' },
    });

    return this.sanitizeInterestsUsers(interests);
  }

  /**
   * Pause/unpause profile
   */
  async toggleProfileStatus(userId: string): Promise<RoommateProfile> {
    const profile = await this.profileRepo.findOne({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException('Roommate profile not found');
    }

    profile.status =
      profile.status === RoommateProfileStatus.ACTIVE
        ? RoommateProfileStatus.PAUSED
        : RoommateProfileStatus.ACTIVE;

    return this.profileRepo.save(profile);
  }
}

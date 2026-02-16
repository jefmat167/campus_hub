import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, VerificationTier } from '../../database/entities/user.entity';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
  ) { }

  /**
   * Get user by ID
   */
  async findById(id: string): Promise<User> {
    const user = await this.userRepo.findOne({
      where: { id },
      relations: ['university', 'faculty', 'department'],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  /**
   * Get user profile (sanitized, same format as auth/register response)
   */
  async getProfile(userId: string): Promise<Record<string, any>> {
    const user = await this.findById(userId);

    // Exclude sensitive fields and format relations (same as auth register response)
    const { passwordHash, refreshTokenHash, university, faculty, department, ...sanitized } = user;

    return {
      ...sanitized,
      university: university ? { id: university.id, name: university.name, code: university.code } : undefined,
      faculty: faculty ? { id: faculty.id, name: faculty.name, code: faculty.code } : undefined,
      department: department ? { id: department.id, name: department.name, code: department.code } : undefined,
    };
  }

  /**
   * Get public profile of another user
   */
  async getPublicProfile(
    userId: string,
    viewerId: string,
  ): Promise<Partial<User> & { isVerifiedSeller: boolean }> {
    const [user, viewer] = await Promise.all([
      this.findById(userId),
      this.findById(viewerId),
    ]);

    // Only allow viewing profiles within same university
    if (user.universityId !== viewer.universityId) {
      throw new NotFoundException('User not found');
    }

    return {
      id: user.id,
      fullName: user.fullName,
      profilePhotoUrl: user.profilePhotoUrl,
      bio: user.bio,
      yearOfStudy: user.yearOfStudy,
      faculty: user.faculty,
      department: user.department,
      verificationTier: user.verificationTier,
      sellerRating: user.sellerRating,
      sellerRatingCount: user.sellerRatingCount,
      buyerRating: user.buyerRating,
      buyerRatingCount: user.buyerRatingCount,
      completedTransactions: user.completedTransactions,
      isVerifiedSeller: user.isVerifiedSeller,
      createdAt: user.createdAt,
    };
  }

  /**
   * Update user profile
   */
  async updateProfile(userId: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.findById(userId);

    // Update only provided fields
    if (dto.fullName !== undefined) {
      user.fullName = dto.fullName;
    }
    if (dto.bio !== undefined) {
      user.bio = dto.bio;
    }
    if (dto.yearOfStudy !== undefined) {
      user.yearOfStudy = dto.yearOfStudy;
    }
    if (dto.profilePhotoUrl !== undefined) {
      user.profilePhotoUrl = dto.profilePhotoUrl;
    }

    await this.userRepo.save(user);

    return user;
  }

  /**
   * Update last active timestamp
   */
  async updateLastActive(userId: string): Promise<void> {
    await this.userRepo.update(userId, {
      lastActiveAt: new Date(),
    });
  }

  /**
   * Check if user can transact
   */
  async canTransact(userId: string): Promise<{ canTransact: boolean; reason?: string; }> {
    const user = await this.findById(userId);

    if (user.isBanned) {
      if (!user.banExpiresAt || user.banExpiresAt > new Date()) {
        return {
          canTransact: false,
          reason: 'Your account has been suspended',
        };
      }
    }

    if (user.verificationTier === VerificationTier.NONE) {
      return {
        canTransact: false,
        reason: 'Please complete verification (phone + email) to transact',
      };
    }

    return { canTransact: true };
  }
}

import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Review } from '../../database/entities/review.entity';
import {
  EscrowTransaction,
  EscrowStatus,
} from '../../database/entities/escrow.entity';
import { User } from '../../database/entities/user.entity';
import { CreateReviewDto, UpdateReviewDto } from './dto';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(Review)
    private readonly reviewRepository: Repository<Review>,
    @InjectRepository(EscrowTransaction)
    private readonly escrowRepository: Repository<EscrowTransaction>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * Sanitize user object to remove sensitive data
   */
  private sanitizeUser(user: User): Record<string, any> {
    if (!user) return user;

    return {
      id: user.id,
      fullName: user.fullName,
      profilePhotoUrl: user.profilePhotoUrl,
      verificationTier: user.verificationTier,
      sellerRating: user.sellerRating,
      sellerRatingCount: user.sellerRatingCount,
    };
  }

  /**
   * Sanitize user relations in a review
   */
  private sanitizeReviewUsers(review: Review): Review {
    if ((review as any).reviewer) {
      (review as any).reviewer = this.sanitizeUser((review as any).reviewer);
    }
    if ((review as any).reviewee) {
      (review as any).reviewee = this.sanitizeUser((review as any).reviewee);
    }
    return review;
  }

  /**
   * Sanitize user relations in an array of reviews
   */
  private sanitizeReviewsUsers(reviews: Review[]): Review[] {
    return reviews.map((review) => this.sanitizeReviewUsers(review));
  }

  async createReview(userId: string, dto: CreateReviewDto): Promise<Review> {
    const escrow = await this.escrowRepository.findOne({
      where: { id: dto.escrowTransactionId },
    });

    if (!escrow) {
      throw new NotFoundException('Escrow transaction not found');
    }

    if (escrow.status !== EscrowStatus.COMPLETED) {
      throw new BadRequestException(
        'Can only review completed escrow transactions',
      );
    }

    // Only the buyer can review the seller
    if (userId !== escrow.buyerId) {
      if (userId === escrow.sellerId) {
        throw new ForbiddenException('Sellers cannot review buyers');
      }
      throw new ForbiddenException(
        'You are not a party to this transaction',
      );
    }

    const revieweeId = escrow.sellerId;

    // Check if review already exists
    const existingReview = await this.reviewRepository.findOne({
      where: {
        escrowTransactionId: dto.escrowTransactionId,
        reviewerId: userId,
      },
    });

    if (existingReview) {
      throw new ConflictException(
        'You have already reviewed this transaction',
      );
    }

    const review = this.reviewRepository.create({
      escrowTransactionId: dto.escrowTransactionId,
      reviewerId: userId,
      revieweeId,
      rating: dto.rating,
      comment: dto.comment || null,
    });

    const savedReview = await this.reviewRepository.save(review);

    // Update the seller's rating
    await this.updateSellerRating(revieweeId);

    return this.getReviewById(savedReview.id);
  }

  async updateReview(
    reviewId: string,
    userId: string,
    dto: UpdateReviewDto,
  ): Promise<Review> {
    const review = await this.reviewRepository.findOne({
      where: { id: reviewId },
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    if (review.reviewerId !== userId) {
      throw new ForbiddenException('You can only edit your own reviews');
    }

    // Check if review is within editable period (e.g., 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    if (review.createdAt < sevenDaysAgo) {
      throw new BadRequestException(
        'Reviews can only be edited within 7 days of creation',
      );
    }

    const updateData: {
      isEdited: boolean;
      rating?: number;
      comment?: string | null;
    } = {
      isEdited: true,
    };

    if (dto.rating !== undefined) {
      updateData.rating = dto.rating;
    }

    if (dto.comment !== undefined) {
      updateData.comment = dto.comment || null;
    }

    await this.reviewRepository.update(reviewId, updateData);

    // Recalculate seller's rating if rating changed
    if (dto.rating !== undefined && dto.rating !== review.rating) {
      await this.updateSellerRating(review.revieweeId);
    }

    return this.getReviewById(reviewId);
  }

  async getReviewById(reviewId: string): Promise<Review> {
    const review = await this.reviewRepository.findOne({
      where: { id: reviewId },
      relations: ['reviewer', 'reviewee'],
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    return this.sanitizeReviewUsers(review);
  }

  async getUserReviews(
    userId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{
    reviews: Review[];
    total: number;
    averageRating: number;
    ratingDistribution: Record<number, number>;
  }> {
    const offset = (page - 1) * limit;

    const [reviewsResult, distribution] = await Promise.all([
      this.reviewRepository.findAndCount({
        where: { revieweeId: userId },
        relations: ['reviewer'],
        order: { createdAt: 'DESC' },
        skip: offset,
        take: limit,
      }),
      this.reviewRepository
        .createQueryBuilder('review')
        .select('review.rating', 'rating')
        .addSelect('COUNT(*)', 'count')
        .where('review.revieweeId = :userId', { userId })
        .groupBy('review.rating')
        .getRawMany(),
    ]);

    const [reviews, total] = reviewsResult;

    const ratingDistribution: Record<number, number> = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };
    let ratingSum = 0;
    let ratingTotal = 0;
    distribution.forEach((d) => {
      const count = parseInt(d.count, 10);
      ratingDistribution[d.rating] = count;
      ratingSum += d.rating * count;
      ratingTotal += count;
    });

    return {
      reviews: this.sanitizeReviewsUsers(reviews),
      total,
      averageRating: ratingTotal > 0 ? ratingSum / ratingTotal : 0,
      ratingDistribution,
    };
  }

  async getReviewsGivenByUser(
    userId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ reviews: Review[]; total: number }> {
    const offset = (page - 1) * limit;

    const [reviews, total] = await this.reviewRepository.findAndCount({
      where: { reviewerId: userId },
      relations: ['reviewee'],
      order: { createdAt: 'DESC' },
      skip: offset,
      take: limit,
    });

    return { reviews: this.sanitizeReviewsUsers(reviews), total };
  }

  async getTransactionReviews(
    escrowTransactionId: string,
  ): Promise<Review[]> {
    const reviews = await this.reviewRepository.find({
      where: { escrowTransactionId },
      relations: ['reviewer', 'reviewee'],
    });

    return this.sanitizeReviewsUsers(reviews);
  }

  async canReviewTransaction(
    userId: string,
    escrowTransactionId: string,
  ): Promise<{
    canReview: boolean;
    reason?: string;
    existingReview?: Review;
  }> {
    const escrow = await this.escrowRepository.findOne({
      where: { id: escrowTransactionId },
    });

    if (!escrow) {
      return { canReview: false, reason: 'Escrow transaction not found' };
    }

    if (escrow.status !== EscrowStatus.COMPLETED) {
      return { canReview: false, reason: 'Escrow transaction not completed' };
    }

    if (userId === escrow.sellerId) {
      return { canReview: false, reason: 'Sellers cannot review buyers' };
    }

    if (userId !== escrow.buyerId) {
      return { canReview: false, reason: 'Not a party to this transaction' };
    }

    const existingReview = await this.reviewRepository.findOne({
      where: {
        escrowTransactionId,
        reviewerId: userId,
      },
    });

    if (existingReview) {
      return {
        canReview: false,
        reason: 'Already reviewed',
        existingReview,
      };
    }

    return { canReview: true };
  }

  private async updateSellerRating(sellerId: string): Promise<void> {
    const result = await this.reviewRepository
      .createQueryBuilder('review')
      .select('AVG(review.rating)', 'average')
      .addSelect('COUNT(*)', 'count')
      .where('review.revieweeId = :sellerId', { sellerId })
      .getRawOne<{ average: string | null; count: string }>();

    await this.userRepository.update(sellerId, {
      sellerRating: result?.average ? parseFloat(result.average) : 0,
      sellerRatingCount: parseInt(result?.count ?? '0', 10) || 0,
    });
  }
}

import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Review, ReviewType } from '../../database/entities/review.entity';
import { Offer, OfferStatus } from '../../database/entities/offer.entity';
import { User } from '../../database/entities/user.entity';
import { CreateReviewDto, UpdateReviewDto } from './dto';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(Review)
    private readonly reviewRepository: Repository<Review>,
    @InjectRepository(Offer)
    private readonly offerRepository: Repository<Offer>,
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
      buyerRating: user.buyerRating,
      buyerRatingCount: user.buyerRatingCount,
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
    // In this system, transactionId refers to an accepted offer
    // which represents a completed transaction
    const offer = await this.offerRepository.findOne({
      where: { id: dto.transactionId },
      relations: ['listing'],
    });

    if (!offer) {
      throw new NotFoundException('Transaction not found');
    }

    if (offer.status !== OfferStatus.ACCEPTED) {
      throw new BadRequestException(
        'Can only review completed transactions',
      );
    }

    // Determine review type and reviewee
    let reviewType: ReviewType;
    let revieweeId: string;

    if (userId === offer.buyerId) {
      // Buyer reviewing seller
      reviewType = ReviewType.BUYER_TO_SELLER;
      revieweeId = offer.sellerId;
    } else if (userId === offer.sellerId) {
      // Seller reviewing buyer
      reviewType = ReviewType.SELLER_TO_BUYER;
      revieweeId = offer.buyerId;
    } else {
      throw new ForbiddenException(
        'You are not a party to this transaction',
      );
    }

    // Check if review already exists
    const existingReview = await this.reviewRepository.findOne({
      where: {
        transactionId: dto.transactionId,
        reviewerId: userId,
        type: reviewType,
      },
    });

    if (existingReview) {
      throw new ConflictException(
        'You have already reviewed this transaction',
      );
    }

    // Create the review
    const review = this.reviewRepository.create({
      transactionId: dto.transactionId,
      reviewerId: userId,
      revieweeId,
      type: reviewType,
      rating: dto.rating,
      comment: dto.comment || null,
    });

    const savedReview = await this.reviewRepository.save(review);

    // Update the reviewee's rating
    await this.updateUserRating(revieweeId);

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

    const updateData: Partial<Review> = {
      isEdited: true,
    };

    if (dto.rating !== undefined) {
      updateData.rating = dto.rating;
    }

    if (dto.comment !== undefined) {
      updateData.comment = dto.comment || null;
    }

    await this.reviewRepository.update(reviewId, updateData);

    // Recalculate reviewee's rating if rating changed
    if (dto.rating !== undefined && dto.rating !== review.rating) {
      await this.updateUserRating(review.revieweeId);
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
    type?: ReviewType,
    page: number = 1,
    limit: number = 20,
  ): Promise<{
    reviews: Review[];
    total: number;
    averageRating: number;
    ratingDistribution: Record<number, number>;
  }> {
    const offset = (page - 1) * limit;

    const whereClause: any = { revieweeId: userId };
    if (type) {
      whereClause.type = type;
    }

    // Run paginated reviews and stats in parallel (2 queries instead of 3)
    const statsWhereClause: any = { revieweeId: userId };
    if (type) {
      statsWhereClause.type = type;
    }

    const [reviewsResult, distribution] = await Promise.all([
      this.reviewRepository.findAndCount({
        where: whereClause,
        relations: ['reviewer'],
        order: { createdAt: 'DESC' },
        skip: offset,
        take: limit,
      }),
      // Single query for both average and distribution
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
    transactionId: string,
  ): Promise<Review[]> {
    const reviews = await this.reviewRepository.find({
      where: { transactionId },
      relations: ['reviewer', 'reviewee'],
    });

    return this.sanitizeReviewsUsers(reviews);
  }

  async canReviewTransaction(
    userId: string,
    transactionId: string,
  ): Promise<{
    canReview: boolean;
    reason?: string;
    existingReview?: Review;
  }> {
    const offer = await this.offerRepository.findOne({
      where: { id: transactionId },
    });

    if (!offer) {
      return { canReview: false, reason: 'Transaction not found' };
    }

    if (offer.status !== OfferStatus.ACCEPTED) {
      return { canReview: false, reason: 'Transaction not completed' };
    }

    if (userId !== offer.buyerId && userId !== offer.sellerId) {
      return { canReview: false, reason: 'Not a party to this transaction' };
    }

    const reviewType =
      userId === offer.buyerId
        ? ReviewType.BUYER_TO_SELLER
        : ReviewType.SELLER_TO_BUYER;

    const existingReview = await this.reviewRepository.findOne({
      where: {
        transactionId,
        reviewerId: userId,
        type: reviewType,
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

  private async updateUserRating(userId: string): Promise<void> {
    // Fetch both seller and buyer ratings in a single query
    const results = await this.reviewRepository
      .createQueryBuilder('review')
      .select('review.type', 'type')
      .addSelect('AVG(review.rating)', 'average')
      .addSelect('COUNT(*)', 'count')
      .where('review.revieweeId = :userId', { userId })
      .groupBy('review.type')
      .getRawMany();

    const sellerResult = results.find((r) => r.type === ReviewType.BUYER_TO_SELLER);
    const buyerResult = results.find((r) => r.type === ReviewType.SELLER_TO_BUYER);

    await this.userRepository.update(userId, {
      sellerRating: sellerResult?.average ? parseFloat(sellerResult.average) : 0,
      sellerRatingCount: parseInt(sellerResult?.count, 10) || 0,
      buyerRating: buyerResult?.average ? parseFloat(buyerResult.average) : 0,
      buyerRatingCount: parseInt(buyerResult?.count, 10) || 0,
    });
  }
}

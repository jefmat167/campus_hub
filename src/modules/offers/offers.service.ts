import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, Not, In } from 'typeorm';
import { Offer, OfferStatus } from '../../database/entities/offer.entity';
import { Listing, ListingStatus } from '../../database/entities/listing.entity';
import { User } from '../../database/entities/user.entity';
import {
  CreateOfferDto,
  RespondOfferDto,
  OfferResponseAction,
} from './dto';

@Injectable()
export class OffersService {
  constructor(
    @InjectRepository(Offer)
    private readonly offerRepository: Repository<Offer>,
    @InjectRepository(Listing)
    private readonly listingRepository: Repository<Listing>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async createOffer(userId: string, dto: CreateOfferDto): Promise<Offer> {
    // Find the listing
    const listing = await this.listingRepository.findOne({
      where: { id: dto.listingId },
      relations: ['seller'],
    });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    if (listing.status !== ListingStatus.ACTIVE) {
      throw new BadRequestException('Listing is not available for offers');
    }

    // Prevent seller from making offer on their own listing
    if (listing.sellerId === userId) {
      throw new ForbiddenException('You cannot make an offer on your own listing');
    }

    // Check if user already has a pending offer on this listing
    const existingOffer = await this.offerRepository.findOne({
      where: {
        listingId: dto.listingId,
        buyerId: userId,
        status: In([OfferStatus.PENDING, OfferStatus.COUNTERED]),
      },
    });

    if (existingOffer) {
      throw new ConflictException(
        'You already have an active offer on this listing',
      );
    }

    // Validate offer amount (should be reasonable compared to listing price)
    if (listing.isNegotiable === false && dto.amount !== listing.price) {
      throw new BadRequestException(
        'This listing is not negotiable. Offer amount must match the listing price',
      );
    }

    // Offer expires in 48 hours
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 48);

    const offer = this.offerRepository.create({
      listingId: dto.listingId,
      buyerId: userId,
      sellerId: listing.sellerId,
      amount: dto.amount,
      message: dto.message || null,
      status: OfferStatus.PENDING,
      expiresAt,
    });

    const savedOffer = await this.offerRepository.save(offer);

    return this.getOfferById(savedOffer.id, userId);
  }

  async respondToOffer(
    offerId: string,
    userId: string,
    dto: RespondOfferDto,
  ): Promise<Offer> {
    const offer = await this.offerRepository.findOne({
      where: { id: offerId },
      relations: ['listing', 'buyer', 'seller'],
    });

    if (!offer) {
      throw new NotFoundException('Offer not found');
    }

    // Only the seller can respond to offers
    if (offer.sellerId !== userId) {
      throw new ForbiddenException('Only the seller can respond to this offer');
    }

    // Check if offer is still valid
    if (offer.status !== OfferStatus.PENDING) {
      throw new BadRequestException(
        `Cannot respond to an offer with status: ${offer.status}`,
      );
    }

    // Check if offer has expired
    if (new Date() > offer.expiresAt) {
      await this.offerRepository.update(offerId, {
        status: OfferStatus.EXPIRED,
      });
      throw new BadRequestException('This offer has expired');
    }

    const now = new Date();

    switch (dto.action) {
      case OfferResponseAction.ACCEPT:
        await this.acceptOffer(offer, now);
        break;

      case OfferResponseAction.REJECT:
        await this.offerRepository.update(offerId, {
          status: OfferStatus.REJECTED,
          respondedAt: now,
          counterMessage: dto.message || null,
        });
        break;

      case OfferResponseAction.COUNTER:
        if (!dto.counterAmount) {
          throw new BadRequestException(
            'Counter amount is required for counter offers',
          );
        }

        // Extend expiration for counter offer
        const newExpiresAt = new Date();
        newExpiresAt.setHours(newExpiresAt.getHours() + 48);

        await this.offerRepository.update(offerId, {
          status: OfferStatus.COUNTERED,
          counterAmount: dto.counterAmount,
          counterMessage: dto.message || null,
          respondedAt: now,
          expiresAt: newExpiresAt,
        });
        break;
    }

    return this.getOfferById(offerId, userId);
  }

  async acceptCounterOffer(offerId: string, userId: string): Promise<Offer> {
    const offer = await this.offerRepository.findOne({
      where: { id: offerId },
      relations: ['listing'],
    });

    if (!offer) {
      throw new NotFoundException('Offer not found');
    }

    // Only the buyer can accept counter offers
    if (offer.buyerId !== userId) {
      throw new ForbiddenException('Only the buyer can accept counter offers');
    }

    if (offer.status !== OfferStatus.COUNTERED) {
      throw new BadRequestException('This offer does not have a counter offer');
    }

    // Check if counter offer has expired
    if (new Date() > offer.expiresAt) {
      await this.offerRepository.update(offerId, {
        status: OfferStatus.EXPIRED,
      });
      throw new BadRequestException('This counter offer has expired');
    }

    await this.acceptOffer(offer, new Date());

    return this.getOfferById(offerId, userId);
  }

  async withdrawOffer(offerId: string, userId: string): Promise<void> {
    const offer = await this.offerRepository.findOne({
      where: { id: offerId },
    });

    if (!offer) {
      throw new NotFoundException('Offer not found');
    }

    // Only the buyer can withdraw their offer
    if (offer.buyerId !== userId) {
      throw new ForbiddenException('Only the buyer can withdraw this offer');
    }

    if (!['pending', 'countered'].includes(offer.status)) {
      throw new BadRequestException(
        `Cannot withdraw an offer with status: ${offer.status}`,
      );
    }

    await this.offerRepository.update(offerId, {
      status: OfferStatus.WITHDRAWN,
    });
  }

  private async acceptOffer(offer: Offer, respondedAt: Date): Promise<void> {
    // Update offer status
    await this.offerRepository.update(offer.id, {
      status: OfferStatus.ACCEPTED,
      respondedAt,
    });

    // Mark listing as in escrow
    await this.listingRepository.update(offer.listingId, {
      status: ListingStatus.IN_ESCROW,
    });

    // Reject all other pending offers for this listing
    await this.offerRepository.update(
      {
        listingId: offer.listingId,
        id: Not(offer.id),
        status: In([OfferStatus.PENDING, OfferStatus.COUNTERED]),
      },
      {
        status: OfferStatus.REJECTED,
        counterMessage: 'Another offer was accepted',
      },
    );
  }

  async getOfferById(offerId: string, userId: string): Promise<Offer> {
    const offer = await this.offerRepository.findOne({
      where: { id: offerId },
      relations: ['listing', 'listing.images', 'buyer', 'seller'],
    });

    if (!offer) {
      throw new NotFoundException('Offer not found');
    }

    // Only buyer or seller can view the offer
    if (offer.buyerId !== userId && offer.sellerId !== userId) {
      throw new ForbiddenException('You do not have access to this offer');
    }

    return offer;
  }

  async getOffersForListing(
    listingId: string,
    userId: string,
    status?: OfferStatus,
  ): Promise<Offer[]> {
    const listing = await this.listingRepository.findOne({
      where: { id: listingId },
    });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    // Only seller can view all offers for their listing
    if (listing.sellerId !== userId) {
      throw new ForbiddenException(
        'Only the seller can view offers for this listing',
      );
    }

    const whereClause: any = { listingId };
    if (status) {
      whereClause.status = status;
    }

    return this.offerRepository.find({
      where: whereClause,
      relations: ['buyer', 'listing'],
      order: { createdAt: 'DESC' },
    });
  }

  async getBuyerOffers(
    userId: string,
    status?: OfferStatus,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ offers: Offer[]; total: number; page: number; totalPages: number }> {
    const whereClause: any = { buyerId: userId };
    if (status) {
      whereClause.status = status;
    }

    const offset = (page - 1) * limit;

    const [offers, total] = await this.offerRepository.findAndCount({
      where: whereClause,
      relations: ['listing', 'listing.images', 'seller'],
      order: { createdAt: 'DESC' },
      skip: offset,
      take: limit,
    });

    return { offers, total, page, totalPages: Math.ceil(total / limit) };
  }

  async getSellerOffers(
    userId: string,
    status?: OfferStatus,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ offers: Offer[]; total: number; page: number; totalPages: number }> {
    const whereClause: any = { sellerId: userId };
    if (status) {
      whereClause.status = status;
    }

    const offset = (page - 1) * limit;

    const [offers, total] = await this.offerRepository.findAndCount({
      where: whereClause,
      relations: ['listing', 'listing.images', 'buyer'],
      order: { createdAt: 'DESC' },
      skip: offset,
      take: limit,
    });

    return { offers, total, page, totalPages: Math.ceil(total / limit) };
  }

  // Job to mark expired offers
  async markExpiredOffers(): Promise<number> {
    const result = await this.offerRepository.update(
      {
        status: In([OfferStatus.PENDING, OfferStatus.COUNTERED]),
        expiresAt: LessThan(new Date()),
      },
      {
        status: OfferStatus.EXPIRED,
      },
    );

    return result.affected || 0;
  }
}

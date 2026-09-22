import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  EscrowTransaction,
  EscrowStatus,
} from '../../database/entities/escrow.entity';
import { OrderItemType } from '../../database/entities/order-item.entity';
import {
  ServiceTimeProposal,
  ProposalParty,
  ProposalStatus,
} from '../../database/entities/service-time-proposal.entity';
import { NotificationType } from '../../database/entities/notification.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { TimingPolicyService } from '../../common/services/timing-policy.service';
import { EscrowService } from './escrow.service';
import {
  AVAILABILITY_VALIDATOR,
  AvailabilityValidator,
} from './availability/availability-validator';
import { RespondScheduleDto } from './dto/respond-schedule.dto';

export interface ScheduleView {
  orderId: string;
  orderNumber: string;
  status: EscrowStatus;
  appointmentAt: Date | null;
  agreedAt: Date | null;
  proposals: ServiceTimeProposal[];
}

/**
 * Service appointment negotiation (rev-2 spec 03.6): the P2P offer pattern
 * reused wholesale rather than a calendar system. The buyer's opening time
 * lands at checkout; from there whoever did NOT make the current proposal
 * accepts, rejects, or counters. Accept re-keys every deadline to the
 * appointment (EscrowService.activateServiceAppointment); reject terminates
 * with a free full refund; counters supersede, 48h on the table each, all
 * inside the overall 72h agreement window (the agreement-timeout job — never
 * extended by counters).
 */
@Injectable()
export class ServiceSchedulingService {
  private readonly logger = new Logger(ServiceSchedulingService.name);

  constructor(
    @InjectRepository(ServiceTimeProposal)
    private proposalRepo: Repository<ServiceTimeProposal>,
    @InjectRepository(EscrowTransaction)
    private escrowRepo: Repository<EscrowTransaction>,
    private escrowService: EscrowService,
    private notificationsService: NotificationsService,
    private timingPolicy: TimingPolicyService,
    @Inject(AVAILABILITY_VALIDATOR)
    private availability: AvailabilityValidator,
  ) { }

  /** The calendar seam (rev-2 spec 05): checkout + counters + accepts pass through here. */
  async assertAvailable(
    listingId: string | null,
    proposedTime: Date,
  ): Promise<void> {
    await this.availability.assertAvailable({ listingId, proposedTime });
  }

  /** Both parties' view of the negotiation trail. */
  async getSchedule(orderId: string, userId: string): Promise<ScheduleView> {
    const order = await this.loadServiceOrder(orderId, userId);
    const proposals = await this.proposalRepo.find({
      where: { orderId },
      order: { createdAt: 'ASC' },
    });
    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      appointmentAt: order.appointmentAt,
      agreedAt: order.agreedAt,
      proposals,
    };
  }

  /**
   * Respond to the open time proposal — by whichever party did NOT make it
   * (the vendor answers the buyer's opening time; the buyer answers a
   * vendor counter).
   */
  async respond(
    orderId: string,
    userId: string,
    dto: RespondScheduleDto,
  ): Promise<{
    order: EscrowTransaction;
    proposal: ServiceTimeProposal;
    codeWindow?: { validFrom: Date; validUntil: Date };
  }> {
    const order = await this.loadServiceOrder(orderId, userId);
    if (order.status !== EscrowStatus.PENDING_CONFIRMATION) {
      throw new BadRequestException(
        `Time negotiation is closed. Order status is: ${order.status}`,
      );
    }

    const current = await this.proposalRepo.findOne({
      where: { orderId, status: ProposalStatus.PENDING },
      order: { createdAt: 'DESC' },
    });
    if (!current) {
      throw new BadRequestException('There is no open time proposal on this order');
    }

    const responderParty =
      order.buyerId === userId ? ProposalParty.BUYER : ProposalParty.VENDOR;
    if (current.proposedBy === responderParty) {
      throw new ForbiddenException(
        'Waiting for the other party to respond to your proposal',
      );
    }

    switch (dto.action) {
      case 'accept':
        return this.accept(order, current);
      case 'reject':
        return this.reject(order, current, userId, dto.message);
      case 'counter':
        return this.counter(order, current, responderParty, dto);
      default:
        throw new BadRequestException('Unknown action');
    }
  }

  private async accept(
    order: EscrowTransaction,
    current: ServiceTimeProposal,
  ): Promise<{
    order: EscrowTransaction;
    proposal: ServiceTimeProposal;
    codeWindow: { validFrom: Date; validUntil: Date };
  }> {
    if (new Date() > new Date(current.expiresAt)) {
      current.status = ProposalStatus.EXPIRED;
      await this.proposalRepo.save(current);
      throw new BadRequestException(
        'This proposal has expired — counter with a new time',
      );
    }
    const appointmentAt = new Date(current.proposedTime);
    if (appointmentAt <= new Date()) {
      throw new BadRequestException(
        'The proposed time has already passed — counter with a new time',
      );
    }
    await this.assertAvailable(this.serviceListingId(order), appointmentAt);

    current.status = ProposalStatus.ACCEPTED;
    await this.proposalRepo.save(current);

    const { escrow, deliveryCode } =
      await this.escrowService.activateServiceAppointment(
        order.id,
        appointmentAt,
      );

    this.logger.log(
      `Order ${order.id}: proposal ${current.id} accepted (${appointmentAt.toISOString()})`,
    );
    // The code VALUE stays buyer-only (fetched via GET /escrow/:id/delivery-code);
    // the responder — usually the vendor — only sees the window.
    return {
      order: escrow,
      proposal: current,
      codeWindow: {
        validFrom: deliveryCode.validFrom,
        validUntil: deliveryCode.validUntil,
      },
    };
  }

  private async reject(
    order: EscrowTransaction,
    current: ServiceTimeProposal,
    userId: string,
    message?: string,
  ): Promise<{ order: EscrowTransaction; proposal: ServiceTimeProposal }> {
    current.status = ProposalStatus.REJECTED;
    await this.proposalRepo.save(current);

    // Rejecting the time kills the booking (offer semantics) — free full
    // refund either way: the vendor path is the standard pending-order
    // rejection, the buyer path the standard free pending cancel.
    if (order.sellerId === userId) {
      const escrow = await this.escrowService.rejectOrder(
        order.id,
        userId,
        message ?? 'Appointment time could not be agreed',
      );
      return { order: escrow, proposal: current };
    }
    const { escrow } = await this.escrowService.cancelEscrow(order.id, userId);
    return { order: escrow, proposal: current };
  }

  private async counter(
    order: EscrowTransaction,
    current: ServiceTimeProposal,
    responderParty: ProposalParty,
    dto: RespondScheduleDto,
  ): Promise<{ order: EscrowTransaction; proposal: ServiceTimeProposal }> {
    if (!dto.proposedTime) {
      throw new BadRequestException('A counter needs a proposedTime');
    }
    const proposedTime = new Date(dto.proposedTime);
    if (Number.isNaN(proposedTime.getTime())) {
      throw new BadRequestException('proposedTime is not a valid date');
    }
    if (proposedTime <= new Date()) {
      throw new BadRequestException('The proposed time must be in the future');
    }
    const policy = this.timingPolicy.resolve({
      market: 'vendor',
      itemType: 'vendor_service',
    });
    const horizonEndsAt = new Date(
      new Date(order.createdAt).getTime() +
        policy.appointmentHorizonDays * 24 * 60 * 60 * 1000,
    );
    if (proposedTime > horizonEndsAt) {
      throw new BadRequestException(
        `An appointment can sit at most ${policy.appointmentHorizonDays} days from the order (spec 03.6) — pick an earlier time`,
      );
    }
    await this.assertAvailable(this.serviceListingId(order), proposedTime);

    current.status = ProposalStatus.SUPERSEDED;
    await this.proposalRepo.save(current);

    const proposal = await this.proposalRepo.save(
      this.proposalRepo.create({
        orderId: order.id,
        proposedBy: responderParty,
        proposedTime,
        message: dto.message ?? null,
        status: ProposalStatus.PENDING,
        expiresAt: new Date(
          Date.now() + policy.proposalExpiryHours * 60 * 60 * 1000,
        ),
      }),
    );

    // Counters never extend the 72h agreement window — the agreement-timeout
    // job stays exactly where checkout put it.
    const counterpartyId =
      responderParty === ProposalParty.BUYER ? order.sellerId : order.buyerId;
    const timeLabel = proposedTime.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    try {
      await this.notificationsService.createNotification({
        userId: counterpartyId,
        type: NotificationType.APPOINTMENT_PROPOSED,
        title: 'New time proposed',
        body: `Booking ${order.orderNumber}: ${responderParty === ProposalParty.BUYER ? 'the buyer' : 'the vendor'} countered with ${timeLabel}${dto.message ? ` — "${dto.message}"` : ''}. Accept, counter, or reject.`,
        data: {
          escrowId: order.id,
          orderNumber: order.orderNumber,
          proposalId: proposal.id,
          proposedTime: proposedTime.toISOString(),
        },
      });
    } catch (error) {
      this.logger.warn(
        `Counter-proposal notification failed for ${order.id}: ${error}`,
      );
    }

    this.logger.log(
      `Order ${order.id}: proposal ${current.id} superseded by ${proposal.id} (${proposedTime.toISOString()})`,
    );
    return { order, proposal };
  }

  // ─── helpers ────────────────────────────────────────────────────

  /** Load a service order the caller is party to (buyer or seller). */
  private async loadServiceOrder(
    orderId: string,
    userId: string,
  ): Promise<EscrowTransaction> {
    const order = await this.escrowRepo.findOne({
      where: { id: orderId },
      relations: ['orderItems'],
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== userId && order.sellerId !== userId) {
      throw new ForbiddenException('You are not part of this order');
    }
    const isService = (order.orderItems ?? []).some(
      (item) => item.itemType === OrderItemType.VENDOR_SERVICE,
    );
    if (!isService) {
      throw new BadRequestException(
        'This order has no appointment to negotiate — it is not a service booking',
      );
    }
    return order;
  }

  private serviceListingId(order: EscrowTransaction): string | null {
    return (
      (order.orderItems ?? []).find(
        (item) => item.itemType === OrderItemType.VENDOR_SERVICE,
      )?.listingId ?? null
    );
  }
}

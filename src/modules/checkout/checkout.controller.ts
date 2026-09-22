import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StudentAccountGuard } from '../../common/guards/student-account.guard';
import { TierGuard } from '../../common/guards/tier.guard';
import {
  TransactionPinGuard,
  RequireTransactionPin,
} from '../transaction-pin/transaction-pin.guard';
import { MinTier } from '../../common/decorators/min-tier.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User, VerificationTier } from '../../database/entities/user.entity';
import { CheckoutService } from './checkout.service';
import { CheckoutDto, DirectCheckoutDto } from './dto/checkout.dto';

@ApiTags('Checkout')
@Controller('checkout')
@UseGuards(JwtAuthGuard, StudentAccountGuard, TierGuard, TransactionPinGuard)
@MinTier(VerificationTier.TIER_0)
@ApiBearerAuth()
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) { }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequireTransactionPin()
  @ApiOperation({
    summary: 'Check out the cart (one wallet debit → one sub-order per seller)',
    description:
      'All-or-nothing: every listing is reserved with a race-checked flip, one wallet hold ' +
      'covers the checkout total (balance + daily velocity cap asserted inside the wallet ' +
      'lock), and the tier buy-limit applies to the TOTAL (Tier 0 ≤₦30k, Tier 1 ≤₦60k, ' +
      'Tier 2 unlimited). One transaction PIN covers the whole checkout. On any failure ' +
      'nothing is placed and the cart is left intact.',
  })
  @ApiResponse({
    status: 201,
    description: 'Checkout placed',
    schema: {
      example: {
        success: true,
        data: {
          checkoutId: 'a3a9d8a2-7f7e-4f4b-9a51-2f6f6d0f4b11',
          total: 23000,
          orders: [
            {
              id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
              orderNumber: 'ORD-2026-000201',
              sellerId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
              amount: 15000,
              itemCount: 2,
              deliveryLocation: 'Main gate',
            },
            {
              id: '1c2e6679-7425-40de-944b-e07fc1f90ae7',
              orderNumber: 'ORD-2026-000202',
              sellerId: '7d9e6679-7425-40de-944b-e07fc1f90ae8',
              amount: 8000,
              itemCount: 1,
              deliveryLocation: 'Library Building',
            },
          ],
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Stale lines / missing meet-up selections / empty cart' })
  @ApiResponse({ status: 403, description: 'Tier limit on the checkout total / PIN failure' })
  @ApiResponse({ status: 409, description: 'An item was bought by someone else mid-checkout' })
  async checkout(@CurrentUser() user: User, @Body() dto: CheckoutDto) {
    return this.checkoutService.checkoutFromCart(user, dto);
  }

  @Post('direct')
  @HttpCode(HttpStatus.CREATED)
  @RequireTransactionPin()
  @ApiOperation({
    summary: 'Buy-now: a one-listing checkout without touching the cart',
    description:
      'Same pipeline and rules as the cart checkout (tier cap on the total, race-checked ' +
      'reservation, single PIN), for the "buy this one thing" flow.',
  })
  @ApiResponse({ status: 201, description: 'Checkout placed' })
  async direct(@CurrentUser() user: User, @Body() dto: DirectCheckoutDto) {
    return this.checkoutService.checkoutDirect(user, dto);
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StudentAccountGuard } from '../../common/guards/student-account.guard';
import { TierGuard } from '../../common/guards/tier.guard';
import { MinTier } from '../../common/decorators/min-tier.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User, VerificationTier } from '../../database/entities/user.entity';
import { CartService } from './cart.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';

@ApiTags('Cart')
@Controller('cart')
@UseGuards(JwtAuthGuard, StudentAccountGuard, TierGuard)
@MinTier(VerificationTier.TIER_0)
@ApiBearerAuth()
export class CartController {
  constructor(private readonly cartService: CartService) { }

  @Get()
  @ApiOperation({
    summary: 'View the cart',
    description:
      'Lines carry freshness flags (listing_unavailable, price_changed, offer_lock_expired) — ' +
      'carting holds nothing, so checkout re-validates everything. Grouped per seller: each ' +
      'seller becomes one independent sub-order at checkout.',
  })
  @ApiResponse({ status: 200, description: 'Cart view with per-seller grouping' })
  async getCart(@CurrentUser() user: User) {
    return this.cartService.getCart(user.id);
  }

  @Post('items')
  @ApiOperation({
    summary: 'Add an item (listed price, or an accepted offer\'s locked price)',
    description:
      'Provide exactly one of listingId / offerId. An accepted offer keeps its negotiated ' +
      'price for 24 hours from acceptance; the item itself is never held.',
  })
  @ApiResponse({ status: 201, description: 'Updated cart view' })
  @ApiResponse({ status: 400, description: 'Unavailable listing / expired offer lock / own listing' })
  async addItem(@CurrentUser() user: User, @Body() dto: AddCartItemDto) {
    return this.cartService.addItem(user.id, dto);
  }

  @Delete('items/:itemId')
  @ApiOperation({ summary: 'Remove a cart line' })
  @ApiParam({ name: 'itemId', description: 'Cart item UUID' })
  async removeItem(
    @CurrentUser() user: User,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ) {
    return this.cartService.removeItem(user.id, itemId);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Clear the cart' })
  async clear(@CurrentUser() user: User) {
    await this.cartService.clear(user.id);
    return { cleared: true };
  }
}

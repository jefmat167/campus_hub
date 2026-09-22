import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '../../database/entities/user.entity';
import { VendorMarketService } from './vendor-market.service';
import {
  BrowseVendorsDto,
  SearchVendorListingsDto,
} from './dto/vendor-market-query.dto';

/**
 * Buyer read plane for the vendors' market (rev-2 spec 03.8). Everything is
 * scoped by service area: only vendors serving the caller's university are
 * visible — nothing surfaces at a campus the vendor doesn't serve.
 */
@ApiTags('Vendor Market')
@Controller('vendor-market')
@UseGuards(JwtAuthGuard, StudentAccountGuard)
@ApiBearerAuth()
export class VendorMarketController {
  constructor(private readonly marketService: VendorMarketService) { }

  @Get('vendors')
  @ApiOperation({
    summary: 'Browse vendors serving my university (category-first)',
    description:
      'Only ACTIVE vendors with at least one active listing (in the category, when filtered). ' +
      'Ratings are the shared per-user review aggregate.',
  })
  @ApiResponse({ status: 200, description: 'Paginated vendor summaries' })
  async browseVendors(@CurrentUser() user: User, @Query() dto: BrowseVendorsDto) {
    const { vendors, total, page, limit } =
      await this.marketService.browseVendors(user, dto);
    return {
      success: true,
      data: vendors,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  @Get('vendors/:profileId')
  @ApiOperation({
    summary: "A vendor's storefront: profile + rating + active listings",
  })
  @ApiParam({ name: 'profileId', description: 'Vendor profile UUID' })
  @ApiResponse({ status: 404, description: "Vendor doesn't serve your university / not active" })
  async storefront(
    @CurrentUser() user: User,
    @Param('profileId', ParseUUIDPipe) profileId: string,
  ) {
    return this.marketService.getStorefront(user, profileId);
  }

  @Get('vendors/:profileId/delivery')
  @ApiOperation({
    summary: "A vendor's delivery preset as it applies to MY university",
    description:
      'Vendor-level (2026-09-21 amendment to spec 03.2), so checkout needs it once per vendor, not per ' +
      'listing: `{ vendorProfileId, businessName, isHome, doorDeliveryFee, serviceTravelFee, ' +
      'dropPoints: [{ id, name, directions, fee }] }`. `doorDeliveryFee` is non-null only on the ' +
      "vendor's home campus; `dropPoints` are the ACTIVE admin points the vendor delivers to here. " +
      'Fees are naira. A listing may still be `pickupOnly` — check the line/detail flag.',
  })
  @ApiParam({ name: 'profileId', description: 'Vendor profile UUID' })
  @ApiResponse({ status: 404, description: "Vendor doesn't serve your university / not active" })
  async vendorDelivery(
    @CurrentUser() user: User,
    @Param('profileId', ParseUUIDPipe) profileId: string,
  ) {
    return this.marketService.getVendorDelivery(user, profileId);
  }

  @Get('search')
  @ApiOperation({
    summary: 'Item-level search across vendors serving my university',
    description:
      'ILIKE over title + description — matches "I want jollof rice right now" intent; a hit ' +
      'drops the student straight into that listing (spec 03.8).',
  })
  async search(@CurrentUser() user: User, @Query() dto: SearchVendorListingsDto) {
    const { listings, total, page, limit } =
      await this.marketService.searchListings(user, dto);
    return {
      success: true,
      data: listings,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  @Get('listings/:id')
  @ApiOperation({
    summary: 'Listing detail with fulfillment resolved for MY university',
    description:
      'Pickup at the shop is always available. `fulfillment` = `{ pickupAvailable, pickupOnly, ' +
      'delivery: { doorDelivery: { fee } | null, dropPoints: [{ id, name, directions, fee }] } | null, ' +
      "travel: { fee } | null }` — the vendor's per-campus preset, or nothing when the listing is " +
      '`pickupOnly`. Options expose soldOut flags, never raw stock figures.',
  })
  @ApiParam({ name: 'id', description: 'Vendor listing UUID' })
  async listingDetail(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.marketService.getListingDetail(user, id);
  }
}

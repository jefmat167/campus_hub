import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { VendorGuard } from './vendor.guard';
import { CurrentVendor } from './current-vendor.decorator';
import { VendorProfile } from '../../database/entities/vendor-profile.entity';
import { ListingStatus } from '../../database/entities/listing.entity';
import { VendorCatalogService } from './vendor-catalog.service';
import {
  AdjustStockDto,
  CreateVendorListingDto,
  ReplaceOptionGroupsDto,
  UpdateVendorListingDto,
} from './dto/vendor-listing-input.dto';

/**
 * Vendor write plane for the catalog. Reads work for any vendor profile;
 * writes require an ACTIVE storefront (service-enforced).
 */
@ApiTags('Vendor Catalog')
@Controller('vendors/me/listings')
@UseGuards(JwtAuthGuard, VendorGuard)
@ApiBearerAuth()
export class VendorCatalogController {
  constructor(private readonly catalogService: VendorCatalogService) { }

  @Post()
  @ApiOperation({
    summary: 'Create a catalog listing (goods or service)',
    description:
      'One payload: base fields + option groups (variants & add-ons, each option with its own ' +
      'price delta/stock). Delivery is NOT per listing: every listing inherits the vendor\'s ' +
      'per-campus preset (`PUT /vendors/me/delivery`); set `pickupOnly: true` to keep this one ' +
      'item pickup / at-the-shop only. Services carry no stock and are always manual-confirm; ' +
      'goods with untracked stock are forced to manual-confirm (auto-confirmation requires ' +
      'tracked stock — rev-2 03.5).',
  })
  @ApiResponse({ status: 201, description: 'Listing created (active)' })
  @ApiResponse({ status: 400, description: 'Confirmation/stock rule violation' })
  @ApiResponse({ status: 403, description: 'Storefront not active' })
  async create(
    @CurrentVendor() profile: VendorProfile,
    @Body() dto: CreateVendorListingDto,
  ) {
    return this.catalogService.createListing(profile, dto);
  }

  @Get()
  @ApiOperation({ summary: 'My catalog (active + paused; raw stock figures)' })
  @ApiQuery({ name: 'status', required: false, enum: ['active', 'paused'] })
  async list(
    @CurrentVendor() profile: VendorProfile,
    @Query('status') status?: ListingStatus,
  ) {
    return this.catalogService.listOwn(profile, status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One of my listings, full detail (options + stock + pickupOnly)' })
  @ApiParam({ name: 'id', description: 'Vendor listing UUID' })
  async getOne(
    @CurrentVendor() profile: VendorProfile,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.catalogService.getOwnListing(profile, id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update base fields / pause / unpause; append images',
    description:
      'Setting stock to null (untracked) forces manual confirmation back on; explicitly ' +
      'requesting manualConfirm=false with untracked stock is a 400.',
  })
  @ApiParam({ name: 'id', description: 'Vendor listing UUID' })
  async update(
    @CurrentVendor() profile: VendorProfile,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVendorListingDto,
  ) {
    return this.catalogService.updateListing(profile, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a listing' })
  @ApiParam({ name: 'id', description: 'Vendor listing UUID' })
  async remove(
    @CurrentVendor() profile: VendorProfile,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.catalogService.deleteListing(profile, id);
  }

  @Put(':id/option-groups')
  @ApiOperation({
    summary: 'Replace the full option-group set',
    description:
      'Order lines snapshot their selected options, so replacing groups never corrupts history.',
  })
  @ApiParam({ name: 'id', description: 'Vendor listing UUID' })
  async replaceOptionGroups(
    @CurrentVendor() profile: VendorProfile,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplaceOptionGroupsDto,
  ) {
    return this.catalogService.replaceOptionGroups(profile, id, dto);
  }

  @Patch(':id/stock')
  @ApiOperation({ summary: 'Adjust base stock (goods only; null = stop tracking)' })
  @ApiParam({ name: 'id', description: 'Vendor listing UUID' })
  async adjustStock(
    @CurrentVendor() profile: VendorProfile,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdjustStockDto,
  ) {
    return this.catalogService.adjustBaseStock(profile, id, dto);
  }

  @Patch(':id/options/:optionId/stock')
  @ApiOperation({ summary: "Adjust one option's stock" })
  @ApiParam({ name: 'id', description: 'Vendor listing UUID' })
  @ApiParam({ name: 'optionId', description: 'Option UUID' })
  async adjustOptionStock(
    @CurrentVendor() profile: VendorProfile,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('optionId', ParseUUIDPipe) optionId: string,
    @Body() dto: AdjustStockDto,
  ) {
    return this.catalogService.adjustOptionStock(profile, id, optionId, dto);
  }
}

import {
  VendorListing,
  VendorListingType,
} from '../../database/entities/vendor-listing.entity';

/**
 * Sold-out derivation (rev-2 spec 03.3): a goods listing with tracked stock
 * at 0 is sold out, and so is any listing with a REQUIRED option group whose
 * options are all tracked-and-at-0 (nothing purchasable can be selected).
 * Untracked (null) stock never counts as sold out. Optional groups selling
 * out never block the listing.
 */
export function isListingSoldOut(
  listing: Pick<VendorListing, 'type' | 'stock'> & {
    optionGroups?: Array<{
      required: boolean;
      options?: Array<{ stock: number | null }>;
    }>;
  },
): boolean {
  if (
    listing.type === VendorListingType.GOODS &&
    listing.stock !== null &&
    listing.stock !== undefined &&
    listing.stock <= 0
  ) {
    return true;
  }
  for (const group of listing.optionGroups ?? []) {
    if (!group.required) continue;
    const options = group.options ?? [];
    if (
      options.length > 0 &&
      options.every(
        (option) =>
          option.stock !== null && option.stock !== undefined && option.stock <= 0,
      )
    ) {
      return true;
    }
  }
  return false;
}

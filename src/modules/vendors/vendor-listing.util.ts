import {
  VendorListing,
  VendorListingType,
} from '../../database/entities/vendor-listing.entity';
import { OptionSelectionType } from '../../database/entities/vendor-option.entity';
import { toKobo } from '../../common/utils/money';

/**
 * Sold-out derivation (rev-2 spec 03.3): a goods listing with tracked stock
 * at 0 is sold out, and so is any listing with a REQUIRED option group whose
 * options are all tracked-and-at-0 (nothing purchasable can be selected).
 * Untracked (null) stock never counts as sold out. Optional groups selling
 * out never block the listing.
 */
export interface ResolvedVendorSelection {
  ok: true;
  unitPriceKobo: number;
  selectedOptions: Array<{
    groupId: string;
    groupName: string;
    optionId: string;
    optionName: string;
    priceDelta: number;
  }>;
}

export interface RejectedVendorSelection {
  ok: false;
  reason: 'selection_invalid' | 'option_unavailable';
}

/**
 * Resolve a buyer's option selection against a listing's groups (rev-2 spec
 * 03.3): required single groups need exactly one pick, required multi at
 * least one, single groups never allow two. The unit price is basePrice +
 * the sum of selected deltas (kobo-exact). Tracked options with less stock
 * than the requested quantity reject early with `option_unavailable` — the
 * authoritative check is checkout's conditional decrement.
 */
export function resolveVendorSelection(
  listing: Pick<VendorListing, 'basePrice'> & {
    optionGroups?: Array<{
      id: string;
      name: string;
      selectionType: OptionSelectionType;
      required: boolean;
      options?: Array<{
        id: string;
        name: string;
        priceDelta: number;
        stock: number | null;
      }>;
    }>;
  },
  selectedOptionIds: string[] = [],
  quantity = 1,
): ResolvedVendorSelection | RejectedVendorSelection {
  const ids = new Set(selectedOptionIds);
  if (ids.size !== selectedOptionIds.length) {
    return { ok: false, reason: 'selection_invalid' };
  }

  let unitPriceKobo = toKobo(Number(listing.basePrice));
  const selectedOptions: ResolvedVendorSelection['selectedOptions'] = [];
  const knownSelected = new Set<string>();

  for (const group of listing.optionGroups ?? []) {
    const picked = (group.options ?? []).filter((option) => ids.has(option.id));
    picked.forEach((option) => knownSelected.add(option.id));

    if (group.selectionType === OptionSelectionType.SINGLE && picked.length > 1) {
      return { ok: false, reason: 'selection_invalid' };
    }
    if (group.required && picked.length === 0) {
      return { ok: false, reason: 'selection_invalid' };
    }

    for (const option of picked) {
      if (option.stock !== null && option.stock < quantity) {
        return { ok: false, reason: 'option_unavailable' };
      }
      unitPriceKobo += toKobo(Number(option.priceDelta));
      selectedOptions.push({
        groupId: group.id,
        groupName: group.name,
        optionId: option.id,
        optionName: option.name,
        priceDelta: Number(option.priceDelta),
      });
    }
  }

  // Selections pointing at options this listing doesn't have are invalid.
  for (const id of ids) {
    if (!knownSelected.has(id)) {
      return { ok: false, reason: 'selection_invalid' };
    }
  }

  return { ok: true, unitPriceKobo, selectedOptions };
}

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

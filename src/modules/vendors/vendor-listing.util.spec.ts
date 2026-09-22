import { isListingSoldOut } from './vendor-listing.util';
import { ListingKind } from '../../database/entities/listing.entity';

/** Sold-out derivation matrix (rev-2 spec 03.3). */
describe('isListingSoldOut', () => {
  const goods = (stock: number | null, groups: any[] = []) =>
    ({ kind: ListingKind.VENDOR_GOODS, stock, optionGroups: groups }) as any;

  it('tracked base stock at 0 → sold out; untracked never does', () => {
    expect(isListingSoldOut(goods(0))).toBe(true);
    expect(isListingSoldOut(goods(3))).toBe(false);
    expect(isListingSoldOut(goods(null))).toBe(false);
  });

  it('a REQUIRED group with every tracked option at 0 → sold out', () => {
    const soldOutSizes = {
      required: true,
      options: [{ stock: 0 }, { stock: 0 }],
    };
    expect(isListingSoldOut(goods(5, [soldOutSizes]))).toBe(true);
  });

  it('an OPTIONAL group selling out never blocks the listing', () => {
    const extras = { required: false, options: [{ stock: 0 }] };
    expect(isListingSoldOut(goods(5, [extras]))).toBe(false);
  });

  it('a required group survives on one purchasable option', () => {
    const sizes = { required: true, options: [{ stock: 0 }, { stock: 2 }] };
    expect(isListingSoldOut(goods(5, [sizes]))).toBe(false);
  });

  it('untracked options in a required group keep it purchasable', () => {
    const sizes = { required: true, options: [{ stock: 0 }, { stock: null }] };
    expect(isListingSoldOut(goods(5, [sizes]))).toBe(false);
  });

  it('services derive only from their required groups (no base stock)', () => {
    const service = {
      kind: ListingKind.VENDOR_SERVICE,
      stock: null,
      optionGroups: [{ required: true, options: [{ stock: 0 }] }],
    } as any;
    expect(isListingSoldOut(service)).toBe(true);
  });
});

import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MyBuyRequestsQueryDto } from './my-buy-requests-query.dto';
import { BuyRequestOfferQueryDto } from './buy-request-offer-query.dto';
import { OfferQueryDto, OfferStatusQueryDto } from '../../offers/dto/offer-query.dto';

/**
 * The list endpoints used to take `status` / `page` / `limit` as raw @Query()
 * primitives, so `?status=bogus` hit Postgres as an enum cast error and
 * `?page=-1` as a negative OFFSET — both 500s. The DTOs turn them into 400s
 * and cap `limit` at 100. Same shape for every list; test them together.
 */
const cases: Array<[string, any, string]> = [
  ['MyBuyRequestsQueryDto', MyBuyRequestsQueryDto, 'open'],
  ['BuyRequestOfferQueryDto', BuyRequestOfferQueryDto, 'pending'],
  ['OfferQueryDto', OfferQueryDto, 'pending'],
];

describe.each(cases)('%s', (_name, Dto, validStatus) => {
  const build = (query: Record<string, unknown>): any =>
    plainToInstance(Dto as any, query, { enableImplicitConversion: true });

  it('accepts a valid status with string page/limit and coerces them', async () => {
    const dto: any = build({ status: validStatus, page: '2', limit: '50' });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.page).toBe(2);
    expect(dto.limit).toBe(50);
  });

  it('defaults page to 1 and limit to 20 when omitted', async () => {
    const dto: any = build({});

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
  });

  it('rejects an unknown status (was a Postgres enum-cast 500)', async () => {
    const errors = await validate(build({ status: 'bogus' }));

    expect(errors.map((e) => e.property)).toEqual(['status']);
  });

  it('rejects an upper-case status — the enum values are lower-case', async () => {
    const errors = await validate(build({ status: validStatus.toUpperCase() }));

    expect(errors.map((e) => e.property)).toEqual(['status']);
  });

  it('rejects a negative or zero page (was a negative OFFSET 500)', async () => {
    expect((await validate(build({ page: '-1' }))).map((e) => e.property)).toEqual(['page']);
    expect((await validate(build({ page: '0' }))).map((e) => e.property)).toEqual(['page']);
  });

  it('rejects a negative limit and caps limit at 100', async () => {
    expect((await validate(build({ limit: '-5' }))).map((e) => e.property)).toEqual(['limit']);
    expect((await validate(build({ limit: '101' }))).map((e) => e.property)).toEqual(['limit']);
    expect(await validate(build({ limit: '100' }))).toHaveLength(0);
  });

  it('rejects a non-numeric page', async () => {
    expect((await validate(build({ page: 'abc' }))).map((e) => e.property)).toEqual(['page']);
  });
});

describe('OfferStatusQueryDto (listing/:listingId — status only)', () => {
  it('accepts a valid status and rejects a bogus one', async () => {
    expect(
      await validate(plainToInstance(OfferStatusQueryDto, { status: 'countered' })),
    ).toHaveLength(0);
    expect(
      (await validate(plainToInstance(OfferStatusQueryDto, { status: 'nope' }))).map(
        (e) => e.property,
      ),
    ).toEqual(['status']);
  });
});

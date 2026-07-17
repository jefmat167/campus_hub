import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, QueryRunner } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import {
  Wallet,
  WalletTransaction,
  WalletTransactionType,
  WalletTransactionStatus,
} from '../../database/entities/wallet.entity';
import { toKobo, toNaira } from '../../common/utils/money';

@Injectable()
export class WalletService {
  constructor(
    @InjectRepository(Wallet)
    private walletRepo: Repository<Wallet>,
    @InjectRepository(WalletTransaction)
    private transactionRepo: Repository<WalletTransaction>,
    private dataSource: DataSource,
  ) {}

  /**
   * Get wallet for a user
   */
  async getWallet(userId: string): Promise<Wallet> {
    const wallet = await this.walletRepo.findOne({
      where: { userId },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    return wallet;
  }

  /**
   * Get wallet balance
   */
  async getBalance(userId: string): Promise<{
    balance: number;
    lockedBalance: number;
    availableBalance: number;
  }> {
    const wallet = await this.getWallet(userId);

    return {
      balance: Number(wallet.balance),
      lockedBalance: Number(wallet.lockedBalance),
      availableBalance: wallet.availableBalance,
    };
  }

  /**
   * Get transaction history
   */
  async getTransactions(
    userId: string,
    page = 1,
    limit = 20,
  ): Promise<{ transactions: WalletTransaction[]; total: number }> {
    const wallet = await this.getWallet(userId);

    const [transactions, total] = await this.transactionRepo.findAndCount({
      where: { walletId: wallet.id },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { transactions, total };
  }

  /**
   * Credit wallet (deposit)
   */
  async creditWallet(
    userId: string,
    amount: number,
    reference: string,
    type: WalletTransactionType = WalletTransactionType.DEPOSIT,
    externalReference?: string,
    externalQueryRunner?: QueryRunner,
  ): Promise<WalletTransaction> {
    if (amount <= 0) {
      throw new BadRequestException('Amount must be positive');
    }

    const isExternalTx = !!externalQueryRunner;
    const queryRunner =
      externalQueryRunner || this.dataSource.createQueryRunner();

    if (!isExternalTx) {
      await queryRunner.connect();
      await queryRunner.startTransaction();
    }

    try {
      const wallet = await queryRunner.manager.findOne(Wallet, {
        where: { userId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!wallet) {
        throw new NotFoundException('Wallet not found');
      }

      if (wallet.isLocked) {
        throw new BadRequestException('Wallet is locked');
      }

      const balanceBefore = Number(wallet.balance);
      wallet.balance = balanceBefore + amount;

      await queryRunner.manager.save(wallet);

      const transaction = this.transactionRepo.create({
        walletId: wallet.id,
        type,
        amount,
        status: WalletTransactionStatus.COMPLETED,
        reference,
        externalReference,
        balanceBefore,
        balanceAfter: Number(wallet.balance),
      });

      await queryRunner.manager.save(transaction);

      if (!isExternalTx) {
        await queryRunner.commitTransaction();
      }

      return transaction;
    } catch (error) {
      if (!isExternalTx) {
        await queryRunner.rollbackTransaction();
      }
      throw error;
    } finally {
      if (!isExternalTx) {
        await queryRunner.release();
      }
    }
  }

  /**
   * Debit wallet (withdrawal)
   */
  async debitWallet(
    userId: string,
    amount: number,
    reference: string,
    type: WalletTransactionType = WalletTransactionType.WITHDRAWAL,
    externalReference?: string,
  ): Promise<WalletTransaction> {
    if (amount <= 0) {
      throw new BadRequestException('Amount must be positive');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const wallet = await queryRunner.manager.findOne(Wallet, {
        where: { userId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!wallet) {
        throw new NotFoundException('Wallet not found');
      }

      if (wallet.isLocked) {
        throw new BadRequestException('Wallet is locked');
      }

      if (wallet.availableBalance < amount) {
        throw new BadRequestException('Insufficient balance');
      }

      const balanceBefore = Number(wallet.balance);
      wallet.balance = balanceBefore - amount;

      await queryRunner.manager.save(wallet);

      const transaction = this.transactionRepo.create({
        walletId: wallet.id,
        type,
        amount: -amount,
        status: WalletTransactionStatus.COMPLETED,
        reference,
        externalReference,
        balanceBefore,
        balanceAfter: Number(wallet.balance),
      });

      await queryRunner.manager.save(transaction);
      await queryRunner.commitTransaction();

      return transaction;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Lock funds for escrow
   */
  async lockFunds(
    userId: string,
    amount: number,
    reference: string,
    externalQueryRunner?: QueryRunner,
  ): Promise<WalletTransaction> {
    if (amount <= 0) {
      throw new BadRequestException('Amount must be positive');
    }

    const isExternalTx = !!externalQueryRunner;
    const queryRunner =
      externalQueryRunner || this.dataSource.createQueryRunner();

    if (!isExternalTx) {
      await queryRunner.connect();
      await queryRunner.startTransaction();
    }

    try {
      const wallet = await queryRunner.manager.findOne(Wallet, {
        where: { userId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!wallet) {
        throw new NotFoundException('Wallet not found');
      }

      if (wallet.isLocked) {
        throw new BadRequestException('Wallet is locked');
      }

      if (wallet.availableBalance < amount) {
        throw new BadRequestException('Insufficient balance');
      }

      const balanceBefore = Number(wallet.balance);
      wallet.lockedBalance = Number(wallet.lockedBalance) + amount;

      await queryRunner.manager.save(wallet);

      const transaction = this.transactionRepo.create({
        walletId: wallet.id,
        type: WalletTransactionType.ESCROW_HOLD,
        amount: -amount,
        status: WalletTransactionStatus.COMPLETED,
        reference,
        balanceBefore,
        balanceAfter: balanceBefore, // Balance stays same, only locked changes
        metadata: { lockedAmount: amount },
      });

      await queryRunner.manager.save(transaction);

      if (!isExternalTx) {
        await queryRunner.commitTransaction();
      }

      return transaction;
    } catch (error) {
      if (!isExternalTx) {
        await queryRunner.rollbackTransaction();
      }
      throw error;
    } finally {
      if (!isExternalTx) {
        await queryRunner.release();
      }
    }
  }

  /**
   * Refund locked funds (escrow cancellation)
   */
  async refundFunds(
    userId: string,
    amount: number,
    reference: string,
    externalQueryRunner?: QueryRunner,
  ): Promise<WalletTransaction> {
    const isExternalTx = !!externalQueryRunner;
    const queryRunner =
      externalQueryRunner || this.dataSource.createQueryRunner();

    if (!isExternalTx) {
      await queryRunner.connect();
      await queryRunner.startTransaction();
    }

    try {
      const wallet = await queryRunner.manager.findOne(Wallet, {
        where: { userId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!wallet) {
        throw new NotFoundException('Wallet not found');
      }

      // Validate sufficient locked balance before refunding
      if (Number(wallet.lockedBalance) < amount) {
        throw new BadRequestException(
          'Insufficient locked balance for escrow refund',
        );
      }

      // Release from locked balance
      wallet.lockedBalance = Number(wallet.lockedBalance) - amount;

      await queryRunner.manager.save(wallet);

      const transaction = this.transactionRepo.create({
        walletId: wallet.id,
        type: WalletTransactionType.ESCROW_REFUND,
        amount, // Positive as funds are returned to available
        status: WalletTransactionStatus.COMPLETED,
        reference,
        balanceBefore: Number(wallet.balance),
        balanceAfter: Number(wallet.balance),
        metadata: { refundedAmount: amount },
      });

      await queryRunner.manager.save(transaction);

      if (!isExternalTx) {
        await queryRunner.commitTransaction();
      }

      return transaction;
    } catch (error) {
      if (!isExternalTx) {
        await queryRunner.rollbackTransaction();
      }
      throw error;
    } finally {
      if (!isExternalTx) {
        await queryRunner.release();
      }
    }
  }

  /**
   * Settle an escrow hold atomically.
   *
   * The buyer locked `total` at initiation. Settlement distributes exactly
   * `total` across three buckets — `toSeller`, `toPlatform`, and the remaining
   * `refund` (returned to the buyer's available balance):
   *
   *     refund = total - toSeller - toPlatform      (must be >= 0)
   *
   * The buyer's locked balance is fully released (`-= total`) and their real
   * balance drops by exactly what leaves them (`toSeller + toPlatform`). The
   * seller is credited `toSeller`. The caller is responsible for crediting the
   * platform wallet with `toPlatform` on the SAME `queryRunner`.
   *
   * Must be called inside an existing transaction (escrow settlement touches
   * multiple entities that must commit together).
   */
  async settleEscrow(
    buyerId: string,
    sellerId: string,
    opts: { total: number; toSeller: number; toPlatform: number },
    reference: string,
    queryRunner: QueryRunner,
  ): Promise<void> {
    const total = Number(opts.total);
    const toSeller = Number(opts.toSeller);
    const toPlatform = Number(opts.toPlatform);

    // Work in integer kobo so the buckets sum back to `total` exactly.
    const leavingKobo = toKobo(toSeller) + toKobo(toPlatform);
    const refundKobo = toKobo(total) - leavingKobo;
    const leaving = toNaira(leavingKobo); // money actually leaving the buyer
    const refund = toNaira(refundKobo); // remainder unlocked back to the buyer

    if (total <= 0 || toSeller < 0 || toPlatform < 0) {
      throw new BadRequestException('Invalid settlement amounts');
    }
    if (refundKobo < 0) {
      throw new BadRequestException('Settlement exceeds escrow amount');
    }
    if (buyerId === sellerId) {
      throw new BadRequestException('Buyer and seller must differ');
    }

    // Lock both wallets in a deterministic order to avoid deadlocks.
    const lockWallet = (userId: string) =>
      queryRunner.manager.findOne(Wallet, {
        where: { userId },
        lock: { mode: 'pessimistic_write' },
      });

    let buyerWallet: Wallet | null;
    let sellerWallet: Wallet | null;
    if (buyerId < sellerId) {
      buyerWallet = await lockWallet(buyerId);
      sellerWallet = await lockWallet(sellerId);
    } else {
      sellerWallet = await lockWallet(sellerId);
      buyerWallet = await lockWallet(buyerId);
    }

    if (!buyerWallet || !sellerWallet) {
      throw new NotFoundException('Wallet not found');
    }

    if (Number(buyerWallet.lockedBalance) < total) {
      throw new BadRequestException(
        'Insufficient locked balance for escrow settlement',
      );
    }
    if (Number(buyerWallet.balance) < leaving) {
      throw new BadRequestException(
        'Insufficient balance for escrow settlement',
      );
    }

    const buyerBalanceBefore = Number(buyerWallet.balance);
    buyerWallet.lockedBalance = Number(buyerWallet.lockedBalance) - total;
    buyerWallet.balance = buyerBalanceBefore - leaving;

    const sellerBalanceBefore = Number(sellerWallet.balance);
    if (toSeller > 0) {
      sellerWallet.balance = sellerBalanceBefore + toSeller;
    }

    await queryRunner.manager.save([buyerWallet, sellerWallet]);

    const txns: WalletTransaction[] = [];

    // Buyer: funds leaving their real balance (to seller + platform).
    if (leaving > 0) {
      txns.push(
        this.transactionRepo.create({
          walletId: buyerWallet.id,
          type: WalletTransactionType.ESCROW_RELEASE,
          amount: -leaving,
          status: WalletTransactionStatus.COMPLETED,
          reference: `${reference}_debit`,
          balanceBefore: buyerBalanceBefore,
          balanceAfter: Number(buyerWallet.balance),
          metadata: { toSeller, toPlatform },
        }),
      );
    }

    // Buyer: refund portion unlocked back to available (balance unchanged).
    if (refund > 0) {
      txns.push(
        this.transactionRepo.create({
          walletId: buyerWallet.id,
          type: WalletTransactionType.ESCROW_REFUND,
          amount: refund,
          status: WalletTransactionStatus.COMPLETED,
          reference: `${reference}_refund`,
          balanceBefore: Number(buyerWallet.balance),
          balanceAfter: Number(buyerWallet.balance),
          metadata: { refundedAmount: refund },
        }),
      );
    }

    // Seller: amount received.
    if (toSeller > 0) {
      txns.push(
        this.transactionRepo.create({
          walletId: sellerWallet.id,
          type: WalletTransactionType.ESCROW_RELEASE,
          amount: toSeller,
          status: WalletTransactionStatus.COMPLETED,
          reference: `${reference}_release`,
          balanceBefore: sellerBalanceBefore,
          balanceAfter: Number(sellerWallet.balance),
        }),
      );
    }

    if (txns.length > 0) {
      await queryRunner.manager.save(txns);
    }
  }

  /**
   * Update bank account details
   */
  async updateBankAccount(
    userId: string,
    bankAccountNumber: string,
    bankCode: string,
    bankName: string,
    bankAccountName: string,
  ): Promise<Wallet> {
    const wallet = await this.getWallet(userId);

    wallet.bankAccountNumber = bankAccountNumber;
    wallet.bankCode = bankCode;
    wallet.bankName = bankName;
    wallet.bankAccountName = bankAccountName;

    await this.walletRepo.save(wallet);

    return wallet;
  }

  /**
   * Update Paystack recipient code for withdrawals
   */
  async updatePaystackRecipientCode(
    userId: string,
    recipientCode: string,
  ): Promise<void> {
    const wallet = await this.getWallet(userId);
    wallet.paystackRecipientCode = recipientCode;
    await this.walletRepo.save(wallet);
  }

  /**
   * Debit the wallet for a withdrawal and record a PENDING transaction in one
   * atomic step (pessimistic lock).
   *
   * The balance leaves immediately — the funds are committed to the transfer —
   * but the transaction stays PENDING until Paystack confirms via webhook
   * (`confirmWithdrawal` → COMPLETED) or the transfer fails/reverses
   * (`reverseWithdrawal` → REVERSED, balance refunded).
   */
  async debitForWithdrawal(
    userId: string,
    amount: number,
    reference: string,
    externalReference?: string,
  ): Promise<WalletTransaction> {
    if (amount <= 0) {
      throw new BadRequestException('Amount must be positive');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const wallet = await queryRunner.manager.findOne(Wallet, {
        where: { userId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!wallet) {
        throw new NotFoundException('Wallet not found');
      }

      if (wallet.isLocked) {
        throw new BadRequestException('Wallet is locked');
      }

      if (wallet.availableBalance < amount) {
        throw new BadRequestException('Insufficient balance');
      }

      const balanceBefore = Number(wallet.balance);
      wallet.balance = balanceBefore - amount;

      await queryRunner.manager.save(wallet);

      const transaction = this.transactionRepo.create({
        walletId: wallet.id,
        type: WalletTransactionType.WITHDRAWAL,
        amount: -amount,
        status: WalletTransactionStatus.PENDING,
        reference,
        externalReference,
        balanceBefore,
        balanceAfter: Number(wallet.balance),
      });

      await queryRunner.manager.save(transaction);
      await queryRunner.commitTransaction();

      return transaction;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Confirm withdrawal (called by webhook)
   */
  async confirmWithdrawal(reference: string): Promise<void> {
    const transaction = await this.transactionRepo.findOne({
      where: { reference, status: WalletTransactionStatus.PENDING },
    });

    if (transaction) {
      transaction.status = WalletTransactionStatus.COMPLETED;
      await this.transactionRepo.save(transaction);
    }
  }

  /**
   * Reverse a withdrawal and refund the balance (called by webhook on
   * transfer.failed / transfer.reversed, and by the controller if the transfer
   * can't be initiated).
   *
   * Idempotent: safe to call for duplicate webhooks. Reverses a withdrawal
   * that is still PENDING or already COMPLETED (Paystack can reverse a transfer
   * after it succeeded); a no-op if the row is missing or already REVERSED.
   */
  async reverseWithdrawal(reference: string): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const transaction = await queryRunner.manager.findOne(WalletTransaction, {
        where: { reference },
      });

      const reversible =
        transaction &&
        transaction.type === WalletTransactionType.WITHDRAWAL &&
        (transaction.status === WalletTransactionStatus.PENDING ||
          transaction.status === WalletTransactionStatus.COMPLETED);

      if (!reversible) {
        // Missing, already reversed, or not a withdrawal — nothing to do.
        await queryRunner.commitTransaction();
        return;
      }

      // Credit the debited amount back to the wallet.
      const wallet = await queryRunner.manager.findOne(Wallet, {
        where: { id: transaction.walletId },
        lock: { mode: 'pessimistic_write' },
      });

      if (wallet) {
        const amount = Math.abs(Number(transaction.amount));
        wallet.balance = Number(wallet.balance) + amount;
        await queryRunner.manager.save(wallet);
      }

      transaction.status = WalletTransactionStatus.REVERSED;
      await queryRunner.manager.save(transaction);

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Get transaction by ID (must belong to user's wallet)
   */
  async getTransactionById(
    userId: string,
    transactionId: string,
  ): Promise<WalletTransaction> {
    const wallet = await this.getWallet(userId);

    const transaction = await this.transactionRepo.findOne({
      where: { id: transactionId, walletId: wallet.id },
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    return transaction;
  }

  /**
   * Get transaction by reference
   */
  async getTransactionByReference(reference: string): Promise<WalletTransaction | null> {
    return this.transactionRepo.findOne({
      where: { reference },
    });
  }

  /**
   * Generate unique transaction reference
   */
  generateReference(): string {
    return `TXN_${Date.now()}_${uuidv4().substring(0, 8)}`;
  }

  // ─── Admin Methods ───────────────────────────────────────────────

  async adminListTransactions(dto: {
    type?: WalletTransactionType;
    status?: WalletTransactionStatus;
    userId?: string;
    dateFrom?: string;
    dateTo?: string;
    minAmount?: string;
    maxAmount?: string;
    sortOrder?: 'ASC' | 'DESC';
    page?: string;
    limit?: string;
  }): Promise<{ transactions: WalletTransaction[]; total: number }> {
    const page = Number(dto.page) || 1;
    const limit = Math.min(Number(dto.limit) || 20, 100);

    const query = this.transactionRepo
      .createQueryBuilder('tx')
      .leftJoinAndSelect('tx.wallet', 'wallet')
      .orderBy('tx.createdAt', dto.sortOrder || 'DESC');

    if (dto.type) {
      query.andWhere('tx.type = :type', { type: dto.type });
    }

    if (dto.status) {
      query.andWhere('tx.status = :status', { status: dto.status });
    }

    if (dto.userId) {
      query.andWhere('wallet.userId = :userId', { userId: dto.userId });
    }

    if (dto.dateFrom) {
      query.andWhere('tx.createdAt >= :dateFrom', { dateFrom: dto.dateFrom });
    }

    if (dto.dateTo) {
      query.andWhere('tx.createdAt <= :dateTo', { dateTo: dto.dateTo });
    }

    if (dto.minAmount) {
      query.andWhere('tx.amount >= :minAmount', { minAmount: toKobo(Number(dto.minAmount)) });
    }

    if (dto.maxAmount) {
      query.andWhere('tx.amount <= :maxAmount', { maxAmount: toKobo(Number(dto.maxAmount)) });
    }

    const [transactions, total] = await query
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { transactions, total };
  }

  async adminListWithdrawals(dto: {
    status?: WalletTransactionStatus;
    dateFrom?: string;
    dateTo?: string;
    page?: string;
    limit?: string;
  }): Promise<{ transactions: WalletTransaction[]; total: number }> {
    const page = Number(dto.page) || 1;
    const limit = Math.min(Number(dto.limit) || 20, 100);

    const query = this.transactionRepo
      .createQueryBuilder('tx')
      .leftJoinAndSelect('tx.wallet', 'wallet')
      .where('tx.type = :type', { type: WalletTransactionType.WITHDRAWAL })
      .orderBy('tx.createdAt', 'DESC');

    if (dto.status) {
      query.andWhere('tx.status = :status', { status: dto.status });
    }

    if (dto.dateFrom) {
      query.andWhere('tx.createdAt >= :dateFrom', { dateFrom: dto.dateFrom });
    }

    if (dto.dateTo) {
      query.andWhere('tx.createdAt <= :dateTo', { dateTo: dto.dateTo });
    }

    const [transactions, total] = await query
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { transactions, total };
  }

  async adminWalletAdjustment(
    userId: string,
    amount: number,
    type: 'credit' | 'debit',
    reason: string,
  ): Promise<WalletTransaction> {
    const reference = `ADMIN_ADJ_${Date.now()}_${uuidv4().substring(0, 8)}`;

    if (type === 'credit') {
      return this.creditWallet(
        userId,
        amount,
        reference,
        WalletTransactionType.DEPOSIT,
      );
    } else {
      return this.debitWallet(
        userId,
        amount,
        reference,
        WalletTransactionType.WITHDRAWAL,
      );
    }
  }
}

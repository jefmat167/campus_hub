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
   * Release locked funds (escrow completion)
   */
  async releaseFunds(
    fromUserId: string,
    toUserId: string,
    amount: number,
    reference: string,
    externalQueryRunner?: QueryRunner,
  ): Promise<void> {
    const isExternalTx = !!externalQueryRunner;
    const queryRunner =
      externalQueryRunner || this.dataSource.createQueryRunner();

    if (!isExternalTx) {
      await queryRunner.connect();
      await queryRunner.startTransaction();
    }

    try {
      // Lock both wallets
      const [fromWallet, toWallet] = await Promise.all([
        queryRunner.manager.findOne(Wallet, {
          where: { userId: fromUserId },
          lock: { mode: 'pessimistic_write' },
        }),
        queryRunner.manager.findOne(Wallet, {
          where: { userId: toUserId },
          lock: { mode: 'pessimistic_write' },
        }),
      ]);

      if (!fromWallet || !toWallet) {
        throw new NotFoundException('Wallet not found');
      }

      // Validate sender has sufficient locked and total balance
      if (Number(fromWallet.lockedBalance) < amount) {
        throw new BadRequestException(
          'Insufficient locked balance for escrow release',
        );
      }

      if (Number(fromWallet.balance) < amount) {
        throw new BadRequestException(
          'Insufficient balance for escrow release',
        );
      }

      // Deduct from locked balance of sender
      fromWallet.lockedBalance = Number(fromWallet.lockedBalance) - amount;
      fromWallet.balance = Number(fromWallet.balance) - amount;

      // Add to recipient
      const toBalanceBefore = Number(toWallet.balance);
      toWallet.balance = toBalanceBefore + amount;

      await queryRunner.manager.save([fromWallet, toWallet]);

      // Record transactions
      const releaseTransaction = this.transactionRepo.create({
        walletId: toWallet.id,
        type: WalletTransactionType.ESCROW_RELEASE,
        amount,
        status: WalletTransactionStatus.COMPLETED,
        reference: `${reference}_release`,
        balanceBefore: toBalanceBefore,
        balanceAfter: Number(toWallet.balance),
      });

      await queryRunner.manager.save(releaseTransaction);

      if (!isExternalTx) {
        await queryRunner.commitTransaction();
      }
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
   * Create pending withdrawal transaction
   */
  async createPendingWithdrawal(
    userId: string,
    amount: number,
    reference: string,
    externalReference: string,
  ): Promise<WalletTransaction> {
    const wallet = await this.getWallet(userId);

    const transaction = this.transactionRepo.create({
      walletId: wallet.id,
      type: WalletTransactionType.WITHDRAWAL,
      amount: -amount,
      status: WalletTransactionStatus.PENDING,
      reference,
      externalReference,
      balanceBefore: Number(wallet.balance),
      balanceAfter: Number(wallet.balance) - amount,
    });

    return this.transactionRepo.save(transaction);
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
   * Reverse failed withdrawal (called by webhook)
   */
  async reverseWithdrawal(reference: string): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const transaction = await queryRunner.manager.findOne(WalletTransaction, {
        where: { reference, status: WalletTransactionStatus.PENDING },
      });

      if (!transaction) {
        await queryRunner.commitTransaction();
        return;
      }

      // Get wallet and credit back the amount
      const wallet = await queryRunner.manager.findOne(Wallet, {
        where: { id: transaction.walletId },
        lock: { mode: 'pessimistic_write' },
      });

      if (wallet) {
        const amount = Math.abs(Number(transaction.amount));
        wallet.balance = Number(wallet.balance) + amount;
        await queryRunner.manager.save(wallet);
      }

      // Mark transaction as reversed
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
      query.andWhere('tx.amount >= :minAmount', { minAmount: Number(dto.minAmount) });
    }

    if (dto.maxAmount) {
      query.andWhere('tx.amount <= :maxAmount', { maxAmount: Number(dto.maxAmount) });
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

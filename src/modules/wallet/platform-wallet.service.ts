import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, QueryRunner } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import {
  PlatformWallet,
  PlatformWalletTransaction,
  PlatformTransactionType,
} from '../../database/entities/platform-wallet.entity';

@Injectable()
export class PlatformWalletService {
  private readonly logger = new Logger(PlatformWalletService.name);

  constructor(
    @InjectRepository(PlatformWallet)
    private platformWalletRepo: Repository<PlatformWallet>,
    @InjectRepository(PlatformWalletTransaction)
    private transactionRepo: Repository<PlatformWalletTransaction>,
    private dataSource: DataSource,
  ) {}

  /**
   * Get or create the platform wallet (singleton)
   */
  async getOrCreatePlatformWallet(): Promise<PlatformWallet> {
    let wallet = await this.platformWalletRepo.findOne({
      where: {},
      order: { createdAt: 'ASC' },
    });

    if (!wallet) {
      wallet = this.platformWalletRepo.create({
        balance: 0,
      });
      await this.platformWalletRepo.save(wallet);
      this.logger.log('Created platform wallet');
    }

    return wallet;
  }

  /**
   * Get platform wallet balance
   */
  async getBalance(): Promise<number> {
    const wallet = await this.getOrCreatePlatformWallet();
    return Number(wallet.balance);
  }

  /**
   * Credit platform wallet (escrow fee or cancellation fee)
   */
  async creditPlatformFee(
    amount: number,
    escrowId: string | null,
    type: PlatformTransactionType,
    description?: string,
    externalQueryRunner?: QueryRunner,
  ): Promise<PlatformWalletTransaction> {
    const isExternalTx = !!externalQueryRunner;
    const queryRunner =
      externalQueryRunner || this.dataSource.createQueryRunner();

    if (!isExternalTx) {
      await queryRunner.connect();
      await queryRunner.startTransaction();
    }

    try {
      // Get or create platform wallet with lock
      let wallet = await queryRunner.manager.findOne(PlatformWallet, {
        where: {},
        order: { createdAt: 'ASC' },
        lock: { mode: 'pessimistic_write' },
      });

      if (!wallet) {
        wallet = this.platformWalletRepo.create({ balance: 0 });
        await queryRunner.manager.save(wallet);
      }

      const balanceBefore = Number(wallet.balance);
      wallet.balance = balanceBefore + amount;

      await queryRunner.manager.save(wallet);

      const transaction = this.transactionRepo.create({
        platformWalletId: wallet.id,
        type,
        amount,
        reference: this.generateReference(type),
        escrowId,
        description:
          description ||
          (type === PlatformTransactionType.ESCROW_FEE
            ? 'Platform fee from escrow completion'
            : 'Platform share of cancellation fee'),
        balanceBefore,
        balanceAfter: Number(wallet.balance),
      });

      await queryRunner.manager.save(transaction);

      if (!isExternalTx) {
        await queryRunner.commitTransaction();
      }

      this.logger.log(
        `Platform wallet credited: ${amount} (${type})${escrowId ? ` [${escrowId}]` : ''}`,
      );

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
   * Debit the platform wallet — used to claw back a previously booked fee when
   * the underlying transaction is reversed (e.g. a completed withdrawal that
   * Paystack later reverses). Records a negative-amount transaction so the
   * ledger nets out. Runs in `externalQueryRunner` when given, so the debit is
   * atomic with the caller's reversal.
   */
  async debitPlatform(
    amount: number,
    type: PlatformTransactionType,
    description: string,
    externalQueryRunner?: QueryRunner,
  ): Promise<PlatformWalletTransaction> {
    const isExternalTx = !!externalQueryRunner;
    const queryRunner =
      externalQueryRunner || this.dataSource.createQueryRunner();

    if (!isExternalTx) {
      await queryRunner.connect();
      await queryRunner.startTransaction();
    }

    try {
      let wallet = await queryRunner.manager.findOne(PlatformWallet, {
        where: {},
        order: { createdAt: 'ASC' },
        lock: { mode: 'pessimistic_write' },
      });

      if (!wallet) {
        wallet = this.platformWalletRepo.create({ balance: 0 });
        await queryRunner.manager.save(wallet);
      }

      const balanceBefore = Number(wallet.balance);
      // The fee was just booked here, so the balance should cover it; never
      // over-debit — log any shortfall and claw back only what's available.
      const debited = Math.max(0, Math.min(amount, balanceBefore));
      if (debited < amount) {
        this.logger.warn(
          `Platform debit ${amount} (${type}) exceeds balance ${balanceBefore}; clawed back ${debited}.`,
        );
      }
      wallet.balance = balanceBefore - debited;
      await queryRunner.manager.save(wallet);

      const transaction = this.transactionRepo.create({
        platformWalletId: wallet.id,
        type,
        amount: -debited,
        reference: this.generateReference(type),
        escrowId: null,
        description,
        balanceBefore,
        balanceAfter: Number(wallet.balance),
      });

      await queryRunner.manager.save(transaction);

      if (!isExternalTx) {
        await queryRunner.commitTransaction();
      }

      this.logger.log(`Platform wallet debited: ${debited} (${type})`);
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
   * Get platform wallet transaction history
   */
  async getTransactions(
    page = 1,
    limit = 20,
    type?: PlatformTransactionType,
  ): Promise<{ transactions: PlatformWalletTransaction[]; total: number }> {
    const wallet = await this.getOrCreatePlatformWallet();

    const whereClause: Record<string, unknown> = {
      platformWalletId: wallet.id,
    };

    if (type) {
      whereClause.type = type;
    }

    const [transactions, total] = await this.transactionRepo.findAndCount({
      where: whereClause,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { transactions, total };
  }

  /**
   * Get transaction by reference
   */
  async getTransactionByReference(
    reference: string,
  ): Promise<PlatformWalletTransaction | null> {
    return this.transactionRepo.findOne({
      where: { reference },
    });
  }

  /**
   * Generate unique transaction reference
   */
  private generateReference(type: PlatformTransactionType): string {
    const prefix =
      type === PlatformTransactionType.ESCROW_FEE
        ? 'PFEE'
        : type === PlatformTransactionType.WITHDRAWAL_FEE
          ? 'WFEE'
          : 'CFEE';
    return `${prefix}_${Date.now()}_${uuidv4().substring(0, 8)}`;
  }
}

import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
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
   * Release locked funds (escrow completion)
   */
  async releaseFunds(
    fromUserId: string,
    toUserId: string,
    amount: number,
    reference: string,
  ): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

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
      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Refund locked funds (escrow cancellation)
   */
  async refundFunds(
    userId: string,
    amount: number,
    reference: string,
  ): Promise<WalletTransaction> {
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
}

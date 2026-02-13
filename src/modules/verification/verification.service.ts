import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  User,
  VerificationTier,
  Tier1ReviewStatus,
} from '../../database/entities/user.entity';
import {
  VerificationDocument,
  DocumentType,
  DocumentStatus,
} from '../../database/entities/verification-document.entity';
import { EmailService } from '../email/email.service';
import { EmailVerificationType } from '../../database/entities/email-verification.entity';
import { SubmitTier1DocumentsDto } from './dto/submit-tier1-documents.dto';
import { UploadDocumentDto } from './dto/upload-document.dto';

const MAX_SUBMISSION_ATTEMPTS = 3;

@Injectable()
export class VerificationService {
  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(VerificationDocument)
    private documentRepo: Repository<VerificationDocument>,
    private emailService: EmailService,
  ) { }

  // ============ Tier 1 Document Verification ============

  /**
   * Submit documents for Tier 1 verification
   */
  async submitTier1Documents(
    userId: string,
    dto: SubmitTier1DocumentsDto,
  ): Promise<{
    message: string;
    documents: VerificationDocument[];
    schoolEmailVerificationSent: boolean;
    submissionAttempt: number;
    remainingAttempts: number;
  }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Must be at least Tier 0 to submit documents
    if (user.verificationTier === VerificationTier.NONE) {
      throw new ForbiddenException(
        'You must verify your phone and email (Tier 0) before submitting verification documents',
      );
    }

    // Check if already Tier 1 or Tier 2
    if (
      user.verificationTier === VerificationTier.TIER_1 ||
      user.verificationTier === VerificationTier.TIER_2
    ) {
      throw new BadRequestException(
        'You are already verified. No need to submit documents again.',
      );
    }

    // Check submission attempts
    if (user.tier1RejectionCount >= MAX_SUBMISSION_ATTEMPTS) {
      throw new BadRequestException(
        `Maximum submission attempts reached (${MAX_SUBMISSION_ATTEMPTS}). Please contact support.`,
      );
    }

    const currentAttempt = user.tier1RejectionCount + 1;

    // Delete any existing pending documents for this user
    await this.documentRepo.delete({
      userId,
      status: DocumentStatus.PENDING,
    });

    // Create new document records
    const documents: VerificationDocument[] = [];

    const docData = [
      { type: DocumentType.STUDENT_ID_FRONT, url: dto.studentIdFrontUrl },
      { type: DocumentType.STUDENT_ID_BACK, url: dto.studentIdBackUrl },
      { type: DocumentType.SCHOOL_FEES_RECEIPT, url: dto.schoolFeesReceiptUrl },
    ];

    for (const doc of docData) {
      const document = this.documentRepo.create({
        userId,
        type: doc.type,
        documentUrl: doc.url,
        status: DocumentStatus.PENDING,
        submissionAttempt: currentAttempt,
      });
      documents.push(await this.documentRepo.save(document));
    }

    // Handle school email if provided
    let schoolEmailVerificationSent = false;
    if (dto.schoolEmail) {
      user.schoolEmail = dto.schoolEmail;

      // Send verification email
      await this.emailService.sendVerificationEmail(
        userId,
        dto.schoolEmail,
        EmailVerificationType.SCHOOL,
      );
      schoolEmailVerificationSent = true;

      // Set status to pending school email verification
      user.tier1ReviewStatus = Tier1ReviewStatus.PENDING_SCHOOL_EMAIL;
    } else {
      // No school email, ready for admin review
      user.tier1ReviewStatus = Tier1ReviewStatus.PENDING_REVIEW;
    }

    await this.userRepo.save(user);

    return {
      message: schoolEmailVerificationSent
        ? 'Documents submitted. A verification email has been sent to your school email address. Please verify your school email, then your documents will be reviewed.'
        : 'Documents submitted for review. You will be notified once reviewed.',
      documents,
      schoolEmailVerificationSent,
      submissionAttempt: currentAttempt,
      remainingAttempts: MAX_SUBMISSION_ATTEMPTS - currentAttempt,
    };
  }

  /**
   * Get Tier 1 verification status
   */
  async getTier1Status(userId: string): Promise<{
    status: Tier1ReviewStatus;
    verificationTier: VerificationTier;
    documents: VerificationDocument[];
    schoolEmail: string | null;
    schoolEmailVerified: boolean;
    submissionAttempt: number;
    remainingAttempts: number;
    rejectionReason: string | null;
  }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const documents = await this.documentRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    return {
      status: user.tier1ReviewStatus,
      verificationTier: user.verificationTier,
      documents,
      schoolEmail: user.schoolEmail,
      schoolEmailVerified: user.schoolEmailVerified,
      submissionAttempt: user.tier1RejectionCount + 1,
      remainingAttempts: Math.max(
        0,
        MAX_SUBMISSION_ATTEMPTS - user.tier1RejectionCount,
      ),
      rejectionReason: user.tier1RejectionReason,
    };
  }

  /**
   * Resend school email verification
   */
  async resendSchoolEmailVerification(userId: string): Promise<{
    sent: boolean;
    message: string;
    remainingAttempts?: number;
  }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.schoolEmail) {
      throw new BadRequestException('No school email on file');
    }

    if (user.schoolEmailVerified) {
      return {
        sent: false,
        message: 'School email is already verified',
      };
    }

    const result = await this.emailService.resendVerificationEmail(
      userId,
      EmailVerificationType.SCHOOL,
    );

    return {
      sent: result.sent,
      message: result.message,
      remainingAttempts: result.remainingAttempts,
    };
  }

  // ============ Admin Methods ============

  /**
   * Get pending Tier 1 verifications for admin review
   */
  async getPendingVerifications(
    page = 1,
    limit = 20,
  ): Promise<{
    users: Array<Partial<User> & { documents: VerificationDocument[] }>;
    total: number;
  }> {
    // Only show users where:
    // - tier1ReviewStatus = PENDING_REVIEW (no school email provided)
    // - OR tier1ReviewStatus = PENDING_SCHOOL_EMAIL AND schoolEmailVerified = true
    const query = this.userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.university', 'university')
      .leftJoinAndSelect('user.faculty', 'faculty')
      .leftJoinAndSelect('user.department', 'department')
      .where('user.tier1ReviewStatus = :pendingReview', {
        pendingReview: Tier1ReviewStatus.PENDING_REVIEW,
      })
      .orWhere(
        'user.tier1ReviewStatus = :pendingSchoolEmail AND user.schoolEmailVerified = true',
        { pendingSchoolEmail: Tier1ReviewStatus.PENDING_SCHOOL_EMAIL },
      )
      .orderBy('user.createdAt', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    const [users, total] = await query.getManyAndCount();

    // Fetch documents for each user
    const usersWithDocs = await Promise.all(
      users.map(async (user) => {
        const documents = await this.documentRepo.find({
          where: { userId: user.id, status: DocumentStatus.PENDING },
          order: { type: 'ASC' },
        });
        return { ...user, documents };
      }),
    );

    return { users: usersWithDocs, total };
  }

  /**
   * Get verification details for admin
   */
  async getVerificationDetails(userId: string): Promise<{
    user: User;
    documents: VerificationDocument[];
    schoolEmailStatus: {
      email: string | null;
      verified: boolean;
    };
  }> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['university', 'faculty', 'department'],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const documents = await this.documentRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    return {
      user,
      documents,
      schoolEmailStatus: {
        email: user.schoolEmail,
        verified: user.schoolEmailVerified,
      },
    };
  }

  /**
   * Approve Tier 1 verification (Admin)
   */
  async approveVerification(userId: string, adminId: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Validate review status
    if (
      user.tier1ReviewStatus !== Tier1ReviewStatus.PENDING_REVIEW &&
      user.tier1ReviewStatus !== Tier1ReviewStatus.PENDING_SCHOOL_EMAIL
    ) {
      throw new BadRequestException(
        'User is not pending review. Current status: ' + user.tier1ReviewStatus,
      );
    }

    // If school email was provided, it must be verified
    if (user.schoolEmail && !user.schoolEmailVerified) {
      throw new BadRequestException(
        'School email must be verified before approval. User has not verified their school email.',
      );
    }

    // Update all pending documents to approved
    await this.documentRepo.update(
      { userId, status: DocumentStatus.PENDING },
      {
        status: DocumentStatus.APPROVED,
        reviewedAt: new Date(),
        reviewedBy: adminId,
      },
    );

    // Update user
    user.verificationTier = VerificationTier.TIER_1;
    user.tier1ReviewStatus = Tier1ReviewStatus.APPROVED;
    user.tier1ApprovedAt = new Date();
    user.tier1ApprovedBy = adminId;
    user.tier1RejectionReason = null;

    await this.userRepo.save(user);

    return user;
  }

  /**
   * Reject Tier 1 verification (Admin)
   */
  async rejectVerification(
    userId: string,
    adminId: string,
    reason: string,
  ): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (
      user.tier1ReviewStatus !== Tier1ReviewStatus.PENDING_REVIEW &&
      user.tier1ReviewStatus !== Tier1ReviewStatus.PENDING_SCHOOL_EMAIL
    ) {
      throw new BadRequestException(
        'User is not pending review. Current status: ' + user.tier1ReviewStatus,
      );
    }

    // Update all pending documents to rejected
    await this.documentRepo.update(
      { userId, status: DocumentStatus.PENDING },
      {
        status: DocumentStatus.REJECTED,
        rejectionReason: reason,
        reviewedAt: new Date(),
        reviewedBy: adminId,
      },
    );

    // Update user
    user.tier1ReviewStatus = Tier1ReviewStatus.REJECTED;
    user.tier1RejectionCount += 1;
    user.tier1RejectionReason = reason;

    await this.userRepo.save(user);

    return user;
  }

  // ============ Legacy Methods (for backwards compatibility) ============

  /**
   * @deprecated Use submitTier1Documents instead
   */
  async uploadDocument(
    userId: string,
    dto: UploadDocumentDto,
  ): Promise<VerificationDocument> {
    const user = await this.userRepo.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if document of this type already exists
    const existingDocument = await this.documentRepo.findOne({
      where: { userId, type: dto.type },
    });

    if (existingDocument) {
      existingDocument.documentUrl = dto.documentUrl;
      existingDocument.status = DocumentStatus.PENDING;
      existingDocument.rejectionReason = null;
      existingDocument.reviewedAt = null;
      existingDocument.reviewedBy = null;
      existingDocument.metadata = dto.metadata || null;

      return this.documentRepo.save(existingDocument);
    }

    const document = this.documentRepo.create({
      userId,
      type: dto.type,
      documentUrl: dto.documentUrl,
      status: DocumentStatus.PENDING,
      metadata: dto.metadata,
    });

    return this.documentRepo.save(document);
  }

  /**
   * Get all documents for a user
   */
  async getUserDocuments(userId: string): Promise<VerificationDocument[]> {
    return this.documentRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * @deprecated Use getTier1Status instead
   */
  async getVerificationStatus(userId: string): Promise<{
    status: Tier1ReviewStatus;
    verificationTier: VerificationTier;
    documents: VerificationDocument[];
    requiredDocuments: DocumentType[];
    missingDocuments: DocumentType[];
  }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const documents = await this.documentRepo.find({
      where: { userId },
    });

    const requiredDocuments = [
      DocumentType.STUDENT_ID_FRONT,
      DocumentType.STUDENT_ID_BACK,
      DocumentType.SCHOOL_FEES_RECEIPT,
    ];

    const uploadedTypes = documents.map((d) => d.type);
    const missingDocuments = requiredDocuments.filter(
      (type) => !uploadedTypes.includes(type),
    );

    return {
      status: user.tier1ReviewStatus,
      verificationTier: user.verificationTier,
      documents,
      requiredDocuments,
      missingDocuments,
    };
  }
}

import {
  Injectable,
  BadRequestException,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository, In } from 'typeorm';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import { PendingUpload } from '../../database/entities/pending-upload.entity';

export enum UploadFolder {
  LISTINGS = 'listings',
  PROFILES = 'profiles',
  VERIFICATION = 'verification',
  CHAT = 'chat',
}

export interface UploadResult {
  url: string;
  publicId: string;
  provider: 'S3' | 'CLOUDINARY';
  originalName: string;
  mimeType: string;
  size: number;
}

interface FileUploadOptions {
  folder: UploadFolder;
  maxSizeBytes?: number;
  allowedMimeTypes?: string[];
}

export interface PresignedUrlResult {
  uploadUrl: string;
  fileUrl: string;
}

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  private s3Client: S3Client | null = null;
  private r2Client: S3Client | null = null;
  private cloudinaryConfigured = false;
  private readonly bucketName: string;
  private readonly s3Region: string;
  private readonly r2BucketName: string;
  private readonly r2PublicUrl: string;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(PendingUpload)
    private readonly pendingUploadRepository: Repository<PendingUpload>,
  ) {
    this.bucketName = this.configService.get<string>('AWS_S3_BUCKET') || '';
    this.s3Region = this.configService.get<string>('AWS_REGION') || 'us-east-1';
    this.r2BucketName = this.configService.get<string>('R2_BUCKET_NAME') || '';
    this.r2PublicUrl = this.configService.get<string>('R2_PUBLIC_URL') || '';

    // Initialize S3 if credentials are available
    const awsAccessKey = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const awsSecretKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');

    if (awsAccessKey && awsSecretKey && this.bucketName) {
      this.s3Client = new S3Client({
        region: this.s3Region,
        credentials: {
          accessKeyId: awsAccessKey,
          secretAccessKey: awsSecretKey,
        },
      });
      this.logger.log('S3 client initialized');
    } else {
      this.logger.warn('S3 credentials not configured');
    }

    // Initialize R2 if credentials are available
    const r2AccountId = this.configService.get<string>('R2_ACCOUNT_ID');
    const r2AccessKey = this.configService.get<string>('R2_ACCESS_KEY_ID');
    const r2SecretKey = this.configService.get<string>('R2_SECRET_ACCESS_KEY');

    if (r2AccountId && r2AccessKey && r2SecretKey && this.r2BucketName) {
      this.r2Client = new S3Client({
        region: 'auto',
        endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: r2AccessKey,
          secretAccessKey: r2SecretKey,
        },
      });
      this.logger.log('R2 client initialized');
    } else {
      this.logger.warn('R2 credentials not configured');
    }

    // Initialize Cloudinary if credentials are available
    const cloudinaryName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const cloudinaryApiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
    const cloudinaryApiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');

    if (cloudinaryName && cloudinaryApiKey && cloudinaryApiSecret) {
      cloudinary.config({
        cloud_name: cloudinaryName,
        api_key: cloudinaryApiKey,
        api_secret: cloudinaryApiSecret,
      });
      this.cloudinaryConfigured = true;
      this.logger.log('Cloudinary configured');
    } else {
      this.logger.warn('Cloudinary credentials not configured');
    }
  }

  async uploadFile(
    file: Express.Multer.File,
    options: FileUploadOptions,
  ): Promise<UploadResult> {
    // Validate file
    this.validateFile(file, options);

    // Generate unique filename
    const ext = path.extname(file.originalname);
    const uniqueId = uuidv4();
    const fileName = `${options.folder}/${uniqueId}${ext}`;

    // Try S3 first
    if (this.s3Client) {
      try {
        return await this.uploadToS3(file, fileName, options);
      } catch (error) {
        this.logger.error('S3 upload failed, falling back to Cloudinary', error);
      }
    }

    // Fallback to Cloudinary
    if (this.cloudinaryConfigured) {
      try {
        return await this.uploadToCloudinary(file, options);
      } catch (error) {
        this.logger.error('Cloudinary upload failed', error);
        throw new InternalServerErrorException('Failed to upload file');
      }
    }

    throw new InternalServerErrorException(
      'No file storage provider configured',
    );
  }

  async uploadMultipleFiles(
    files: Express.Multer.File[],
    options: FileUploadOptions,
  ): Promise<UploadResult[]> {
    const uploadPromises = files.map((file) => this.uploadFile(file, options));
    return Promise.all(uploadPromises);
  }

  async deleteFile(publicId: string, provider: 'S3' | 'CLOUDINARY'): Promise<void> {
    if (provider === 'S3' && this.s3Client) {
      try {
        await this.s3Client.send(
          new DeleteObjectCommand({
            Bucket: this.bucketName,
            Key: publicId,
          }),
        );
        this.logger.log(`Deleted file from S3: ${publicId}`);
      } catch (error) {
        this.logger.error('Failed to delete file from S3', error);
        throw new InternalServerErrorException('Failed to delete file');
      }
    } else if (provider === 'CLOUDINARY' && this.cloudinaryConfigured) {
      try {
        await cloudinary.uploader.destroy(publicId);
        this.logger.log(`Deleted file from Cloudinary: ${publicId}`);
      } catch (error) {
        this.logger.error('Failed to delete file from Cloudinary', error);
        throw new InternalServerErrorException('Failed to delete file');
      }
    }
  }

  async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    if (!this.s3Client) {
      throw new InternalServerErrorException('S3 not configured');
    }

    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    return getSignedUrl(this.s3Client, command, { expiresIn });
  }

  private validateFile(
    file: Express.Multer.File,
    options: FileUploadOptions,
  ): void {
    const maxSize = options.maxSizeBytes || 5 * 1024 * 1024; // 5MB default
    const allowedTypes = options.allowedMimeTypes || [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
    ];

    if (file.size > maxSize) {
      throw new BadRequestException(
        `File too large. Maximum size is ${maxSize / (1024 * 1024)}MB`,
      );
    }

    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type. Allowed types: ${allowedTypes.join(', ')}`,
      );
    }
  }

  private async uploadToS3(
    file: Express.Multer.File,
    key: string,
    options: FileUploadOptions,
  ): Promise<UploadResult> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      Metadata: {
        originalName: file.originalname,
      },
    });

    await this.s3Client!.send(command);

    const url = `https://${this.bucketName}.s3.${this.s3Region}.amazonaws.com/${key}`;

    this.logger.log(`File uploaded to S3: ${key}`);

    return {
      url,
      publicId: key,
      provider: 'S3',
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
    };
  }

  private async uploadToCloudinary(
    file: Express.Multer.File,
    options: FileUploadOptions,
  ): Promise<UploadResult> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: `campus_hub/${options.folder}`,
          resource_type: 'auto',
        },
        (error, result: UploadApiResponse | undefined) => {
          if (error) {
            reject(error);
            return;
          }

          if (!result) {
            reject(new Error('Upload failed - no result'));
            return;
          }

          this.logger.log(`File uploaded to Cloudinary: ${result.public_id}`);

          resolve({
            url: result.secure_url,
            publicId: result.public_id,
            provider: 'CLOUDINARY',
            originalName: file.originalname,
            mimeType: file.mimetype,
            size: file.size,
          });
        },
      );

      uploadStream.end(file.buffer);
    });
  }

  // R2 Presigned URL Operations

  async generatePresignedUrls(
    userId: string,
    files: Array<{ contentType: string; filename: string }>,
  ): Promise<PresignedUrlResult[]> {
    if (!this.r2Client) {
      throw new InternalServerErrorException('R2 storage not configured');
    }

    const results = await Promise.all(
      files.map(async ({ contentType, filename }) => {
        const sanitizedFilename = this.sanitizeFilename(filename);
        const objectKey = `listings/${userId}/${uuidv4()}-${sanitizedFilename}`;

        const command = new PutObjectCommand({
          Bucket: this.r2BucketName,
          Key: objectKey,
          ContentType: contentType,
        });

        const uploadUrl = await getSignedUrl(this.r2Client!, command, {
          expiresIn: 300,
        });

        const fileUrl = `${this.r2PublicUrl}/${objectKey}`;

        return { uploadUrl, fileUrl, objectKey };
      }),
    );

    // Track pending uploads for cleanup
    const pendingUploads = results.map(({ objectKey }) =>
      this.pendingUploadRepository.create({
        userId,
        objectKey,
      }),
    );
    await this.pendingUploadRepository.save(pendingUploads);

    return results.map(({ uploadUrl, fileUrl }) => ({ uploadUrl, fileUrl }));
  }

  async claimUploadedFiles(fileUrls: string[]): Promise<void> {
    if (!this.r2PublicUrl || fileUrls.length === 0) return;

    const objectKeys = fileUrls
      .filter((url) => url.startsWith(this.r2PublicUrl))
      .map((url) => url.replace(`${this.r2PublicUrl}/`, ''));

    if (objectKeys.length === 0) return;

    await this.pendingUploadRepository.delete({ objectKey: In(objectKeys) });
  }

  async cleanupOrphanedUploads(olderThanHours: number = 24): Promise<number> {
    if (!this.r2Client) return 0;

    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - olderThanHours);

    const orphanedUploads = await this.pendingUploadRepository.find({
      where: { createdAt: LessThan(cutoff) },
    });

    if (orphanedUploads.length === 0) return 0;

    // Delete objects from R2 in batches of 1000 (S3 DeleteObjects limit)
    const batchSize = 1000;
    for (let i = 0; i < orphanedUploads.length; i += batchSize) {
      const batch = orphanedUploads.slice(i, i + batchSize);
      try {
        await this.r2Client.send(
          new DeleteObjectsCommand({
            Bucket: this.r2BucketName,
            Delete: {
              Objects: batch.map((u) => ({ Key: u.objectKey })),
            },
          }),
        );
      } catch (error) {
        this.logger.error('Failed to delete orphaned R2 objects', error);
      }
    }

    // Remove pending upload records
    const ids = orphanedUploads.map((u) => u.id);
    await this.pendingUploadRepository.delete(ids);

    this.logger.log(`Cleaned up ${orphanedUploads.length} orphaned uploads`);
    return orphanedUploads.length;
  }

  private sanitizeFilename(filename: string): string {
    return filename
      .replace(/[/\\:\0]/g, '_')
      .replace(/\s+/g, '_')
      .slice(0, 100);
  }

  // Utility to check if storage is configured
  isStorageConfigured(): boolean {
    return !!(this.s3Client || this.cloudinaryConfigured);
  }

  getActiveProvider(): string | null {
    if (this.s3Client) return 'S3';
    if (this.cloudinaryConfigured) return 'CLOUDINARY';
    return null;
  }
}

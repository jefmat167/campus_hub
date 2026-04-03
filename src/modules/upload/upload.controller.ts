import {
  Controller,
  Post,
  Delete,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  BadRequestException,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TierGuard } from '../../common/guards/tier.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MinTier } from '../../common/decorators/min-tier.decorator';
import { User, VerificationTier } from '../../database/entities/user.entity';
import { UploadService, UploadFolder } from './upload.service';
import { GeneratePresignedUrlsDto } from './dto/presigned-url.dto';

@ApiTags('Upload')
@Controller('upload')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('presigned-urls')
  @UseGuards(JwtAuthGuard, TierGuard)
  @MinTier(VerificationTier.TIER_0)
  @ApiOperation({
    summary: 'Generate presigned upload URLs for direct R2 upload',
  })
  @ApiBody({ type: GeneratePresignedUrlsDto })
  @ApiResponse({
    status: 201,
    description: 'Presigned URLs generated successfully',
    schema: {
      example: {
        success: true,
        data: [
          {
            uploadUrl:
              'https://account-id.r2.cloudflarestorage.com/bucket/listings/user-id/uuid-photo1.jpg?X-Amz-Signature=...',
            fileUrl:
              'https://pub-xxx.r2.dev/listings/user-id/uuid-photo1.jpg',
            contentType: 'image/jpeg',
          },
        ],
        message: 'Presigned URLs generated successfully',
      },
    },
  })
  async generatePresignedUrls(
    @CurrentUser('id') userId: string,
    @Body() dto: GeneratePresignedUrlsDto,
  ) {
    const results = await this.uploadService.generatePresignedUrls(
      userId,
      dto.files,
    );

    return {
      success: true,
      data: results,
      message: 'Presigned URLs generated successfully',
    };
  }

  @Post('listing-image')
  @UseGuards(JwtAuthGuard, TierGuard)
  @MinTier(VerificationTier.TIER_1)
  @ApiOperation({ summary: 'Upload a single listing image' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Image file (JPEG, PNG, GIF, WEBP). Max 5MB',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Image uploaded successfully',
    schema: {
      example: {
        success: true,
        data: {
          url: 'https://res.cloudinary.com/campus-hub/image/upload/v123/listings/abc.jpg',
          publicId: 'listings/abc',
          provider: 'CLOUDINARY',
        },
        message: 'Image uploaded successfully',
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadListingImage(
    @CurrentUser() user: User,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }), // 5MB
          new FileTypeValidator({ fileType: /^image\/(jpeg|png|gif|webp)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    const result = await this.uploadService.uploadFile(file, {
      folder: UploadFolder.LISTINGS,
      maxSizeBytes: 5 * 1024 * 1024,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    });

    return {
      success: true,
      data: result,
      message: 'Image uploaded successfully',
    };
  }

  @Post('listing-images')
  @UseGuards(JwtAuthGuard, TierGuard)
  @MinTier(VerificationTier.TIER_1)
  @ApiOperation({ summary: 'Upload multiple listing images (max 10)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
          description: 'Image files (JPEG, PNG, GIF, WEBP). Max 5MB each, max 10 files',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Images uploaded successfully',
    schema: {
      example: {
        success: true,
        data: [
          {
            url: 'https://res.cloudinary.com/campus-hub/image/upload/v123/listings/abc.jpg',
            publicId: 'listings/abc',
            provider: 'CLOUDINARY',
          },
        ],
        message: 'Images uploaded successfully',
      },
    },
  })
  @UseInterceptors(FilesInterceptor('files', 10)) // Max 10 files
  async uploadListingImages(
    @CurrentUser() user: User,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files provided');
    }

    if (files.length > 10) {
      throw new BadRequestException('Maximum 10 files allowed');
    }

    // Validate each file
    for (const file of files) {
      if (file.size > 5 * 1024 * 1024) {
        throw new BadRequestException(
          `File ${file.originalname} is too large. Maximum size is 5MB`,
        );
      }
      if (!/^image\/(jpeg|png|gif|webp)$/.test(file.mimetype)) {
        throw new BadRequestException(
          `File ${file.originalname} has invalid type. Allowed: JPEG, PNG, GIF, WEBP`,
        );
      }
    }

    const results = await this.uploadService.uploadMultipleFiles(files, {
      folder: UploadFolder.LISTINGS,
      maxSizeBytes: 5 * 1024 * 1024,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    });

    return {
      success: true,
      data: results,
      message: 'Images uploaded successfully',
    };
  }

  @Post('profile-image')
  @ApiOperation({ summary: 'Upload profile image' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Image file (JPEG, PNG, WEBP). Max 2MB',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Profile image uploaded successfully',
    schema: {
      example: {
        success: true,
        data: {
          url: 'https://res.cloudinary.com/campus-hub/image/upload/v123/profiles/abc.jpg',
          publicId: 'profiles/abc',
          provider: 'CLOUDINARY',
        },
        message: 'Profile image uploaded successfully',
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadProfileImage(
    @CurrentUser() user: User,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 2 * 1024 * 1024 }), // 2MB
          new FileTypeValidator({ fileType: /^image\/(jpeg|png|webp)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    const result = await this.uploadService.uploadFile(file, {
      folder: UploadFolder.PROFILES,
      maxSizeBytes: 2 * 1024 * 1024,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    });

    return {
      success: true,
      data: result,
      message: 'Profile image uploaded successfully',
    };
  }

  @Post('verification-document')
  @ApiOperation({ summary: 'Upload verification document' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Document file (JPEG, PNG, PDF). Max 10MB',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Document uploaded successfully',
    schema: {
      example: {
        success: true,
        data: {
          url: 'https://res.cloudinary.com/campus-hub/image/upload/v123/verification/abc.pdf',
          publicId: 'verification/abc',
          provider: 'CLOUDINARY',
        },
        message: 'Document uploaded successfully',
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadVerificationDocument(
    @CurrentUser() user: User,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }), // 10MB
          new FileTypeValidator({
            fileType: /^(image\/(jpeg|png)|application\/pdf)$/,
          }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    const result = await this.uploadService.uploadFile(file, {
      folder: UploadFolder.VERIFICATION,
      maxSizeBytes: 10 * 1024 * 1024,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'application/pdf'],
    });

    return {
      success: true,
      data: result,
      message: 'Document uploaded successfully',
    };
  }

  @Post('chat-attachment')
  @UseGuards(JwtAuthGuard, TierGuard)
  @MinTier(VerificationTier.TIER_0)
  @ApiOperation({ summary: 'Upload chat attachment' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Image file (JPEG, PNG, GIF, WEBP). Max 5MB',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Attachment uploaded successfully',
    schema: {
      example: {
        success: true,
        data: {
          url: 'https://res.cloudinary.com/campus-hub/image/upload/v123/chat/abc.jpg',
          publicId: 'chat/abc',
          provider: 'CLOUDINARY',
        },
        message: 'Attachment uploaded successfully',
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadChatAttachment(
    @CurrentUser() user: User,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }), // 5MB
          new FileTypeValidator({ fileType: /^image\/(jpeg|png|gif|webp)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    const result = await this.uploadService.uploadFile(file, {
      folder: UploadFolder.CHAT,
      maxSizeBytes: 5 * 1024 * 1024,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    });

    return {
      success: true,
      data: result,
      message: 'Attachment uploaded successfully',
    };
  }

  @Delete()
  @UseGuards(JwtAuthGuard, TierGuard)
  @MinTier(VerificationTier.TIER_0)
  @ApiOperation({ summary: 'Delete an uploaded file' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['publicId', 'provider'],
      properties: {
        publicId: {
          type: 'string',
          example: 'listings/abc123',
          description: 'Public ID of the file to delete',
        },
        provider: {
          type: 'string',
          enum: ['S3', 'CLOUDINARY'],
          example: 'CLOUDINARY',
          description: 'Storage provider',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'File deleted successfully',
    schema: {
      example: {
        success: true,
        message: 'File deleted successfully',
      },
    },
  })
  async deleteFile(
    @Body() body: { publicId: string; provider: 'S3' | 'CLOUDINARY' },
  ) {
    await this.uploadService.deleteFile(body.publicId, body.provider);
    return {
      success: true,
      message: 'File deleted successfully',
    };
  }
}

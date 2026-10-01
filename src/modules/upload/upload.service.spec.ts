import { ForbiddenException } from '@nestjs/common';
import { UploadService } from './upload.service';

/**
 * DELETE /upload ownership. User uploads embed the uploader's id right after
 * the folder; anything else (another user's key, admin article media, legacy
 * keys, path tricks) is not deletable by a user.
 */
const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

function makeService() {
  const configService: any = { get: () => undefined }; // no storage configured
  const svc = new UploadService(configService, {} as any);
  const deleteFile = jest.spyOn(svc, 'deleteFile').mockResolvedValue(undefined);
  return { svc, deleteFile };
}

describe('UploadService.isOwnedBy', () => {
  const { svc } = makeService();

  it.each([
    [`listings/${ME}/abc.jpg`, 'S3'], // multipart + presigned
    [`profiles/${ME}/abc.png`, 'S3'],
    [`campus_hub/chat/${ME}/abc`, 'CLOUDINARY'],
  ] as const)('own key %s (%s) → true', (key, provider) => {
    expect(svc.isOwnedBy(key, provider, ME)).toBe(true);
  });

  it.each([
    [`listings/${OTHER}/abc.jpg`, 'S3'], // someone else's
    ['listings/abc.jpg', 'S3'], // legacy key, no owner segment
    ['articles/abc.jpg', 'S3'], // admin media
    [`listings/${ME}`, 'S3'], // owner segment but no file
    [`listings/${ME}/../${OTHER}/abc.jpg`, 'S3'], // traversal
    [`listings//${ME}/abc.jpg`, 'S3'], // empty segment
    [`other/chat/${ME}/abc`, 'CLOUDINARY'], // wrong root
    [`listings/${ME}/abc.jpg`, 'CLOUDINARY'], // S3-shaped key under Cloudinary
  ] as const)('%s (%s) → false', (key, provider) => {
    expect(svc.isOwnedBy(key, provider, ME)).toBe(false);
  });
});

describe('UploadService.deleteOwnFile', () => {
  it("403s on another user's file and never touches storage", async () => {
    const { svc, deleteFile } = makeService();
    await expect(
      svc.deleteOwnFile(ME, `listings/${OTHER}/abc.jpg`, 'S3'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(deleteFile).not.toHaveBeenCalled();
  });

  it('deletes your own file', async () => {
    const { svc, deleteFile } = makeService();
    await svc.deleteOwnFile(ME, `listings/${ME}/abc.jpg`, 'S3');
    expect(deleteFile).toHaveBeenCalledWith(`listings/${ME}/abc.jpg`, 'S3');
  });
});

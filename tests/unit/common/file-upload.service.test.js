const mockSend = jest.fn();

jest.mock('../../../src/common/config/aws', () => ({
  s3Client: { send: mockSend },
  buckets: { public: 'mock-public-bucket', private: 'mock-private-bucket' },
}));

const { deleteFromS3, replaceFile } = require('../../../src/common/services/file-upload.service');

describe('file-upload.service', () => {
  afterEach(() => jest.clearAllMocks());

  describe('deleteFromS3', () => {
    it('does nothing and returns false when no key is given', async () => {
      const result = await deleteFromS3({ key: undefined, bucket: 'public' });
      expect(result).toBe(false);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('sends a DeleteObjectCommand for the resolved bucket name and returns true on success', async () => {
      mockSend.mockResolvedValueOnce({});
      const result = await deleteFromS3({ key: 'blog-covers/123-photo.png', bucket: 'public' });

      expect(result).toBe(true);
      expect(mockSend).toHaveBeenCalledTimes(1);
      const command = mockSend.mock.calls[0][0];
      expect(command.input).toEqual({ Bucket: 'mock-public-bucket', Key: 'blog-covers/123-photo.png' });
    });

    it('accepts a literal bucket name in addition to the public/private shorthand', async () => {
      mockSend.mockResolvedValueOnce({});
      await deleteFromS3({ key: 'k', bucket: 'some-other-real-bucket' });

      const command = mockSend.mock.calls[0][0];
      expect(command.input.Bucket).toBe('some-other-real-bucket');
    });

    it('swallows S3 errors and returns false instead of throwing', async () => {
      mockSend.mockRejectedValueOnce(new Error('AccessDenied'));
      await expect(deleteFromS3({ key: 'k', bucket: 'public' })).resolves.toBe(false);
    });
  });

  describe('replaceFile', () => {
    it('deletes the old key and returns the new { url, key } pair', async () => {
      mockSend.mockResolvedValueOnce({});
      const result = await replaceFile({
        oldKey: 'blog-covers/old.png',
        file: { location: 'https://cdn.example.com/blog-covers/new.png', key: 'blog-covers/new.png' },
        bucket: 'public',
      });

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend.mock.calls[0][0].input.Key).toBe('blog-covers/old.png');
      expect(result).toEqual({ url: 'https://cdn.example.com/blog-covers/new.png', key: 'blog-covers/new.png' });
    });

    it('skips the delete call when there was no previous file', async () => {
      const result = await replaceFile({
        oldKey: undefined,
        file: { location: 'https://cdn.example.com/blog-covers/first.png', key: 'blog-covers/first.png' },
        bucket: 'public',
      });

      expect(mockSend).not.toHaveBeenCalled();
      expect(result).toEqual({ url: 'https://cdn.example.com/blog-covers/first.png', key: 'blog-covers/first.png' });
    });
  });
});

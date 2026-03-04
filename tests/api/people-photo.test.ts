import { describe, it, expect, beforeEach, vi } from 'vitest';

// Use vi.hoisted to create mocks before hoisting
const mocks = vi.hoisted(() => ({
  personFindUnique: vi.fn(),
  personUpdate: vi.fn(),
  processPhoto: vi.fn(),
  ensureUserPhotoDir: vi.fn(),
  deletePersonPhotos: vi.fn(),
  fsWriteFile: vi.fn(),
  fsRename: vi.fn(),
}));

// Mock Prisma
vi.mock('../../lib/prisma', () => ({
  prisma: {
    person: {
      findUnique: mocks.personFindUnique,
      update: mocks.personUpdate,
    },
  },
}));

// Mock auth
vi.mock('../../lib/auth', () => ({
  auth: vi.fn(() =>
    Promise.resolve({
      user: { id: 'user-123', email: 'test@example.com', name: 'Test' },
    })
  ),
}));

// Mock photo-storage
vi.mock('../../lib/photo-storage', () => ({
  processPhoto: mocks.processPhoto,
  ensureUserPhotoDir: mocks.ensureUserPhotoDir,
  deletePersonPhotos: mocks.deletePersonPhotos,
}));

// Mock fs/promises
vi.mock('fs/promises', () => ({
  default: {
    writeFile: mocks.fsWriteFile,
    rename: mocks.fsRename,
  },
}));

// Mock crypto to return deterministic values
vi.mock('crypto', () => ({
  default: {
    randomBytes: () => ({ toString: () => 'abcdef01' }),
  },
}));

// Import after mocking
import { POST, DELETE } from '../../app/api/people/[id]/photo/route';

// JPEG magic bytes for a valid image buffer
const JPEG_HEADER = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]);

function createFormDataRequest(
  personId: string,
  file?: Blob | null,
  method = 'POST'
): { request: Request; context: { params: Promise<{ id: string }> } } {
  const formData = new FormData();
  if (file) {
    formData.append('photo', file);
  }

  const request = new Request(`http://localhost/api/people/${personId}/photo`, {
    method,
    body: formData,
  });

  const context = { params: Promise.resolve({ id: personId }) };
  return { request, context };
}

describe('People Photo API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.processPhoto.mockResolvedValue(Buffer.from('processed-jpeg'));
    mocks.ensureUserPhotoDir.mockResolvedValue('/data/photos/user-123');
    mocks.deletePersonPhotos.mockResolvedValue(undefined);
    mocks.fsWriteFile.mockResolvedValue(undefined);
    mocks.fsRename.mockResolvedValue(undefined);
    mocks.personUpdate.mockResolvedValue({ id: 'person-1', photo: 'person-1.jpg' });
  });

  describe('POST /api/people/[id]/photo', () => {
    it('should upload and process a photo successfully', async () => {
      mocks.personFindUnique.mockResolvedValue({ id: 'person-1' });

      const file = new Blob([JPEG_HEADER], { type: 'image/jpeg' });
      const { request, context } = createFormDataRequest('person-1', file);
      const response = await POST(request, context);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.photo).toBe('person-1.jpg');

      // Should verify person ownership
      expect(mocks.personFindUnique).toHaveBeenCalledWith({
        where: {
          id: 'person-1',
          userId: 'user-123',
          deletedAt: null,
        },
        select: { id: true },
      });

      // Should process the photo
      expect(mocks.processPhoto).toHaveBeenCalled();

      // Should ensure directory exists
      expect(mocks.ensureUserPhotoDir).toHaveBeenCalledWith('user-123');

      // Should delete existing photos before writing
      expect(mocks.deletePersonPhotos).toHaveBeenCalledWith('user-123', 'person-1');

      // Should write atomically (temp file then rename)
      expect(mocks.fsWriteFile).toHaveBeenCalled();
      expect(mocks.fsRename).toHaveBeenCalled();

      // Should update person record
      expect(mocks.personUpdate).toHaveBeenCalledWith({
        where: { id: 'person-1' },
        data: { photo: 'person-1.jpg' },
      });
    });

    it('should return 400 when no photo file is provided', async () => {
      mocks.personFindUnique.mockResolvedValue({ id: 'person-1' });

      const formData = new FormData();
      const request = new Request('http://localhost/api/people/person-1/photo', {
        method: 'POST',
        body: formData,
      });
      const context = { params: Promise.resolve({ id: 'person-1' }) };
      const response = await POST(request, context);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toContain('No photo file provided');
    });

    it('should return 400 when photo exceeds 10MB', async () => {
      mocks.personFindUnique.mockResolvedValue({ id: 'person-1' });

      // Create a blob that reports a size > 10MB
      const largeBuffer = new ArrayBuffer(10 * 1024 * 1024 + 1);
      const file = new Blob([largeBuffer], { type: 'image/jpeg' });
      const { request, context } = createFormDataRequest('person-1', file);
      const response = await POST(request, context);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toContain('10MB');
    });

    it('should return 404 for non-existent person', async () => {
      mocks.personFindUnique.mockResolvedValue(null);

      const file = new Blob([JPEG_HEADER], { type: 'image/jpeg' });
      const { request, context } = createFormDataRequest('non-existent', file);
      const response = await POST(request, context);

      expect(response.status).toBe(404);
    });

    it('should return 400 for unsupported image format', async () => {
      mocks.personFindUnique.mockResolvedValue({ id: 'person-1' });
      mocks.processPhoto.mockRejectedValue(
        new Error('Unsupported image format. Supported: JPEG, PNG, GIF, WebP')
      );

      const file = new Blob([Buffer.from('not-an-image')], { type: 'application/octet-stream' });
      const { request, context } = createFormDataRequest('person-1', file);
      const response = await POST(request, context);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toContain('Unsupported image format');
    });

    it('should return 404 for person owned by different user', async () => {
      // findUnique returns null because userId doesn't match
      mocks.personFindUnique.mockResolvedValue(null);

      const file = new Blob([JPEG_HEADER], { type: 'image/jpeg' });
      const { request, context } = createFormDataRequest('other-user-person', file);
      const response = await POST(request, context);

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/people/[id]/photo', () => {
    it('should delete a photo successfully', async () => {
      mocks.personFindUnique.mockResolvedValue({ id: 'person-1' });
      mocks.personUpdate.mockResolvedValue({ id: 'person-1', photo: null });

      const request = new Request('http://localhost/api/people/person-1/photo', {
        method: 'DELETE',
      });
      const context = { params: Promise.resolve({ id: 'person-1' }) };
      const response = await DELETE(request, context);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);

      // Should verify person ownership
      expect(mocks.personFindUnique).toHaveBeenCalledWith({
        where: {
          id: 'person-1',
          userId: 'user-123',
          deletedAt: null,
        },
        select: { id: true },
      });

      // Should delete photo files
      expect(mocks.deletePersonPhotos).toHaveBeenCalledWith('user-123', 'person-1');

      // Should clear photo field
      expect(mocks.personUpdate).toHaveBeenCalledWith({
        where: { id: 'person-1' },
        data: { photo: null },
      });
    });

    it('should return 404 for non-existent person', async () => {
      mocks.personFindUnique.mockResolvedValue(null);

      const request = new Request('http://localhost/api/people/non-existent/photo', {
        method: 'DELETE',
      });
      const context = { params: Promise.resolve({ id: 'non-existent' }) };
      const response = await DELETE(request, context);

      expect(response.status).toBe(404);
    });

    it('should return 200 even if no photo existed (idempotent)', async () => {
      mocks.personFindUnique.mockResolvedValue({ id: 'person-1' });
      mocks.personUpdate.mockResolvedValue({ id: 'person-1', photo: null });

      const request = new Request('http://localhost/api/people/person-1/photo', {
        method: 'DELETE',
      });
      const context = { params: Promise.resolve({ id: 'person-1' }) };
      const response = await DELETE(request, context);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
    });

    it('should return 404 for person owned by different user', async () => {
      mocks.personFindUnique.mockResolvedValue(null);

      const request = new Request('http://localhost/api/people/other-user-person/photo', {
        method: 'DELETE',
      });
      const context = { params: Promise.resolve({ id: 'other-user-person' }) };
      const response = await DELETE(request, context);

      expect(response.status).toBe(404);
    });
  });
});

import { prisma } from '@/lib/prisma';
import { apiResponse, handleApiError, withAuth } from '@/lib/api-utils';
import { processPhoto, ensureUserPhotoDir, deletePersonPhotos } from '@/lib/photo-storage';
import { createModuleLogger } from '@/lib/logger';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

const log = createModuleLogger('people-photo');

const MAX_UPLOAD_SIZE = 10 * 1024 * 1024; // 10MB

// POST /api/people/[id]/photo - Upload a person's photo
export const POST = withAuth(async (request, session, context) => {
  try {
    const { id } = await context.params;

    // Parse multipart form data
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return apiResponse.error('Invalid form data');
    }

    const file = formData.get('photo');
    if (!file || typeof file === 'string') {
      return apiResponse.error('No photo file provided');
    }

    // Check file size before reading full buffer
    if (file.size > MAX_UPLOAD_SIZE) {
      return apiResponse.error('Photo exceeds maximum size of 10MB');
    }

    // Verify person exists and is owned by user
    const person = await prisma.person.findUnique({
      where: {
        id,
        userId: session.user.id,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!person) {
      return apiResponse.notFound('Person not found');
    }

    // Read file into buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Process: validate format, resize, convert to JPEG
    let processed: Buffer;
    try {
      processed = await processPhoto(buffer);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to process photo';
      return apiResponse.error(message);
    }

    // Ensure directory exists
    const dirPath = await ensureUserPhotoDir(session.user.id);

    // Delete any existing photo for this person
    await deletePersonPhotos(session.user.id, id);

    const filename = `${id}.jpg`;
    const filePath = path.join(dirPath, filename);

    // Write atomically: temp file + rename
    const tmpPath = path.join(os.tmpdir(), `nametag-photo-${crypto.randomBytes(8).toString('hex')}`);
    await fs.writeFile(tmpPath, processed);
    await fs.rename(tmpPath, filePath);

    // Update person record
    await prisma.person.update({
      where: { id },
      data: { photo: filename },
    });

    log.info({ personId: id, filename }, 'Photo uploaded');

    return apiResponse.ok({ photo: filename });
  } catch (error) {
    return handleApiError(error, 'POST /api/people/[id]/photo');
  }
});

// DELETE /api/people/[id]/photo - Delete a person's photo
export const DELETE = withAuth(async (_request, session, context) => {
  try {
    const { id } = await context.params;

    // Verify person exists and is owned by user
    const person = await prisma.person.findUnique({
      where: {
        id,
        userId: session.user.id,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!person) {
      return apiResponse.notFound('Person not found');
    }

    // Delete photo files from disk
    await deletePersonPhotos(session.user.id, id);

    // Clear photo field
    await prisma.person.update({
      where: { id },
      data: { photo: null },
    });

    log.info({ personId: id }, 'Photo deleted');

    return apiResponse.ok({ success: true });
  } catch (error) {
    return handleApiError(error, 'DELETE /api/people/[id]/photo');
  }
});

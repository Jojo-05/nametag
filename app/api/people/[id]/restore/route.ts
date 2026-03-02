import { withDeleted } from '@/lib/prisma';
import { apiResponse, handleApiError, withAuth } from '@/lib/api-utils';

// POST /api/people/[id]/restore - Restore a soft-deleted person
export const POST = withAuth(async (_request, session, context) => {
  const prismaWithDeleted = withDeleted();

  try {
    const { id } = await context.params;

    // Find the soft-deleted person (using raw client to bypass soft-delete filter)
    const person = await prismaWithDeleted.person.findUnique({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!person) {
      return apiResponse.notFound('Person not found');
    }

    if (!person.deletedAt) {
      return apiResponse.error('Person is not deleted');
    }

    // Restore the person by clearing deletedAt
    const restored = await prismaWithDeleted.person.update({
      where: { id },
      data: { deletedAt: null },
    });

    return apiResponse.ok({ person: restored });
  } catch (error) {
    return handleApiError(error, 'people-restore');
  } finally {
    await prismaWithDeleted.$disconnect();
  }
});

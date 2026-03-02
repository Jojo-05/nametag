import { withDeleted } from '@/lib/prisma';
import { apiResponse, handleApiError, withAuth } from '@/lib/api-utils';

// POST /api/people/[id]/important-dates/[dateId]/restore - Restore a soft-deleted important date
export const POST = withAuth(async (_request, session, context) => {
  const prismaWithDeleted = withDeleted();

  try {
    const { id, dateId } = await context.params;

    // Check if person exists and belongs to user
    const person = await prismaWithDeleted.person.findUnique({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!person) {
      return apiResponse.notFound('Person not found');
    }

    // Find the soft-deleted important date (using raw client to bypass soft-delete filter)
    const importantDate = await prismaWithDeleted.importantDate.findUnique({
      where: {
        id: dateId,
        personId: id,
      },
    });

    if (!importantDate) {
      return apiResponse.notFound('Important date not found');
    }

    if (!importantDate.deletedAt) {
      return apiResponse.error('Important date is not deleted');
    }

    // Restore the important date by clearing deletedAt
    const restored = await prismaWithDeleted.importantDate.update({
      where: { id: dateId },
      data: { deletedAt: null },
    });

    return apiResponse.ok({ importantDate: restored });
  } catch (error) {
    return handleApiError(error, 'important-date-restore');
  } finally {
    await prismaWithDeleted.$disconnect();
  }
});

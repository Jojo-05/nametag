import { prisma } from '@/lib/prisma';
import { updateNameOrderSchema, validateRequest } from '@/lib/validations';
import { apiResponse, handleApiError, parseRequestBody, withAuth } from '@/lib/api-utils';

export const PUT = withAuth(async (request, session) => {
  try {
    const body = await parseRequestBody(request);
    const validation = validateRequest(updateNameOrderSchema, body);

    if (!validation.success) {
      return validation.response;
    }

    const { nameOrder } = validation.data;

    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: { nameOrder },
    });

    return apiResponse.ok({ user });
  } catch (error) {
    return handleApiError(error, 'user-name-order-update');
  }
});

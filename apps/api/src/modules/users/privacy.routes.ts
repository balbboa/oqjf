import type { FastifyInstance } from 'fastify';
import { prisma } from '../../core/db/prisma.js';
import { logger } from '../../core/logger/logger.js';

export async function privacyRoutes(app: FastifyInstance): Promise<void> {
  /**
   * DELETE /privacy/:whatsappId
   * LGPD Art. 18 — right to erasure.
   * Deletes all user data in dependency order (FK constraints).
   */
  app.delete<{ Params: { whatsappId: string } }>(
    '/privacy/:whatsappId',
    async (req, reply) => {
      const { whatsappId } = req.params;

      const user = await prisma.user.findUnique({ where: { whatsappId } });
      if (!user) return reply.status(404).send({ error: 'User not found' });

      await prisma.$transaction([
        prisma.safetyEvent.deleteMany({ where: { userId: user.id } }),
        prisma.memory.deleteMany({ where: { userId: user.id } }),
        prisma.message.deleteMany({ where: { userId: user.id } }),
        prisma.subscription.deleteMany({ where: { userId: user.id } }),
        prisma.user.delete({ where: { id: user.id } }),
      ]);

      logger.info({ userId: user.id }, 'LGPD data deletion completed');
      return reply.status(204).send();
    },
  );

  /**
   * GET /privacy/:whatsappId/export
   * LGPD Art. 18 — right to data portability.
   * Message content is intentionally excluded (consistent with LGPD data
   * minimization principle and the existing log-redaction policy).
   */
  app.get<{ Params: { whatsappId: string } }>(
    '/privacy/:whatsappId/export',
    async (req, reply) => {
      const { whatsappId } = req.params;

      const user = await prisma.user.findUnique({
        where: { whatsappId },
        select: {
          id: true,
          whatsappName: true,
          displayName: true,
          email: true,
          createdAt: true,
          consentVersion: true,
          consentTimestamp: true,
          freeMessagesUsed: true,
          isPremium: true,
          premiumSince: true,
          onboardingCompleted: true,
          memories: {
            select: { key: true, value: true, updatedAt: true },
          },
          messages: {
            // content intentionally excluded (LGPD minimization + consistent with log redaction)
            select: { role: true, createdAt: true, modelUsed: true },
          },
          safetyEvents: {
            // trigger intentionally excluded
            select: { type: true, action: true, createdAt: true },
          },
        },
      });

      if (!user) return reply.status(404).send({ error: 'User not found' });

      return reply.send({
        exportedAt: new Date().toISOString(),
        data: user,
      });
    },
  );
}

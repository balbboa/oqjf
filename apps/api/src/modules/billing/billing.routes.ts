import type { FastifyInstance } from 'fastify';
import { createCheckoutSession, handleStripeWebhook } from './billing.service.js';

export async function billingRoutes(app: FastifyInstance): Promise<void> {
  // Redirect to Stripe Checkout
  app.get<{ Querystring: { userId: string } }>('/billing/checkout', async (req, reply) => {
    const { userId } = req.query;
    if (!userId) return reply.status(400).send('Missing userId');

    try {
      const url = await createCheckoutSession(userId);
      return reply.redirect(url);
    } catch (err) {
      app.log.error(err, 'Failed to create checkout session');
      return reply.status(500).send('Failed to create checkout session');
    }
  });

  // Stripe webhook — rawBody required for signature verification
  app.post('/webhook/stripe', async (req, reply) => {
    const signature = req.headers['stripe-signature'] as string;
    if (!signature) return reply.status(400).send('Missing stripe-signature');

    const rawBody = (req as unknown as { rawBody?: string }).rawBody ?? JSON.stringify(req.body);

    try {
      await handleStripeWebhook(rawBody, signature);
      return reply.send({ received: true });
    } catch (err) {
      app.log.error(err, 'Stripe webhook error');
      return reply.status(400).send('Webhook Error');
    }
  });
}

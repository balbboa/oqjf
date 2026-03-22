import Stripe from 'stripe';
import { prisma } from '../../core/db/prisma.js';
import { env } from '../../core/config/env.js';
import { sendText } from '../whatsapp/sender.service.js';
import { logger } from '../../core/logger/logger.js';

const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2024-11-20.acacia' });

export async function createCheckoutSession(userId: string): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  // Criar ou recuperar customer Stripe
  let customerId = user.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      metadata: { userId, whatsappId: user.whatsappId },
    });
    customerId = customer.id;
    await prisma.user.update({
      where: { id: userId },
      data: { stripeCustomerId: customerId },
    });
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: env.STRIPE_PRICE_ID, quantity: 1 }],
    success_url: env.CHECKOUT_SUCCESS_URL,
    cancel_url: env.CHECKOUT_CANCEL_URL,
    metadata: { userId },
  });

  if (!session.url) throw new Error('Stripe checkout session URL is null');
  return session.url;
}

export async function handleStripeWebhook(
  body: string,
  signature: string,
): Promise<void> {
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    throw new Error(`Stripe webhook signature invalid: ${String(err)}`);
  }

  // Idempotência: checar se evento já foi processado (Redis)
  const { redis } = await import('../../core/cache/redis.js');
  const eventKey = `stripe:${event.id}`;
  const already = await redis.set(eventKey, '1', 'EX', 86400, 'NX');
  if (!already) {
    logger.info({ eventId: event.id }, 'Stripe event already processed, skipping');
    return;
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.['userId'];
      if (!userId || !session.subscription) break;

      const sub = await stripe.subscriptions.retrieve(session.subscription as string);
      await prisma.subscription.upsert({
        where: { stripeSubscriptionId: sub.id },
        create: {
          userId,
          stripeSubscriptionId: sub.id,
          stripePriceId: env.STRIPE_PRICE_ID,
          status: 'ACTIVE',
          currentPeriodStart: new Date(sub.current_period_start * 1000),
          currentPeriodEnd: new Date(sub.current_period_end * 1000),
        },
        update: { status: 'ACTIVE' },
      });
      await prisma.user.update({
        where: { id: userId },
        data: { isPremium: true, premiumSince: new Date() },
      });

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (user) {
        await sendText(
          user.whatsappId,
          'Que alegria continuar esta jornada com você. 🕊️\n' +
          '_"Onde dois ou três estiverem reunidos em meu nome, aí estarei."_\n' +
          'Por onde gostaria de continuar?',
        ).catch(() => {});
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      await prisma.subscription.updateMany({
        where: { stripeSubscriptionId: sub.id },
        data: { status: 'CANCELED' },
      });
      const subscription = await prisma.subscription.findUnique({
        where: { stripeSubscriptionId: sub.id },
        include: { user: true },
      });
      if (subscription?.user) {
        await prisma.user.update({
          where: { id: subscription.userId },
          data: { isPremium: false },
        });
        await sendText(
          subscription.user.whatsappId,
          'Sua jornada conosco foi especial. Se quiser retornar, estarei aqui. 🕊️',
        ).catch(() => {});
      }
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer as string;
      const user = await prisma.user.findFirst({ where: { stripeCustomerId: customerId } });
      if (user) {
        await sendText(
          user.whatsappId,
          'Houve um problema com seu pagamento. Por favor, atualize seu método de pagamento para continuarmos juntos. 🙏',
        ).catch(() => {});
      }
      break;
    }

    default:
      logger.debug({ eventType: event.type }, 'Unhandled Stripe event');
  }
}

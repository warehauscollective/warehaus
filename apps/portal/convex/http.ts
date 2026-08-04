import { httpRouter } from 'convex/server';
import { authComponent, createAuth } from './auth';
import { stripeWebhook } from './billing/stripe';
import { notionWebhook } from './sync/queue';

const http = httpRouter();
authComponent.registerRoutes(http, createAuth);

http.route({
  path: '/notion/webhook',
  method: 'POST',
  handler: notionWebhook,
});

http.route({
  path: '/stripe/webhook',
  method: 'POST',
  handler: stripeWebhook,
});

export default http;

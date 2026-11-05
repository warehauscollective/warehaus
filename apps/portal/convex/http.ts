import { httpRouter } from 'convex/server';
import { authComponent, createAuth } from './auth';
import { stripeWebhook } from './billing/stripe';
import { notionWebhook } from './sync/queue';
import { NOTION_WEBHOOK_PATH } from './sync/sources/notion';

const http = httpRouter();
authComponent.registerRoutes(http, createAuth);

http.route({
  /** NotionTaskSource webhook. Path unchanged: /notion/webhook */
  path: NOTION_WEBHOOK_PATH,
  method: 'POST',
  handler: notionWebhook,
});

http.route({
  path: '/stripe/webhook',
  method: 'POST',
  handler: stripeWebhook,
});

export default http;

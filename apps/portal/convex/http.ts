import { httpRouter } from 'convex/server';
import { authComponent, createAuth } from './auth';
import { stripeWebhook } from './billing/stripe';
import { portalApiHttp } from './portalApi';
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

const portalRoutes: Array<{ path: string; method: 'GET' | 'POST' }> = [
  { path: '/api/v1/tasks', method: 'GET' },
  { path: '/api/v1/tasks', method: 'POST' },
  { path: '/api/v1/tasks/item', method: 'GET' },
  { path: '/api/v1/tasks/update', method: 'POST' },
  { path: '/api/v1/milestones', method: 'GET' },
  { path: '/api/v1/milestones', method: 'POST' },
  { path: '/api/v1/milestones/update', method: 'POST' },
  { path: '/api/v1/comments', method: 'GET' },
  { path: '/api/v1/comments', method: 'POST' },
  { path: '/api/v1/links', method: 'GET' },
  { path: '/api/v1/links', method: 'POST' },
];
for (const route of portalRoutes) {
  http.route({ path: route.path, method: route.method, handler: portalApiHttp });
}

export default http;

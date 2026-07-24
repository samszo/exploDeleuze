import { registerApiRoute } from '@mastra/core/server';
import { env } from '../lib/env';

// Reçoit le webhook Omeka S (api.items.create / api.items.update, cf. Phase 2
// du document de conception) et déclenche le workflow réactif de
// vectorisation + recalcul d'intensité. Un secret partagé (en-tête
// x-webhook-secret) protège l'endpoint dès que OMEKA_WEBHOOK_SECRET est
// configuré ; sans lui l'endpoint reste ouvert (utile en développement local
// uniquement — à configurer avant toute exposition publique).
export const omekaItemUpdatedWebhook = registerApiRoute('/webhooks/omeka/item-updated', {
  method: 'POST',
  requiresAuth: false,
  handler: async (c) => {
    if (env.omekaWebhookSecret) {
      const provided = c.req.header('x-webhook-secret');
      if (provided !== env.omekaWebhookSecret) {
        return c.json({ error: 'Secret de webhook invalide ou manquant' }, 401);
      }
    }

    let body: Record<string, unknown>;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Corps de requête JSON invalide' }, 400);
    }

    const itemId = String(body.itemId ?? body['o:id'] ?? body.id ?? '');
    if (!itemId) {
      return c.json({ error: "Payload du webhook sans itemId (attendu : { itemId } ou { 'o:id': ... })" }, 400);
    }

    const mastra = c.get('mastra');
    const workflow = mastra.getWorkflow('vector-reactive-workflow');
    const run = await workflow.createRun();
    const result = await run.start({ inputData: { itemId } });

    return c.json({ status: 'ok', result });
  },
});

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { omekaClient } from '../lib/omeka-client';

// Outil du Chroniqueur Cognitif : le contexte transmis par l'orchestrateur TS
// ne contient que l'identifiant, le libellé et le score de résonance de
// chaque concept identifié par la marche quantique (étape 6 du diagramme).
// L'agent appelle cet outil pour consulter le texte complet d'un concept
// avant de rédiger sa synthèse.
export const getConceptDetailTool = createTool({
  id: 'get-concept-detail',
  description:
    "Récupère le libellé et le texte complet d'un concept de l'écosystème de connaissance deleuzien depuis Omeka S, à partir de son identifiant.",
  inputSchema: z.object({
    conceptId: z.string().describe("L'identifiant du concept dans Omeka S"),
  }),
  outputSchema: z.object({
    id: z.string(),
    label: z.string(),
    text: z.string(),
  }),
  execute: async ({ conceptId }) => {
    const node = await omekaClient.getItem(conceptId);
    return { id: node.id, label: node.label, text: node.text };
  },
});

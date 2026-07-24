import { mastra } from '../src/mastra/index';

// Exécution manuelle du calcul de la matrice d'adjacence rhizomatique,
// équivalent en ligne de commande de ce que ferait un déclenchement planifié.
// Usage : npx tsx scripts/run-rhizomatic-intensity.ts [windowLabel]
async function main() {
  const windowLabel = process.argv[2] ?? 'default';
  const workflow = mastra.getWorkflow('rhizomatic-intensity-workflow');
  const run = await workflow.createRun();
  const result = await run.start({ inputData: { windowLabel } });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

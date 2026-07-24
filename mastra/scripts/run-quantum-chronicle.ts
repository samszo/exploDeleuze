import { mastra } from '../src/mastra/index';

// Pipeline complet du diagramme d'architecture.
// Usage : npx tsx scripts/run-quantum-chronicle.ts <sourceId> [windowLabel]
async function main() {
  const sourceId = process.argv[2];
  if (!sourceId) throw new Error('Usage: run-quantum-chronicle.ts <sourceId> [windowLabel]');
  const windowLabel = process.argv[3] ?? 'default';

  const workflow = mastra.getWorkflow('quantum-chronicle-workflow');
  const run = await workflow.createRun();
  const result = await run.start({ inputData: { sourceId, windowLabel } });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import { mastra } from '../src/mastra/index';

// Simule le déclenchement du webhook Omeka S pour un item modifié.
// Usage : npx tsx scripts/run-reactive.ts <itemId>
async function main() {
  const itemId = process.argv[2];
  if (!itemId) throw new Error('Usage: run-reactive.ts <itemId>');
  const workflow = mastra.getWorkflow('vector-reactive-workflow');
  const run = await workflow.createRun();
  const result = await run.start({ inputData: { itemId } });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

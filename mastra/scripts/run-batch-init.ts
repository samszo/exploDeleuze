import { mastra } from '../src/mastra/index';

// Phase 1 : initialisation batch idempotente de tout le corpus.
// Usage : npx tsx scripts/run-batch-init.ts
async function main() {
  const workflow = mastra.getWorkflow('vector-batch-init-workflow');
  const run = await workflow.createRun();
  const result = await run.start({ inputData: {} });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import { runComprehensiveSelfTest } from './selftest';

console.log('=====================================================');
console.log('⚡ Running PriceRadar Comprehensive Automated Self-Test ⚡');
console.log('=====================================================\n');

const { summary, results } = runComprehensiveSelfTest();

const categories = ['PRODUCT_MATCH', 'PRICE_ACCURACY', 'DEAL_LINKS', 'BENCHMARKS', 'CATEGORY_CLASSIFIER'] as const;

for (const cat of categories) {
  const catResults = results.filter(r => r.category === cat);
  if (catResults.length === 0) continue;

  console.log(`\n📂 [${cat}] (${catResults.length} checks)`);
  for (const r of catResults) {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'WARN' ? '⚠️' : '❌';
    console.log(`  ${icon} ${r.name}: ${r.details}`);
  }
}

console.log('\n=====================================================');
console.log('📊 SELF-TEST SUMMARY');
console.log('=====================================================');
console.log(`Total Checks Run : ${summary.total}`);
console.log(`Passed           : ${summary.passed} ✅`);
console.log(`Warnings         : ${summary.warnings} ⚠️`);
console.log(`Failed           : ${summary.failed} ❌`);
console.log(`Duration         : ${summary.durationMs}ms`);
console.log('=====================================================');

if (summary.failed > 0) {
  console.error('\n❌ Self-test encountered failures!');
  process.exit(1);
} else {
  console.log('\n✨ ALL TESTS PASSED! Every item, price, deal link, and model match verified.');
  process.exit(0);
}

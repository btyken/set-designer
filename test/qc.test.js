import test from 'node:test';
import assert from 'node:assert/strict';

// qc.js only touches the page inside its render functions, so its helpers load in Node.
const { clipName, sizeText } = await import('../public/shoot-dashboard/qc.js');

test('clip names follow TYPE_SHOOTER_PRODUCT_PART_DATE_VERSION', () => {
  assert.equal(clipName({ shooter: 'maye', product: 'AIOG', part: 'hook', date: new Date(2026, 8, 28), version: 1 }), 'BRS_MAYE_AIOG_HOOK_092826_V1');
  assert.equal(clipName({ shooter: 'Ma. Ana', product: '4EGS', part: 'CTA', date: new Date(2026, 10, 4), version: 3 }), 'BRS_MAANA_4EGS_CTA_110426_V3');
  assert.equal(clipName({ shooter: '', product: 'IG', part: 'BODY', date: new Date(2026, 0, 2), version: 0 }), 'BRS_NAME_IG_BODY_010226_V1');
});

test('sizes read in MB and GB', () => {
  assert.equal(sizeText(12_400_000), '12 MB');
  assert.equal(sizeText(2_300_000_000), '2.3 GB');
});

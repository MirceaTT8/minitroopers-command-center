const path = require('path');
const { execFileSync } = require('child_process');
const { parseAllAccounts } = require('../parsers/htmlParser');
const { computeOptimalAiConfig } = require('../services/strategyEngine');

const scriptsDir = __dirname;
const accounts = parseAllAccounts();

if (accounts.length === 0) {
  console.error('No scraped accounts found in backend/data/raw_html/. Run --scrape-only first.');
  process.exit(1);
}

let updated = 0;
let skipped = 0;
let failed = 0;

for (const acc of accounts) {
  const soldier = acc.firstSoldier;
  if (!soldier || !soldier.configActionUrl) {
    console.log(`[SKIP] ${acc.id}: Missing configActionUrl (pending level-up or missing t0.html)`);
    skipped += 1;
    continue;
  }

  const computed = computeOptimalAiConfig(soldier);
  const { weapon, loc, target, move, ttype } = computed.params;

  console.log(
    `[CONFIG] ${acc.id} (${computed.archetype}) -> Weapon: ${computed.labels.favouriteWeapon} | Target: ${computed.labels.favouriteTarget} | Victim: ${computed.labels.preferredVictim} | Style: ${computed.labels.fightingStyle}`
  );

  try {
    execFileSync(
      'bash',
      [
        './troopers.sh',
        '--update-config',
        computed.configActionUrl,
        String(weapon),
        String(loc),
        String(target),
        String(move),
        String(ttype),
        acc.id
      ],
      { cwd: scriptsDir, stdio: 'inherit', timeout: 60000 }
    );
    updated += 1;
  } catch (err) {
    console.error(`[FAIL] ${acc.id}: ${err.message}`);
    failed += 1;
  }
}

console.log(`\nDone! Updated: ${updated} | Skipped: ${skipped} | Failed: ${failed}`);
if (failed > 0) process.exit(1);
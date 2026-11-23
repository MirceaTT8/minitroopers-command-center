// backend/scripts/autoConfigCli.js
const { execFileSync } = require('child_process');
const { parseAllAccounts } = require('../parsers/htmlParser');
const { computeOptimalAiConfig } = require('../services/strategyEngine');

const scriptsDir = __dirname;
const accounts = parseAllAccounts();

if (accounts.length === 0) {
  console.error(
    'No scraped accounts found in backend/data/raw_html/. Run --scrape-only first.'
  );
  process.exit(1);
}

let updated = 0;
let skipped = 0;
let failed = 0;

for (const acc of accounts) {
  const soldier = acc.firstSoldier;
  if (!soldier || !soldier.configActionUrl) {
    console.log(
      `[SKIP] ${acc.id}: Missing configActionUrl (pending level-up or missing t0.html)`
    );
    skipped += 1;
    continue;
  }

  const computed = computeOptimalAiConfig(soldier);
  const { weapon, loc, target, move, ttype } = computed.params;

  // [ADDED] Normalize and verify the target action URL always points to /t/0
  const actionUrl = computed.configActionUrl.startsWith('/')
    ? computed.configActionUrl
    : `/${computed.configActionUrl}`;

  if (!actionUrl.startsWith('/t/0')) {
    console.log(
      `[SKIP] ${acc.id}: Unexpected configActionUrl "${actionUrl}" (expected /t/0)`
    );
    skipped += 1;
    continue;
  }

  // [ADDED] Log current vs. new Favorite Weapon & Fighting Style for GitHub Actions visibility
  const prevWeapon = soldier.aiConfig?.favouriteWeapon || 'Unknown';
  const prevStyle = soldier.aiConfig?.fightingStyle || 'Unknown';

  console.log(
    `[CONFIG -> ${actionUrl}] ${acc.id} (${computed.archetype}) | Weapon: ${prevWeapon} -> ${computed.labels.favouriteWeapon} | Style: ${prevStyle} -> ${computed.labels.fightingStyle} | Target: ${computed.labels.favouriteTarget} | Victim: ${computed.labels.preferredVictim}`
  );

  try {
    execFileSync(
      'bash',
      [
        './troopers.sh',
        '--update-config',
        actionUrl,
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

console.log(
  `\nDone! Pushed to /t/0 -> Updated: ${updated} | Skipped: ${skipped} | Failed: ${failed}`
);
if (failed > 0) process.exit(1);
#!/usr/bin/env node
/**
 * Headless Auto-Upgrade Script for Mini Troopers Command Center
 * Uses the project's own bash scripts, htmlParser.js, and strategyEngine.js.
 *
 * Usage:
 *   node scripts/autoUpgrade.js --dry-run   (Simulates choices, spends 0 credits)
 *   node scripts/autoUpgrade.js             (Executes upgrades live)
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { parseAllAccounts, parseAccountFolder } = require('../parsers/htmlParser');
const {
  evaluateCollectiveRaidPool,
  recommendBestUpgrade,
} = require('../services/strategyEngine');

const IS_DRY_RUN = process.argv.includes('--dry-run');
const SCRIPTS_DIR = __dirname;

function runBashScript(scriptName, args = []) {
  return execFileSync('bash', [scriptName, ...args], {
    cwd: SCRIPTS_DIR,
    encoding: 'utf8',
    timeout: 1200000,
    maxBuffer: 10 * 1024 * 1024,
  });
}

function main() {
  console.log('====================================================');
  console.log(`Mini Troopers Auto-Upgrade (${IS_DRY_RUN ? 'DRY RUN' : 'LIVE MODE'})`);
  console.log('====================================================\n');

  // 1. Scrape latest account HTML using the same command as POST /api/accounts/sync
  console.log('[1/3] Syncing all accounts via ./run_accounts.sh --scrape-only ...');
  try {
    runBashScript('./run_accounts.sh', ['--scrape-only']);
  } catch (err) {
    console.error('[ERROR] Scrape failed:', err.stderr || err.message);
    process.exit(1);
  }

  // 2. Parse all accounts and evaluate the collective Raid pool
  console.log('[2/3] Parsing HTML and evaluating collective Raid pool...');
  let accounts = parseAllAccounts();
  let collectiveMetrics = evaluateCollectiveRaidPool(accounts);

  console.log(
    `Loaded ${accounts.length} account(s) | Scouts: ${collectiveMetrics.scouts} | Saboteurs: ${collectiveMetrics.saboteurs} | Doctors: ${collectiveMetrics.doctors}\n`
  );

  const summaryLines = [
    `### Auto-Upgrade Report (${IS_DRY_RUN ? 'Dry Run' : 'Live'})`,
    `> **Collective Pool:** ${collectiveMetrics.scouts} Scouts | ${collectiveMetrics.saboteurs} Saboteurs (${collectiveMetrics.globalSabotagePower} disarm pts) | ${collectiveMetrics.doctors} Doctors`,
    '',
    '| Account | Lvl | Credits / Cost | Status | Selected Skill |',
    '| :--- | :---: | :---: | :--- | :--- |',
  ];

  // 3. Process each account
  console.log('[3/3] Checking upgrade eligibility...\n');
 const MAX_UPGRADES_PER_ACCOUNT = 15; // Safety guard against infinite loops

for (let i = 0; i < accounts.length; i++) {
  let currentAcc = accounts[i];
  let upgradesDone = 0;

  while (upgradesDone < MAX_UPGRADES_PER_ACCOUNT) {
    const soldier = currentAcc.firstSoldier;
    const hasPendingChoices =
      Array.isArray(soldier?.availableUpgrades) && soldier.availableUpgrades.length > 0;
    const canAfford =
      soldier && soldier.upgradeCost > 0 && currentAcc.credits >= soldier.upgradeCost;

    if (!canAfford && !hasPendingChoices) {
      if (upgradesDone === 0) {
        console.log(
          `[${currentAcc.id}] Lvl ${soldier?.level ?? 'null'} | ${currentAcc.credits}/${soldier?.upgradeCost ?? 0} -> Not ready.`
        );
      } else {
        console.log(
          `[${currentAcc.id}] Finished continuous upgrades (${upgradesDone} level(s) gained). Now Lvl ${soldier?.level} | ${currentAcc.credits}/${soldier?.upgradeCost}.\n`
        );
      }
      break;
    }

    console.log(
      `[${currentAcc.id}] Lvl ${soldier.level} | ${currentAcc.credits}/${soldier.upgradeCost} -> READY TO UPGRADE! (Pass #${upgradesDone + 1})`
    );

    // 1. Request upgrade choices if not already on the level-up screen
    if (!hasPendingChoices) {
      console.log(`  -> Requesting upgrade choices via ./troopers.sh --request-upgrade ${currentAcc.id} ...`);
      runBashScript('./troopers.sh', ['--request-upgrade', currentAcc.id]);
      currentAcc = parseAccountFolder(currentAcc.id);
    }

    const updatedSoldier = currentAcc?.firstSoldier;
    const choices = updatedSoldier?.availableUpgrades || [];

    if (choices.length === 0) {
      console.log(`  -> [WARN] No upgrade choices found for ${currentAcc.id}. Stopping loop.\n`);
      break;
    }

    console.log(`  -> Rolled: ${choices.map((c) => c.name).join(', ')}`);

    // 2. Pick best skill using Strategy Engine
    const rec = recommendBestUpgrade(updatedSoldier, collectiveMetrics);
    const chosen = choices.find((c) => c.id === rec.recommendedOptionId) || choices[0];

    console.log(`  -> Strategy Engine Pick: ${chosen.name}`);
    for (const reason of rec.reasons || []) {
      console.log(`     • ${reason}`);
    }

    if (IS_DRY_RUN) {
      console.log(`  -> [DRY RUN] Would select "${chosen.name}" (${chosen.selectUrl}). Stopping loop for dry-run.\n`);
      break;
    }

    if (!chosen.selectUrl) {
      console.log(`  -> [WARN] Missing selectUrl for "${chosen.name}". Stopping loop.\n`);
      break;
    }

    // 3. Select the chosen skill (troopers.sh automatically re-saves hq.html & t0.html)
    runBashScript('./troopers.sh', ['--select-upgrade', chosen.selectUrl, currentAcc.id]);
    console.log(`  -> [UPGRADED] Selected "${chosen.name}"!`);

    upgradesDone++;

    // 4. Re-parse the updated account HTML so the next iteration sees the new level, credits & cost
    currentAcc = parseAccountFolder(currentAcc.id);
    accounts[i] = currentAcc;

    // 5. Refresh collective Raid pool metrics so class deficits stay accurate
    collectiveMetrics = evaluateCollectiveRaidPool(accounts);
  }
}
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryLines.join('\n') + '\n');
  }

  console.log('Auto-upgrade run complete.');
}

main();

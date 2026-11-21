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
  for (const acc of accounts) {
    const soldier = acc.firstSoldier;
    if (!soldier) continue;

    const costLabel = `${acc.credits}/${soldier.upgradeCost}`;

    if (!acc.canUpgrade) {
      console.log(`[${acc.id}] Lvl ${soldier.level} | ${costLabel} -> Not ready.`);
      summaryLines.push(`| ${acc.id} | ${soldier.level} | ${costLabel} | Locked | - |`);
      continue;
    }

    console.log(`[${acc.id}] Lvl ${soldier.level} | ${costLabel} -> READY TO UPGRADE!`);

    let currentAcc = acc;
    let currentSoldier = soldier;

    // Step 3a: Unlock / roll upgrade choices if not already requested
    if (!currentSoldier.availableUpgrades || currentSoldier.availableUpgrades.length === 0) {
      if (IS_DRY_RUN) {
        console.log('  -> [DRY RUN] Would run --request-upgrade to roll choices (0 credits spent).\n');
        summaryLines.push(`| ${acc.id} | ${soldier.level} | ${costLabel} | Dry Run (Ready to Roll) | *Pending roll* |`);
        continue;
      }

      console.log(`  -> Requesting upgrade choices via ./troopers.sh --request-upgrade ${acc.id} ...`);
      try {
        runBashScript('./troopers.sh', ['--request-upgrade', acc.id]);
        currentAcc = parseAccountFolder(acc.id);
        currentSoldier = currentAcc?.firstSoldier;
      } catch (err) {
        console.error(`  -> [ERROR] --request-upgrade failed: ${err.stderr || err.message}\n`);
        summaryLines.push(`| ${acc.id} | ${soldier.level} | ${costLabel} | Error (Roll) | ${err.message} |`);
        continue;
      }
    }

    const choices = currentSoldier?.availableUpgrades || [];
    if (choices.length === 0) {
      console.log('  -> [WARN] No upgrade choices found after parsing.\n');
      summaryLines.push(`| ${acc.id} | ${soldier.level} | ${costLabel} | No Choices | - |`);
      continue;
    }

    // Step 3b: Ask strategyEngine.js for the best skill
    const recommendation = recommendBestUpgrade(currentSoldier, collectiveMetrics);
    const chosenOption =
      choices.find((c) => c.id === recommendation.recommendedOptionId) || choices[0];

    console.log(`  -> Rolled: ${choices.map((c) => c.name).join(', ')}`);
    console.log(`  -> Strategy Engine Pick: ${chosenOption.name}`);
    for (const reason of recommendation.reasons || []) {
      console.log(`     • ${reason}`);
    }

    if (!chosenOption.selectUrl) {
      console.log('  -> [WARN] Chosen option has no selectUrl. Skipping.\n');
      summaryLines.push(`| ${acc.id} | ${soldier.level} | ${costLabel} | Missing URL | ${chosenOption.name} |`);
      continue;
    }

    // Step 3c: Select the upgrade (or simulate in dry-run)
    if (IS_DRY_RUN) {
      console.log(`  -> [DRY RUN] Would select "${chosenOption.name}" (${chosenOption.selectUrl})\n`);
      summaryLines.push(`| ${acc.id} | ${soldier.level} | ${costLabel} | Dry Run | **${chosenOption.name}** |`);
    } else {
      try {
        runBashScript('./troopers.sh', ['--select-upgrade', chosenOption.selectUrl, acc.id]);
        console.log(`  -> [UPGRADED] Selected "${chosenOption.name}"!\n`);
        summaryLines.push(`| ${acc.id} | ${soldier.level} | ${costLabel} | Upgraded | **${chosenOption.name}** |`);

        // Refresh collective metrics so subsequent accounts see updated Scout/Doctor/Saboteur counts
        accounts = parseAllAccounts();
        collectiveMetrics = evaluateCollectiveRaidPool(accounts);
      } catch (err) {
        console.error(`  -> [ERROR] --select-upgrade failed: ${err.stderr || err.message}\n`);
        summaryLines.push(`| ${acc.id} | ${soldier.level} | ${costLabel} | Error (Select) | ${err.message} |`);
      }
    }
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryLines.join('\n') + '\n');
  }

  console.log('Auto-upgrade run complete.');
}

main();

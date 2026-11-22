const http = require('http');
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const {
  parseAccountFolder,
  parseAllAccounts,
  getCachedOrParsedAccounts
} = require('./parsers/htmlParser');
const { computeOptimalAiConfig } = require('./services/strategyEngine');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';

app.use(cors());
app.use(express.json());

// Automatically sanitize bash scripts if copy-paste introduced \vert{} or Windows CRLF (\r\n)
function sanitizeBashScripts() {
  const scriptsDir = path.join(__dirname, 'scripts');
  const scriptFiles = ['troopers.sh', 'run_accounts.sh', 'troopers.cfg', 'com.culture', 'fr.culture'];

  for (const fileName of scriptFiles) {
    const filePath = path.join(scriptsDir, fileName);
    if (fs.existsSync(filePath)) {
      const original = fs.readFileSync(filePath, 'utf-8');
      const cleaned = original
        .replace(/\\vert\{\}/g, '|')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n');

      if (cleaned !== original) {
        fs.writeFileSync(filePath, cleaned, 'utf-8');
        console.log(`[Sanitizer] Repaired copy-paste artifacts / line endings in ${fileName}`);
      }
    }
  }
}

sanitizeBashScripts();

function runTroopersConfigUpdate(accountId, computed) {
  return new Promise((resolve, reject) => {
    const scriptsDir = path.join(__dirname, 'scripts');
    const { weapon, loc, target, move, ttype } = computed.params;

    execFile(
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
        accountId
      ],
      { cwd: scriptsDir, timeout: 60000 },
      (error, stdout, stderr) => {
        if (error) {
          return reject(new Error(stderr || error.message));
        }
        resolve(stdout);
      }
    );
  });
}

// GET /api/accounts - Parses raw_html folders and returns all accounts
app.get('/api/accounts', (req, res) => {
  try {
    const accounts = parseAllAccounts();
    res.json(accounts);
  } catch (err) {
    console.error('Error parsing accounts:', err);
    res.status(500).json({
      error: 'Failed to parse account HTML files',
      details: err.message
    });
  }
});

// GET /api/account/:id - Returns a single account by id
app.get('/api/account/:id', (req, res) => {
  try {
    const accounts = getCachedOrParsedAccounts();
    const targetId = req.params.id.toLowerCase();
    const account = accounts.find((acc) => acc.id.toLowerCase() === targetId);

    if (!account) {
      return res.status(404).json({ error: `Account '${req.params.id}' not found` });
    }
    res.json(account);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/accounts/sync - Runs bash scraper (--scrape-only) for all accounts
app.post('/api/accounts/sync', (req, res) => {
  sanitizeBashScripts();
  const scriptsDir = path.join(__dirname, 'scripts');
  const runAccountsScript = path.join(scriptsDir, 'run_accounts.sh');

  const scriptToRun = fs.existsSync(runAccountsScript)
    ? './run_accounts.sh'
    : './troopers.sh';

  execFile(
    'bash',
    [scriptToRun, '--scrape-only'],
    { cwd: scriptsDir, timeout: 120000 },
    (error, stdout, stderr) => {
      if (error) {
        console.error('Sync script error:', stderr || error.message);
        return res.status(500).json({
          error: 'Scrape script execution failed',
          details: stderr || error.message,
          stdout
        });
      }

      try {
        const accounts = parseAllAccounts();
        res.json({
          message: 'Accounts synced and parsed successfully',
          log: stdout,
          accounts
        });
      } catch (parseErr) {
        res.status(500).json({
          error: 'Scraping succeeded, but HTML parsing failed',
          details: parseErr.message
        });
      }
    }
  );
});

// POST /api/accounts/auto-config - Computes & submits optimal AI config for all (or selected) accounts
app.post('/api/accounts/auto-config', async (req, res) => {
  sanitizeBashScripts();
  try {
    const allAccounts = parseAllAccounts();
    const filterIds = Array.isArray(req.body?.accountIds)
      ? new Set(req.body.accountIds.map((id) => String(id).toLowerCase()))
      : null;

    const targets = filterIds
      ? allAccounts.filter((acc) => filterIds.has(acc.id.toLowerCase()))
      : allAccounts;

    const results = [];

    for (const acc of targets) {
      const soldier = acc.firstSoldier;
      if (!soldier || !soldier.configActionUrl) {
        results.push({
          accountId: acc.id,
          status: 'skipped',
          reason: 'Missing configActionUrl (account may have a pending level-up or no t0.html)'
        });
        continue;
      }

      const computed = computeOptimalAiConfig(soldier);
      try {
        await runTroopersConfigUpdate(acc.id, computed);
        results.push({
          accountId: acc.id,
          status: 'updated',
          archetype: computed.archetype,
          applied: computed.labels
        });
      } catch (err) {
        results.push({
          accountId: acc.id,
          status: 'failed',
          error: err.message
        });
      }
    }

    const updatedAccounts = parseAllAccounts();
    res.json({
      message: `Auto-configured ${results.filter((r) => r.status === 'updated').length}/${targets.length} accounts`,
      results,
      accounts: updatedAccounts
    });
  } catch (err) {
    console.error('Auto-config bulk error:', err);
    res.status(500).json({
      error: 'Bulk auto-config failed',
      details: err.message
    });
  }
});

// POST /api/account/:id/auto-config - Computes & submits optimal AI config for a single account
app.post('/api/account/:id/auto-config', async (req, res) => {
  sanitizeBashScripts();
  const accountId = req.params.id.toLowerCase();

  try {
    const account = parseAccountFolder(accountId);
    if (!account || !account.firstSoldier) {
      return res.status(404).json({ error: `Account '${accountId}' not found` });
    }
    if (!account.firstSoldier.configActionUrl) {
      return res.status(400).json({
        error: `Account '${accountId}' has no configActionUrl (pending level-up or missing t0.html)`
      });
    }

    const computed = computeOptimalAiConfig(account.firstSoldier);
    const log = await runTroopersConfigUpdate(accountId, computed);

    parseAllAccounts();
    const updatedAccount = parseAccountFolder(accountId);

    res.json({
      message: `Auto-configured ${accountId} (${computed.archetype})`,
      archetype: computed.archetype,
      applied: computed.labels,
      log,
      account: updatedAccount
    });
  } catch (err) {
    res.status(500).json({
      error: `Auto-config failed for ${accountId}`,
      details: err.message
    });
  }
});

// POST /api/account/:id/request-upgrade - Sends upgrade request on /t/0 and parses upgrade options
app.post('/api/account/:id/request-upgrade', (req, res) => {
  sanitizeBashScripts();
  const accountId = req.params.id.toLowerCase();
  const scriptsDir = path.join(__dirname, 'scripts');

  execFile(
    'bash',
    ['./troopers.sh', '--request-upgrade', accountId],
    { cwd: scriptsDir, timeout: 60000 },
    (error, stdout, stderr) => {
      if (error) {
        console.error(`Upgrade request failed for ${accountId}:`, stderr || error.message);
        return res.status(500).json({
          error: `Upgrade request failed for ${accountId}`,
          details: stderr || error.message,
          stdout
        });
      }

      try {
        parseAllAccounts();
        const updatedAccount = parseAccountFolder(accountId);
        if (!updatedAccount) {
          return res.status(404).json({
            error: `Account '${accountId}' HTML not found after upgrade request`
          });
        }

        res.json({
          message: `Upgrade requested for ${accountId}`,
          log: stdout,
          account: updatedAccount
        });
      } catch (parseErr) {
        res.status(500).json({
          error: 'Upgrade request sent, but parsing upgrade choices failed',
          details: parseErr.message
        });
      }
    }
  );
});

// POST /api/account/:id/select-upgrade - Selects a specific upgrade skill option
app.post('/api/account/:id/select-upgrade', (req, res) => {
  sanitizeBashScripts();
  const accountId = req.params.id.toLowerCase();
  const { selectUrl } = req.body || {};

  if (!selectUrl) {
    return res.status(400).json({ error: 'Missing selectUrl in request body' });
  }

  const scriptsDir = path.join(__dirname, 'scripts');

  execFile(
    'bash',
    ['./troopers.sh', '--select-upgrade', selectUrl, accountId],
    { cwd: scriptsDir, timeout: 60000 },
    (error, stdout, stderr) => {
      if (error) {
        return res.status(500).json({
          error: `Selecting upgrade failed for ${accountId}`,
          details: stderr || error.message
        });
      }

      try {
        parseAllAccounts();
        const updatedAccount = parseAccountFolder(accountId);
        res.json({
          message: `Upgrade selected for ${accountId}`,
          log: stdout,
          account: updatedAccount
        });
      } catch (parseErr) {
        res.status(500).json({
          error: 'Upgrade selected, but HTML re-parsing failed',
          details: parseErr.message
        });
      }
    }
  );
});

// JSON 404 Catch-All so Express never returns <!DOCTYPE html>
app.use((req, res) => {
  res.status(404).json({
    error: `API route not found: ${req.method} ${req.originalUrl}`
  });
});

const server = http.createServer(app);

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Close the other process or change PORT.`);
  } else {
    console.error('Server error:', err);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Mini Troopers Command Center API running on http://localhost:${PORT}`);
});

server.ref();
const keepAliveInterval = setInterval(() => {}, 1000 * 60 * 60);

process.on('SIGINT', () => {
  clearInterval(keepAliveInterval);
  server.close(() => {
    process.exit(0);
  });
});
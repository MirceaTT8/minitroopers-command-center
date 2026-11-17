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

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

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

// POST /api/account/:id/request-upgrade - Sends upgrade request on /t/0 and parses upgrade options
app.post('/api/account/:id/request-upgrade', (req, res) => {
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

// POST /api/account/:id/select-upgrade - Selects a specific upgrade skill option if selectUrl is available
app.post('/api/account/:id/select-upgrade', (req, res) => {
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

app.listen(PORT, () => {
  console.log(`Mini Troopers Command Center API running on http://localhost:${PORT}`);
});
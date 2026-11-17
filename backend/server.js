// backend/server.js
const express = require('express');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const {
  parseAllAccounts,
  getCachedOrParsedAccounts
} = require('./parsers/htmlParser');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// GET /api/accounts - Parses raw_html folders and returns accountsCache.json
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

// POST /api/accounts/sync - Runs bash scraper (--scrape-only) and refreshes cache
app.post('/api/accounts/sync', (req, res) => {
  const scriptsDir = path.join(__dirname, 'scripts');
  const runAccountsScript = path.join(scriptsDir, 'run_accounts.sh');
  const troopersScript = path.join(scriptsDir, 'troopers.sh');

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

app.listen(PORT, () => {
  console.log(`Mini Troopers Command Center API running on http://localhost:${PORT}`);
});
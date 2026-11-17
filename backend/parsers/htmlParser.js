const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const CONFIG_DIR = path.join(__dirname, '..', 'config');
const DATA_DIR = path.join(__dirname, '..', 'data');
const RAW_HTML_DIR = path.join(DATA_DIR, 'raw_html');
const CACHE_FILE = path.join(DATA_DIR, 'accountsCache.json');

const skillsDictionaryRaw = JSON.parse(
  fs.readFileSync(path.join(CONFIG_DIR, 'skillsDictionary.json'), 'utf-8')
);
const upgradeCostTableRaw = JSON.parse(
  fs.readFileSync(path.join(CONFIG_DIR, 'upgradeCostTable.json'), 'utf-8')
);

// Normalize skills list whether skillsDictionary.json is { skills: [...] }, [...], or { key: {...} }
const skillsList = Array.isArray(skillsDictionaryRaw?.skills)
  ? skillsDictionaryRaw.skills
  : Array.isArray(skillsDictionaryRaw)
    ? skillsDictionaryRaw
    : Object.entries(skillsDictionaryRaw || {})
        .filter(([key, val]) => key !== 'meta' && val && typeof val === 'object')
        .map(([key, val], index) => ({
          id: val.id ?? index + 1,
          key: val.key ?? key.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
          name: val.name ?? key,
          aliases: val.aliases ?? [],
          type: val.type ?? 'Unknown',
          color: val.color ?? 'Gray',
          description: val.description ?? ''
        }));

// Normalize upgradeCostTable whether nested under costToCurrentLevel or flat
const costToLevelMap =
  upgradeCostTableRaw?.costToCurrentLevel || upgradeCostTableRaw || {};

const skillLookupMap = new Map();
for (const skill of skillsList) {
  if (!skill || !skill.name) continue;

  const mappedSkill = {
    id: skill.id ?? 999,
    key: skill.key ?? skill.name.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
    name: skill.name,
    type: skill.type ?? 'Unknown',
    color: skill.color ?? 'Gray',
    description: skill.description ?? ''
  };

  skillLookupMap.set(skill.name.toLowerCase().trim(), mappedSkill);

  if (skill.key) {
    skillLookupMap.set(String(skill.key).toLowerCase().trim(), mappedSkill);
  }

  if (Array.isArray(skill.aliases)) {
    for (const alias of skill.aliases) {
      skillLookupMap.set(String(alias).toLowerCase().trim(), mappedSkill);
    }
  }
}

function getSelectedOptionText($, selectName) {
  const select = $(`form#config select[name="${selectName}"]`);
  if (!select.length) return 'Unknown';

  const selected = select.find('option[selected]');
  if (selected.length) {
    return selected.first().text().trim();
  }
  return select.find('option').first().text().trim() || 'Unknown';
}

function parseAccountFolder(accountId) {
  const accountDir = path.join(RAW_HTML_DIR, accountId);
  const t0Path = path.join(accountDir, 't0.html');
  const hqPath = path.join(accountDir, 'hq.html');

  if (!fs.existsSync(t0Path)) {
    return null;
  }

  const t0Html = fs.readFileSync(t0Path, 'utf-8');
  const $t0 = cheerio.load(t0Html);

  let raidPhase = null;
  if (fs.existsSync(hqPath)) {
    const hqHtml = fs.readFileSync(hqPath, 'utf-8');
    const raidMatch = hqHtml.match(/Raid Phase\s+(\d+)/i);
    if (raidMatch) {
      raidPhase = parseInt(raidMatch[1], 10);
    }
  }

  const creditsText = $t0('div.money').first().text().replace(/[^0-9]/g, '');
  const powerText = $t0('div.power').first().text().replace(/[^0-9]/g, '');
  const credits = creditsText ? parseInt(creditsText, 10) : 0;
  const power = powerText ? parseInt(powerText, 10) : 0;

  const soldierImg = $t0('ul.skills li.soldier img').first();
  const soldierName =
    $t0('input#name').attr('value') ||
    soldierImg.attr('alt') ||
    accountId;
  const avatarUrl = soldierImg.attr('src') || null;

  const upgradeText = $t0('.sheetright a[href*="levelup"]').first().text();
  const costMatch = upgradeText.match(/Upgrade for\s+(\d+)/i);
  const upgradeCost = costMatch ? parseInt(costMatch[1], 10) : 0;
  const level = costToLevelMap[String(upgradeCost)] || null;

  const unlockedSkills = [];
  $t0('ul.skills > li.on').each((_, el) => {
    const onmouseover = $t0(el).attr('onmouseover') || '';
    const titleMatch = onmouseover.match(/<h1>([^<]+)<\/h1>/i);
    if (!titleMatch) return;

    const rawSkillName = titleMatch[1]
      .replace(/&#39;|&rsquo;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .trim();

    const matchedSkill = skillLookupMap.get(rawSkillName.toLowerCase());
    if (matchedSkill) {
      unlockedSkills.push(matchedSkill);
    } else {
      unlockedSkills.push({
        id: 999,
        key: rawSkillName.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
        name: rawSkillName,
        type: 'Unknown',
        color: 'Gray',
        description: 'Unmapped skill extracted from trooper sheet.'
      });
    }
  });

  unlockedSkills.sort((a, b) => (a.id || 999) - (b.id || 999));

  const aiConfig = {
    favouriteWeapon: getSelectedOptionText($t0, 'weapon'),
    favouriteTarget: getSelectedOptionText($t0, 'loc'),
    preferredVictim: getSelectedOptionText($t0, 'target'),
    fightingStyle: getSelectedOptionText($t0, 'move'),
    priorityTarget: getSelectedOptionText($t0, 'ttype')
  };

  return {
    id: accountId,
    name: accountId,
    raidPhase,
    credits,
    power,
    canUpgrade: upgradeCost > 0 && credits >= upgradeCost,
    firstSoldier: {
      slot: 0,
      name: soldierName,
      avatarUrl,
      level,
      upgradeCost,
      aiConfig,
      skills: unlockedSkills,
      availableUpgrades: []
    }
  };
}

function parseAllAccounts() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(RAW_HTML_DIR)) {
    fs.mkdirSync(RAW_HTML_DIR, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify([], null, 2), 'utf-8');
    return [];
  }

  const accountFolders = fs
    .readdirSync(RAW_HTML_DIR, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);

  const accounts = [];
  for (const folder of accountFolders) {
    const accountData = parseAccountFolder(folder);
    if (accountData) {
      accounts.push(accountData);
    }
  }

  fs.writeFileSync(CACHE_FILE, JSON.stringify(accounts, null, 2), 'utf-8');
  return accounts;
}

function getCachedOrParsedAccounts() {
  if (fs.existsSync(CACHE_FILE)) {
    try {
      const cached = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
      if (Array.isArray(cached) && cached.length > 0) {
        return cached;
      }
    } catch (_) {
      return parseAllAccounts();
    }
  }
  return parseAllAccounts();
}

module.exports = {
  parseAccountFolder,
  parseAllAccounts,
  getCachedOrParsedAccounts,
  CACHE_FILE
};
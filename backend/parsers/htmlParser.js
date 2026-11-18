const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const CONFIG_DIR = path.join(__dirname, '..', 'config');
const SCRIPTS_DIR = path.join(__dirname, '..', 'scripts');
const DATA_DIR = path.join(__dirname, '..', 'data');
const RAW_HTML_DIR = path.join(DATA_DIR, 'raw_html');
const CACHE_FILE = path.join(DATA_DIR, 'accountsCache.json');

const skillsDictionaryRaw = JSON.parse(
  fs.readFileSync(path.join(CONFIG_DIR, 'skillsDictionary.json'), 'utf-8')
);
const upgradeCostTableRaw = JSON.parse(
  fs.readFileSync(path.join(CONFIG_DIR, 'upgradeCostTable.json'), 'utf-8')
);

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

// Map Upgrade Cost -> Current Level (e.g. "181" -> 8, "316" -> 10)
const costToLevelMap =
  upgradeCostTableRaw?.costToCurrentLevel || upgradeCostTableRaw || {};

// Map Current Level -> Upgrade Cost (e.g. "6" -> 88, "8" -> 181)
const levelToCostMap = {};
for (const [costStr, lvlVal] of Object.entries(costToLevelMap)) {
  const costNum = parseInt(costStr, 10);
  const lvlNum = parseInt(lvlVal, 10);
  if (!isNaN(costNum) && !isNaN(lvlNum)) {
    levelToCostMap[String(lvlNum)] = costNum;
  }
}
if (Array.isArray(upgradeCostTableRaw?.levels)) {
  for (const row of upgradeCostTableRaw.levels) {
    if (row.currentLevel && row.upgradeCost) {
      levelToCostMap[String(row.currentLevel)] = row.upgradeCost;
    }
  }
}

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

// Register known in-game server spelling variations (such as "Comms. Officier" on trooperstest)
const SERVER_NAME_ALIASES = {
  'comms. officier': 'comms_officer',
  'comms officier': 'comms_officer',
  'comms officer': 'comms_officer',
  'cold-blooded': 'cold_blooded',
  'battle ready': 'battle_ready',
  'sniper rifle': 'sniper',
  'bazooka': 'bazooka_m1',
  'back pack': 'rucksack',
  'backpack': 'rucksack',
  'walkie-talkie': 'talky_walky',
  'anatomist': 'anatomy',
  'sprint': 'sprinter',
  'dodge': 'dodger'
};

for (const [aliasName, targetKey] of Object.entries(SERVER_NAME_ALIASES)) {
  const targetSkill = skillLookupMap.get(targetKey);
  if (targetSkill && !skillLookupMap.has(aliasName)) {
    skillLookupMap.set(aliasName, targetSkill);
  }
}

// Dynamically read accounts_recruiter=( "berbelita1:berbelita" ... ) from secret.cfg
function loadRecruitersMapFromSecretCfg() {
  const recruitersMap = new Map();
  const candidatePaths = [
    path.join(SCRIPTS_DIR, 'secret.cfg'),
    path.join(CONFIG_DIR, 'secret.cfg')
  ];

  for (const secretPath of candidatePaths) {
    if (!fs.existsSync(secretPath)) continue;
    const content = fs.readFileSync(secretPath, 'utf-8');

    // Match the accounts_recruiter=( ... ) array block
    const blockMatch = content.match(/accounts_recruiter\s*=\s*\(([\s\S]*?)\)/);
    if (!blockMatch) continue;

    const blockBody = blockMatch[1];
    const pairRegex = /["']?([A-Za-z0-9_.-]+)\s*:\s*([A-Za-z0-9_.-]+)["']?/g;
    let match;
    while ((match = pairRegex.exec(blockBody)) !== null) {
      const accountName = match[1].trim().toLowerCase();
      const recruiterName = match[2].trim();
      if (accountName && recruiterName) {
        recruitersMap.set(accountName, recruiterName);
      }
    }
  }

  return recruitersMap;
}

function cleanHtmlEntities(str) {
  return String(str || '')
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function findSkillInDictionary(rawName, fallbackDesc = '') {
  const cleaned = cleanHtmlEntities(rawName);
  if (!cleaned) return null;

  const direct = skillLookupMap.get(cleaned.toLowerCase());
  if (direct) return direct;

  const normalizedKey = cleaned
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  if (skillLookupMap.has(normalizedKey)) {
    return skillLookupMap.get(normalizedKey);
  }

  return {
    id: 999,
    key: normalizedKey || 'unknown_skill',
    name: cleaned,
    type: 'Unknown',
    color: 'Gray',
    description: cleanHtmlEntities(fallbackDesc) || 'Skill parsed from game server.'
  };
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

function extractUpgradeChoicesFromHtml(htmlContent) {
  if (!htmlContent) return [];
  const $ = cheerio.load(htmlContent);
  const choices = [];
  const seenKeys = new Set();

  function pushChoice(rawName, selectUrl = null, rawDescription = '') {
    const matched = findSkillInDictionary(rawName, rawDescription);
    if (!matched || seenKeys.has(matched.key)) return;

    seenKeys.add(matched.key);
    choices.push({
      id: matched.id,
      key: matched.key,
      name: matched.name,
      type: matched.type,
      color: matched.color,
      description: matched.description || cleanHtmlEntities(rawDescription),
      selectUrl: selectUrl || null
    });
  }

  $('table.levelup .box8, div.box8').each((_, box) => {
    const rawName = $(box).find('h2').first().text();
    const rawDesc = $(box).find('div.s').first().text();
    const onclickAttr = $(box).attr('onclick') || '';

    let selectUrl = null;
    const locMatch =
      onclickAttr.match(/document\.location\s*=\s*['"]([^'"]+)['"]/i) ||
      onclickAttr.match(/['"](\/levelup\/[^'"]+)['"]/i);
    if (locMatch) {
      selectUrl = locMatch[1];
    } else {
      selectUrl = $(box).find('a').attr('href') || null;
    }

    if (rawName) {
      pushChoice(rawName, selectUrl, rawDesc);
    }
  });

  $('a[href*="/levelup/"]').each((_, a) => {
    const href = $(a).attr('href') || null;
    const rawName = $(a).find('h2').text() || $(a).text();
    if (rawName) {
      pushChoice(rawName, href);
    }
  });

  return choices;
}

function readPreviousCachedAccount(accountId) {
  if (!fs.existsSync(CACHE_FILE)) return null;
  try {
    const list = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    if (!Array.isArray(list)) return null;
    return (
      list.find((item) => item?.id?.toLowerCase() === accountId.toLowerCase()) ||
      null
    );
  } catch (_) {
    return null;
  }
}

function parseAccountFolder(accountId, recruitersMap = null) {
  const activeRecruitersMap = recruitersMap || loadRecruitersMapFromSecretCfg();
  const accountDir = path.join(RAW_HTML_DIR, accountId);
  const t0Path = path.join(accountDir, 't0.html');
  const t0StatsBackupPath = path.join(accountDir, 't0_stats.html');
  const hqPath = path.join(accountDir, 'hq.html');
  const levelup0Path = path.join(accountDir, 'levelup0.html');
  const recruiterTxtPath = path.join(accountDir, 'recruiter.txt');

  if (!fs.existsSync(t0Path) && !fs.existsSync(levelup0Path)) {
    return null;
  }

  const primaryT0Html = fs.existsSync(t0Path)
    ? fs.readFileSync(t0Path, 'utf-8')
    : fs.readFileSync(levelup0Path, 'utf-8');

  const statsSheetHtml =
    !primaryT0Html.includes('class="tablesheet"') &&
    fs.existsSync(t0StatsBackupPath)
      ? fs.readFileSync(t0StatsBackupPath, 'utf-8')
      : primaryT0Html;

  const levelupHtml = fs.existsSync(levelup0Path)
    ? fs.readFileSync(levelup0Path, 'utf-8')
    : primaryT0Html.includes('class="levelup"')
      ? primaryT0Html
      : '';

  const $primary = cheerio.load(primaryT0Html);
  const $stats = cheerio.load(statsSheetHtml);
  const previousCache = readPreviousCachedAccount(accountId);

  // Resolve Recruiter from secret.cfg (accounts_recruiter) or fallback to recruiter.txt / previous cache
  let recruiter = activeRecruitersMap.get(accountId.toLowerCase()) || null;
  if (!recruiter && fs.existsSync(recruiterTxtPath)) {
    recruiter = fs.readFileSync(recruiterTxtPath, 'utf-8').trim() || null;
  }
  if (!recruiter && previousCache?.recruiter) {
    recruiter = previousCache.recruiter;
  }

  // 1. Parse Raid Phase from hq.html
  let raidPhase = null;
  if (fs.existsSync(hqPath)) {
    const hqHtml = fs.readFileSync(hqPath, 'utf-8');
    const raidMatch = hqHtml.match(/Raid Phase\s+(\d+)/i);
    if (raidMatch) {
      raidPhase = parseInt(raidMatch[1], 10);
    }
  }

  // 2. Parse Credits & Army Power
  const creditsText =
    $primary('div.money').first().text().replace(/[^0-9]/g, '') ||
    $stats('div.money').first().text().replace(/[^0-9]/g, '');
  const powerText =
    $primary('div.power').first().text().replace(/[^0-9]/g, '') ||
    $stats('div.power').first().text().replace(/[^0-9]/g, '');

  const credits = creditsText ? parseInt(creditsText, 10) : 0;
  const power = powerText ? parseInt(powerText, 10) : 0;

  // 3. Parse Soldier Name & Avatar URL
  const soldierImg =
    $stats('ul.skills li.soldier img').first().length > 0
      ? $stats('ul.skills li.soldier img').first()
      : $primary('table.levelup span.tcard img').first().length > 0
        ? $primary('table.levelup span.tcard img').first()
        : $primary('#swf_tr_view a.tcard[href="/t/0"] img').first();

  let advancedMatch = null;
  if (levelupHtml) {
    advancedMatch = levelupHtml.match(
      /([A-Za-z0-9_.-]+)\s+has\s+advanced\s+to\s+level\s+(\d+)/i
    );
  }

  const soldierName =
    $stats('input#name').attr('value') ||
    soldierImg.attr('alt') ||
    (advancedMatch ? advancedMatch[1] : null) ||
    previousCache?.firstSoldier?.name ||
    accountId;

  const avatarUrl =
    soldierImg.attr('src') ||
    previousCache?.firstSoldier?.avatarUrl ||
    null;

  // 4. Parse Upgrade Cost & Soldier Level
  const upgradeLinkEl = $stats('.sheetright a[href*="levelup"]').first();
  const levelupUrl = upgradeLinkEl.attr('href') || null;
  const upgradeText = upgradeLinkEl.text();
  const costMatch = upgradeText.match(/Upgrade for\s+(\d+)/i);

  let upgradeCost = costMatch ? parseInt(costMatch[1], 10) : 0;
  let level = upgradeCost ? costToLevelMap[String(upgradeCost)] || null : null;

  if (advancedMatch) {
    const advancedLevel = parseInt(advancedMatch[2], 10);
    if (!isNaN(advancedLevel)) {
      level = advancedLevel;
      if (levelToCostMap[String(advancedLevel)]) {
        upgradeCost = levelToCostMap[String(advancedLevel)];
      }
    }
  }

  if (!level && previousCache?.firstSoldier?.level) {
    level = previousCache.firstSoldier.level;
  }
  if (!upgradeCost && level && levelToCostMap[String(level)]) {
    upgradeCost = levelToCostMap[String(level)];
  }

  // 5. Parse Unlocked Skills
  const unlockedSkills = [];
  const mainSkillsList = $stats('ul.skills')
    .filter((_, ul) => $stats(ul).find('li.soldier').length > 0)
    .first();

  const skillNodes = mainSkillsList.length
    ? mainSkillsList.find('> li.on')
    : $stats('ul.skills > li.on');

  skillNodes.each((_, el) => {
    const onmouseover = $stats(el).attr('onmouseover') || '';
    const titleMatch = onmouseover.match(/<h1>([^<]+)<\/h1>/i);
    if (!titleMatch) return;

    const matchedSkill = findSkillInDictionary(titleMatch[1]);
    if (matchedSkill) {
      unlockedSkills.push({
        id: matchedSkill.id,
        key: matchedSkill.key,
        name: matchedSkill.name,
        type: matchedSkill.type,
        color: matchedSkill.color,
        description: matchedSkill.description
      });
    }
  });

  if (
    unlockedSkills.length === 0 &&
    Array.isArray(previousCache?.firstSoldier?.skills) &&
    previousCache.firstSoldier.skills.length > 0
  ) {
    unlockedSkills.push(...previousCache.firstSoldier.skills);
  }

  unlockedSkills.sort((a, b) => (a.id || 999) - (b.id || 999));

  // 6. Parse Available Upgrade Choices
  let availableUpgrades = extractUpgradeChoicesFromHtml(levelupHtml);
  if (availableUpgrades.length === 0) {
    availableUpgrades = extractUpgradeChoicesFromHtml(primaryT0Html);
  }

  // 7. Parse the 5 AI Config Dropdowns
  const hasConfigForm = $stats('form#config').length > 0;
  const aiConfig = hasConfigForm
    ? {
        favouriteWeapon: getSelectedOptionText($stats, 'weapon'),
        favouriteTarget: getSelectedOptionText($stats, 'loc'),
        preferredVictim: getSelectedOptionText($stats, 'target'),
        fightingStyle: getSelectedOptionText($stats, 'move'),
        priorityTarget: getSelectedOptionText($stats, 'ttype')
      }
    : previousCache?.firstSoldier?.aiConfig || {
        favouriteWeapon: 'Pending Skill Choice',
        favouriteTarget: 'Pending Skill Choice',
        preferredVictim: 'Pending Skill Choice',
        fightingStyle: 'Pending Skill Choice',
        priorityTarget: 'Pending Skill Choice'
      };

  const canUpgrade =
    (upgradeCost > 0 && credits >= upgradeCost) || availableUpgrades.length > 0;

  return {
    id: accountId,
    name: accountId,
    recruiter,
    raidPhase,
    credits,
    power,
    canUpgrade,
    firstSoldier: {
      slot: 0,
      name: soldierName,
      avatarUrl,
      level,
      upgradeCost,
      levelupUrl,
      upgradeRequested: availableUpgrades.length > 0,
      aiConfig,
      skills: unlockedSkills,
      availableUpgrades
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

  const recruitersMap = loadRecruitersMapFromSecretCfg();

  const accountFolders = fs
    .readdirSync(RAW_HTML_DIR, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);

  const accounts = [];
  for (const folder of accountFolders) {
    const accountData = parseAccountFolder(folder, recruitersMap);
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
        // Always refresh recruiter field from secret.cfg in case secret.cfg was edited
        const recruitersMap = loadRecruitersMapFromSecretCfg();
        for (const acc of cached) {
          const mappedRecruiter = recruitersMap.get(acc.id.toLowerCase());
          if (mappedRecruiter) {
            acc.recruiter = mappedRecruiter;
          } else if (acc.recruiter === undefined) {
            acc.recruiter = null;
          }
        }
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
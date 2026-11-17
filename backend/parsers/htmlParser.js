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

function cleanHtmlEntities(str) {
  return String(str || '')
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .trim();
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

  function addChoice(rawName, selectUrl = null) {
    const cleaned = cleanHtmlEntities(rawName);
    if (!cleaned) return;
    const matched = skillLookupMap.get(cleaned.toLowerCase());
    if (!matched) return;
    if (seenKeys.has(matched.key)) return;

    seenKeys.add(matched.key);
    choices.push({
      ...matched,
      selectUrl: selectUrl || null
    });
  }

  // 1. Check any <ul class="skills"> that is NOT the main soldier skill grid (no li.soldier)
  $('ul.skills').each((_, ul) => {
    if ($(ul).find('li.soldier').length > 0) {
      // Even inside main ul.skills, if an <li> wraps an <a href="..."> or has a levelup choice class, capture it
      $(ul)
        .find('li')
        .each((__, li) => {
          const linkHref =
            $(li).find('a').attr('href') || $(li).attr('onclick') || '';
          if (linkHref && !$(li).hasClass('soldier')) {
            const onmouseover =
              $(li).attr('onmouseover') ||
              $(li).find('[onmouseover]').attr('onmouseover') ||
              '';
            const m = onmouseover.match(/<h1>([^<]+)<\/h1>/i);
            if (m) addChoice(m[1], $(li).find('a').attr('href'));
          }
        });
      return;
    }

    $(ul)
      .find('li')
      .each((__, li) => {
        const onmouseover =
          $(li).attr('onmouseover') ||
          $(li).find('[onmouseover]').attr('onmouseover') ||
          '';
        const m = onmouseover.match(/<h1>([^<]+)<\/h1>/i);
        const href =
          $(li).find('a').attr('href') ||
          $(li).closest('a').attr('href') ||
          null;
        if (m) {
          addChoice(m[1], href);
        }
      });
  });

  // 2. Scan .sheetright, .levelup, .choices, and any links outside form#config and main ul.skills
  $('.sheetright, .levelup, .choose, .choices')
    .find('*')
    .each((_, el) => {
      if ($(el).closest('form#config').length > 0) return;

      const onmouseover = $(el).attr('onmouseover') || '';
      const tipMatch = onmouseover.match(/<h1>([^<]+)<\/h1>/i);
      const href =
        $(el).attr('href') ||
        $(el).find('a').first().attr('href') ||
        $(el).closest('a').attr('href') ||
        null;

      if (tipMatch) {
        addChoice(tipMatch[1], href);
      }
    });

  // 3. Scan any <a> tags pointing to skill selection endpoints (/t/0?..., /levelup/0?...)
  $('a[href]').each((_, a) => {
    if ($(a).closest('form#config').length > 0) return;
    if ($(a).closest('ul.skills').find('li.soldier').length > 0) return;

    const href = $(a).attr('href') || '';
    const onmouseover = $(a).attr('onmouseover') || '';
    const tipMatch = onmouseover.match(/<h1>([^<]+)<\/h1>/i);
    if (tipMatch) {
      addChoice(tipMatch[1], href);
      return;
    }

    const linkText = cleanHtmlEntities($(a).text());
    if (linkText && skillLookupMap.has(linkText.toLowerCase())) {
      addChoice(linkText, href);
    }
  });

  // 4. Scan any standalone [onmouseover] outside the main soldier ul.skills grid and form#config
  $('[onmouseover]').each((_, el) => {
    if ($(el).closest('form#config').length > 0) return;
    if ($(el).closest('ul.skills').find('li.soldier').length > 0) return;

    const onmouseover = $(el).attr('onmouseover') || '';
    const tipMatch = onmouseover.match(/<h1>([^<]+)<\/h1>/i);
    if (tipMatch) {
      const href =
        $(el).attr('href') ||
        $(el).find('a').first().attr('href') ||
        $(el).closest('a').attr('href') ||
        null;
      addChoice(tipMatch[1], href);
    }
  });

  return choices;
}

function parseAccountFolder(accountId) {
  const accountDir = path.join(RAW_HTML_DIR, accountId);
  const t0Path = path.join(accountDir, 't0.html');
  const hqPath = path.join(accountDir, 'hq.html');
  const levelup0Path = path.join(accountDir, 'levelup0.html');

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

  const upgradeLinkEl = $t0('.sheetright a[href*="levelup"]').first();
  const levelupUrl = upgradeLinkEl.attr('href') || null;
  const upgradeText = upgradeLinkEl.text();
  const costMatch = upgradeText.match(/Upgrade for\s+(\d+)/i);
  const upgradeCost = costMatch ? parseInt(costMatch[1], 10) : 0;
  const level = costToLevelMap[String(upgradeCost)] || null;

  const unlockedSkills = [];
  const mainSkillsList = $t0('ul.skills')
    .filter((_, ul) => $t0(ul).find('li.soldier').length > 0)
    .first();

  const skillNodes = mainSkillsList.length
    ? mainSkillsList.find('> li.on')
    : $t0('ul.skills > li.on');

  skillNodes.each((_, el) => {
    const onmouseover = $t0(el).attr('onmouseover') || '';
    const titleMatch = onmouseover.match(/<h1>([^<]+)<\/h1>/i);
    if (!titleMatch) return;

    const rawSkillName = cleanHtmlEntities(titleMatch[1]);
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

  // Extract upgrade options from levelup0.html (if present) and t0.html
  let availableUpgrades = [];
  if (fs.existsSync(levelup0Path)) {
    const levelupHtml = fs.readFileSync(levelup0Path, 'utf-8');
    availableUpgrades = extractUpgradeChoicesFromHtml(levelupHtml);
  }
  if (availableUpgrades.length === 0) {
    availableUpgrades = extractUpgradeChoicesFromHtml(t0Html);
  }

  const aiConfig = {
    favouriteWeapon: getSelectedOptionText($t0, 'weapon'),
    favouriteTarget: getSelectedOptionText($t0, 'loc'),
    preferredVictim: getSelectedOptionText($t0, 'target'),
    fightingStyle: getSelectedOptionText($t0, 'move'),
    priorityTarget: getSelectedOptionText($t0, 'ttype')
  };

  const canUpgrade =
    (upgradeCost > 0 && credits >= upgradeCost) || availableUpgrades.length > 0;

  return {
    id: accountId,
    name: accountId,
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
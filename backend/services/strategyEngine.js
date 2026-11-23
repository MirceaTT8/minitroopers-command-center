// backend/services/strategyEngine.js
const fs = require('fs');
const path = require('path');

const SCRIPTS_DIR = path.join(__dirname, '..', 'scripts');
const CONFIG_DIR = path.join(__dirname, '..', 'config');

/**
 * Exact POST values for form#config dropdowns on /t/0
 */
const AI_CONFIG_OPTION_VALUES = {
  loc: {
    'Anywhere!': '-1',
    'In the head!': '0',
    'Straight in the heart!': '1',
    'Right lung': '2',
    'Gutshot': '3',
    'Gutshot (nasty)': '3',
    'Left arm': '4',
    'Right arm': '5',
    'Left leg': '6',
    'Right leg': '7'
  },
  target: {
    'The closest': '0',
    'The easiest': '1',
    'The weakest (yeah boi!)': '2',
    'The biggest threat': '3'
  },
  move: {
    Hunter: '0',
    Standard: '1',
    Defender: '2'
  },
  ttype: {
    Default: '-1',
    Soldier: '0',
    Doctor: '1',
    Pilot: '2',
    Munitions: '3',
    Scout: '4',
    Spy: '5',
    'Comms. Officier': '6',
    'Comms. Officer': '6',
    Saboteur: '7'
  }
};

/**
 * [ADDED] Global Weapon Priority / Tier List (Highest -> Lowest).
 * Used to always equip the trooper's strongest unlocked weapon as Favorite Weapon
 * on /t/0 instead of wasting opening turns on starter weapons (Pistol, Shotgun, Sniper, etc.).
 */
const WEAPON_PRIORITY_TIER_LIST = [
  // S+ / S Tier: Heavy Machine Guns, Top Snipers, High-Impact Launchers
  'minigun',
  'comanche_auto',
  'heavy_machine_gun',
  'gatling_gun',
  'sparrowhawk',
  'mos_teck',
  'ck_magellan',
  'bazooka_m25',
  'infernal_tube',

  // A+ / A Tier: Top SMGs, Assault Rifles, Shotguns, Heavy Snipers, Launchers
  'ump',
  'thompson',
  'famas',
  'ak47',
  'semi_auto_shotgun',
  'pump_action_shotgun',
  'lizaro_jungle',
  'm16',
  'double_barrelled_shotgun',
  'scattergun',
  'bazooka_m1',
  'bazooka',
  'rocket_launcher',

  // B Tier: Upgraded Sidearms (strictly prioritized over starter weapons)
  'dual_pistols',
  'revolver',
  'desert_eagle',
  'beretta',

  // C Tier: Starter Weapons
  'assault_rifle',
  'sniper',
  'sniper_rifle',
  'shotgun',
  'pistol',

  // F Tier: Melee Fallback
  'knife'
];

/**
 * [ADDED] Total rocket ammo capacity per launcher (from skillsDictionary.json).
 * Used to enforce Defender style ONLY on rocket troopers whose launcher has >= 3 total rockets
 * (e.g., Bazooka M25 = 6 total) and NEVER on Infernal Tube (1) or launchers with < 3 total rockets.
 */
const ROCKET_LAUNCHER_TOTAL_ROCKETS = {
  bazooka_m25: 6, // 3 mag / 6 total shots -> Defender allowed
  bazooka_m1: 2, // 1 mag / 2 total shots (< 3) -> Standard
  bazooka: 2, // Alias for Bazooka M1 (< 3) -> Standard
  rocket_launcher: 2, // 1 mag / 2 total shots (< 3) -> Standard
  infernal_tube: 1 // 1 mag / 1 total shot (< 3) -> Standard
};

/**
 * Exact 30-500 Recruit Class Scaling Matrix anchors from Sheet 1 of
 * Mini_Troopers_Raid_and_Army_Strategy-v2.xlsx
 */
const CLASS_SCALING_ANCHORS = [
  {
    poolSize: 30,
    split: {
      saboteur: 5,
      doctor: 4,
      comms_officer: 2,
      soldier: 13,
      munitions: 2,
      scout: 2,
      pilot: 2,
      spy: 0
    }
  },
  {
    poolSize: 50,
    split: {
      saboteur: 9,
      doctor: 7,
      comms_officer: 2,
      soldier: 22,
      munitions: 4,
      scout: 3,
      pilot: 3,
      spy: 0
    }
  },
  {
    poolSize: 100,
    split: {
      saboteur: 18,
      doctor: 13,
      comms_officer: 3,
      soldier: 48,
      munitions: 8,
      scout: 4,
      pilot: 6,
      spy: 0
    }
  },
  {
    poolSize: 150,
    split: {
      saboteur: 25,
      doctor: 20,
      comms_officer: 3,
      soldier: 76,
      munitions: 12,
      scout: 4,
      pilot: 10,
      spy: 0
    }
  },
  {
    poolSize: 200,
    split: {
      saboteur: 32,
      doctor: 26,
      comms_officer: 3,
      soldier: 105,
      munitions: 16,
      scout: 4,
      pilot: 14,
      spy: 0
    }
  },
  {
    poolSize: 300,
    split: {
      saboteur: 45,
      doctor: 40,
      comms_officer: 4,
      soldier: 163,
      munitions: 24,
      scout: 4,
      pilot: 20,
      spy: 0
    }
  },
  {
    poolSize: 400,
    split: {
      saboteur: 56,
      doctor: 54,
      comms_officer: 4,
      soldier: 224,
      munitions: 32,
      scout: 4,
      pilot: 26,
      spy: 0
    }
  },
  {
    poolSize: 500,
    split: {
      saboteur: 65,
      doctor: 68,
      comms_officer: 4,
      soldier: 287,
      munitions: 40,
      scout: 4,
      pilot: 32,
      spy: 0
    }
  }
];

const ROLE_METADATA = {
  saboteur: {
    key: 'saboteur',
    name: 'Saboteur',
    raidPriority: 10,
    queueSlot: 'Very Back of Reserve (Final 18%)',
    summary: '+1 global enemy weapon disarm per level above 5 from reserve bench.'
  },
  doctor: {
    key: 'doctor',
    name: 'Doctor',
    raidPriority: 9,
    queueSlot: 'Spread Evenly (1 per Wave / Front & Mid Queue)',
    summary: 'Heals 5 HP at Lvl 6 (+1/lvl) and cures crippled limbs/poison between Raid phases.'
  },
  comms_officer: {
    key: 'comms_officer',
    name: 'Comms. Officer',
    raidPriority: 9,
    queueSlot: 'Very Back of Reserve (Final 18%)',
    summary: '+5 Comms at Lvl 6 (+1/lvl). Run 1 (<10 bug-free) or 3-4 (20+ Propaganda).'
  },
  soldier: {
    key: 'soldier',
    name: 'Soldier',
    raidPriority: 8,
    queueSlot: 'Front & Middle Queue (First 82%)',
    summary: 'Frontline tank backbone (+1 HP/lvl retroactive & future, caps headshot dmg at 2).'
  },
  munitions: {
    key: 'munitions',
    name: 'Munitions',
    raidPriority: 7,
    queueSlot: 'Middle-to-Back Queue',
    summary: 'Doubles global grenade frequency (2x) and reloads 1 ally per level > 5 on wave arrival.'
  },
  scout: {
    key: 'scout',
    name: 'Scout',
    raidPriority: 6,
    queueSlot: 'Very Back of Reserve (Final 18%)',
    summary: '+1 Wave Deployment flat (Hard Cap 2-4 Scouts = 6-8 troops/wave; 5+ causes AoE wipes).'
  },
  pilot: {
    key: 'pilot',
    name: 'Pilot',
    raidPriority: 6,
    queueSlot: 'Middle of Queue',
    summary: 'Deploys Tanks, Helis, and Fighter Jets in mid-to-late Raid waves.'
  },
  spy: {
    key: 'spy',
    name: 'Spy',
    raidPriority: 2,
    queueSlot: 'Do Not Use in Raids (0 Quota)',
    summary: 'Strictly 0 in Raids: infiltrates early waves isolated and dies or triggers friendly fire.'
  }
};

const ROLE_KEYS = Object.keys(ROLE_METADATA);

/**
 * Weapon & Skill Synergy Groups from Sheet 4 (4_Soldier_Individual_Builds)
 */
const WEAPON_GROUPS = {
  reloadMandatory: [
    'minigun',
    'comanche_auto',
    'heavy_machine_gun',
    'gatling_gun',
    'sparrowhawk',
    'mos_teck',
    'ck_magellan',
    'bazooka_m25',
    'bazooka_m1',
    'infernal_tube'
  ],
  heavyWeapons: [
    'minigun',
    'comanche_auto',
    'heavy_machine_gun',
    'gatling_gun',
    'sparrowhawk',
    'mos_teck',
    'ck_magellan',
    'lizaro_jungle',
    'bazooka_m1',
    'bazooka_m25',
    'infernal_tube'
  ],
  machineGuns: ['minigun', 'comanche_auto', 'heavy_machine_gun', 'gatling_gun'],
  shotguns: [
    'pump_action_shotgun',
    'semi_auto_shotgun',
    'double_barrelled_shotgun',
    'scattergun',
    'shotgun'
  ],
  snipers: ['sparrowhawk', 'mos_teck', 'ck_magellan', 'lizaro_jungle', 'sniper', 'sniper_rifle'],
  bruiserSmgsRifles: ['thompson', 'famas', 'ump', 'ak47', 'm16', 'assault_rifle'],
  highCritWeapons: [
    'sparrowhawk',
    'mos_teck',
    'ump',
    'ck_magellan',
    'lizaro_jungle',
    'sniper',
    'sniper_rifle',
    'ak47',
    'm16'
  ],
  burstFireWeapons: [
    'minigun',
    'comanche_auto',
    'heavy_machine_gun',
    'gatling_gun',
    'thompson',
    'famas',
    'ump',
    'ak47',
    'm16',
    'assault_rifle',
    'dual_pistols'
  ],
  explosiveLaunchers: ['bazooka_m25', 'infernal_tube', 'rocket_launcher', 'bazooka_m1', 'bazooka'],
  backupSidearms: ['revolver', 'desert_eagle', 'beretta', 'dual_pistols', 'pistol']
};

/**
 * 7 Trooper Archetypes from Sheet 4 (ARCHETYPE BUILD MATRIX)
 */
const ARCHETYPES = [
  {
    id: 'close_range_shock',
    name: 'Close-Range Shock / Knockdown',
    primaryWeapons: [
      'pump_action_shotgun',
      'semi_auto_shotgun',
      'double_barrelled_shotgun',
      'scattergun',
      'shotgun'
    ],
    backupWeapons: ['revolver', 'beretta'],
    coreSkills: [
      'motorcycle',
      'rush',
      'charge',
      'nimble_fingers',
      'hydroshock_shells',
      'paralysing_shells',
      'hard_boiled',
      'bulletproof_vest',
      'tuck_n_roll',
      'sturdy',
      'suspicious',
      'on_point',
      'sprinter'
    ],
    recommendedStyle: 'Hunter',
    recommendedTarget: 'Gutshot',
    recommendedVictim: 'The closest',
    recommendedPriorityTarget: 'Default'
  },
  {
    id: 'armor_piercing_bruiser',
    name: 'Armor-Piercing Mid-Range Bruiser',
    primaryWeapons: ['thompson', 'famas'],
    backupWeapons: ['desert_eagle', 'dual_pistols', 'beretta', 'revolver'],
    coreSkills: [
      'twinoid',
      'trigger_happy',
      'loader',
      'nimble_fingers',
      'armor_piercing_shells',
      'explosive_shells',
      'toxic_shells',
      'hydroshock_shells',
      'paralysing_shells',
      'dodger',
      'hard_boiled',
      'sprinter',
      'on_point',
      'bulletproof_vest',
      'suspicious'
    ],
    recommendedStyle: 'Standard',
    recommendedTarget: 'Gutshot',
    recommendedVictim: 'The closest',
    recommendedPriorityTarget: 'Default'
  },
  {
    id: 'crit_burst_assassin',
    name: 'Crit Burst SMG / Rifle Assassin',
    primaryWeapons: ['ump', 'ak47', 'm16', 'assault_rifle'],
    backupWeapons: ['revolver', 'beretta', 'desert_eagle'],
    coreSkills: [
      'anatomy',
      'heartbreaker',
      'vicious',
      'laser_sights',
      'trigger_happy',
      'twinoid',
      'unforgiving',
      'adrenaline',
      'frenetic',
      'hyperactive',
      'survivor',
      'hard_boiled',
      'suspicious',
      'hydroshock_shells',
      'paralysing_shells'
    ],
    recommendedStyle: 'Standard',
    recommendedTarget: 'In the head!',
    recommendedVictim: 'The weakest (yeah boi!)',
    recommendedPriorityTarget: 'Default'
  },
  {
    id: 'heavy_suppression_gunner',
    name: 'Heavy Suppression Gunner',
    primaryWeapons: ['heavy_machine_gun', 'comanche_auto', 'minigun', 'gatling_gun'],
    backupWeapons: ['revolver', 'famas', 'beretta'],
    coreSkills: [
      'loader',
      'sturdy',
      'tail_gunner',
      'battle_ready',
      'rucksack',
      'cold_blooded',
      'hard_boiled',
      'heavyweight',
      'bulletproof_vest',
      'suspicious',
      'twinoid',
      'trigger_happy'
    ],
    recommendedStyle: 'Standard',
    recommendedTarget: 'Anywhere!',
    recommendedVictim: 'The closest',
    recommendedPriorityTarget: 'Default'
  },
  {
    id: 'global_executioner_sniper',
    name: 'Global Executioner Sniper',
    primaryWeapons: ['sparrowhawk', 'mos_teck', 'ck_magellan', 'lizaro_jungle', 'sniper', 'sniper_rifle'],
    backupWeapons: ['desert_eagle', 'revolver', 'beretta'],
    coreSkills: [
      'loader',
      'cold_blooded',
      'sturdy',
      'anatomy',
      'heartbreaker',
      'laser_sights',
      'heat_sensor',
      'vicious',
      'suspicious',
      'camouflage',
      'dodger',
      'on_point'
    ],
    recommendedStyle: 'Defender',
    recommendedTarget: 'In the head!',
    recommendedVictim: 'The biggest threat',
    recommendedPriorityTarget: 'Default'
  },
  {
    id: 'explosive_demolitions',
    name: 'Explosive / AoE Demolitions',
    primaryWeapons: ['bazooka_m25', 'infernal_tube', 'rocket_launcher', 'bazooka_m1', 'bazooka'],
    backupWeapons: ['famas', 'pump_action_shotgun', 'revolver'],
    coreSkills: [
      'loader',
      'sturdy',
      'munitions',
      'grenade_benny',
      'king_of_boules',
      'cold_blooded',
      'explosive_shells',
      'suspicious',
      'hard_boiled',
      'on_point'
    ],
    // [UPDATED] Default to Standard here; resolveFightingStyle() upgrades to Defender
    // ONLY if the rocket trooper carries a launcher with >= 3 total rockets (not Infernal Tube).
    recommendedStyle: 'Standard',
    recommendedTarget: 'Anywhere!',
    recommendedVictim: 'The closest',
    recommendedPriorityTarget: 'Default'
  },
  {
    id: 'combat_medic_specialist',
    name: 'Combat Medic / Global Specialist',
    primaryWeapons: ['famas', 'm16', 'assault_rifle'],
    backupWeapons: ['beretta', 'revolver'],
    coreSkills: [
      'doctor',
      'saboteur',
      'comms_officer',
      'scout',
      'smart',
      'suspicious',
      'saviour',
      'healing_grenade',
      'hurry',
      'first_aid',
      'talky_walky',
      'hard_boiled',
      'dodger',
      'tuck_n_roll',
      'survivor',
      'invincible',
      'bulletproof_vest',
      'camouflage'
    ],
    // [UPDATED] Switched from Defender to Standard so medics/specialists don't waste turns retreating.
    recommendedStyle: 'Standard',
    recommendedTarget: 'Anywhere!',
    recommendedVictim: 'The closest',
    recommendedPriorityTarget: 'Default'
  }
];

function normalizeKey(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/comms\.\s*officier/g, 'comms_officer')
    .replace(/comms\s*officier/g, 'comms_officer')
    .replace(/cold-blooded/g, 'cold_blooded')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * [ADDED] Returns the priority rank of a weapon from WEAPON_PRIORITY_TIER_LIST
 * (lower index = higher priority; unknown weapons sort to the bottom).
 */
function getWeaponPriorityRank(weaponNameOrKey) {
  const key = normalizeKey(weaponNameOrKey);
  const idx = WEAPON_PRIORITY_TIER_LIST.indexOf(key);
  return idx === -1 ? WEAPON_PRIORITY_TIER_LIST.length : idx;
}

/**
 * Reads accounts_recruiter=( "account:recruiter" ... ) from secret.cfg
 * and returns:
 *  - accountToRecruiter: Map<accountLower, recruiterName>
 *  - recruiterAccountCounts: Map<recruiterLower, { name, trackedCount, accounts: string[] }>
 */
function readRecruiterAssignmentsFromSecretCfg() {
  const accountToRecruiter = new Map();
  const recruiterAccountCounts = new Map();

  const candidatePaths = [
    path.join(SCRIPTS_DIR, 'secret.cfg'),
    path.join(CONFIG_DIR, 'secret.cfg')
  ];

  for (const secretPath of candidatePaths) {
    if (!fs.existsSync(secretPath)) continue;
    const content = fs.readFileSync(secretPath, 'utf-8');
    const blockMatch = content.match(/accounts_recruiter\s*=\s*\(([\s\S]*?)\)/);
    if (!blockMatch) continue;

    const blockBody = blockMatch[1];
    const pairRegex = /["']?([A-Za-z0-9_.-]+)\s*:\s*([A-Za-z0-9_.-]+)["']?/g;
    let match;
    while ((match = pairRegex.exec(blockBody)) !== null) {
      const accountId = match[1].trim().toLowerCase();
      const recruiterName = match[2].trim();
      const recruiterKey = recruiterName.toLowerCase();

      if (!accountId || !recruiterName) continue;

      if (!accountToRecruiter.has(accountId)) {
        accountToRecruiter.set(accountId, recruiterName);
        if (!recruiterAccountCounts.has(recruiterKey)) {
          recruiterAccountCounts.set(recruiterKey, {
            name: recruiterName,
            trackedCount: 0,
            accounts: []
          });
        }
        const entry = recruiterAccountCounts.get(recruiterKey);
        entry.trackedCount += 1;
        entry.accounts.push(accountId);
      }
    }
    break; // Stop after reading the first found secret.cfg
  }

  return { accountToRecruiter, recruiterAccountCounts };
}

/**
 * Computes the optimal Raid Class Split for any recruiter pool size N
 * using the 30-500 Recruit Class Scaling Matrix from Sheet 1.
 */
function getTargetClassSplit(poolSize) {
  const n = Math.max(1, Number(poolSize) || 1);

  for (const anchor of CLASS_SCALING_ANCHORS) {
    if (n === anchor.poolSize) {
      return { ...anchor.split };
    }
  }

  // Small pools (< 30 tracked accounts): scale proportionally from the 30-recruit baseline
  if (n < 30) {
    let saboteur = Math.max(1, Math.round(n * (5 / 30)));
    let doctor = n >= 4 ? Math.max(1, Math.round(n * (4 / 30))) : 0;
    let comms_officer = n < 20 ? 1 : 2;
    let scout = n < 5 ? 0 : n < 12 ? 1 : 2;
    let munitions = Math.round(n * (2 / 30));
    let pilot = Math.round(n * (2 / 30));
    const spy = 0;

    let used = saboteur + doctor + comms_officer + scout + munitions + pilot;

    // Trim lowest-priority roles if total exceeds very small N (e.g. N = 1..5)
    while (used > n && pilot > 0) {
      pilot -= 1;
      used -= 1;
    }
    while (used > n && munitions > 0) {
      munitions -= 1;
      used -= 1;
    }
    while (used > n && scout > 0) {
      scout -= 1;
      used -= 1;
    }
    while (used > n && comms_officer > 0) {
      comms_officer -= 1;
      used -= 1;
    }
    while (used > n && doctor > 0) {
      doctor -= 1;
      used -= 1;
    }

    const soldier = Math.max(0, n - used);
    return {
      saboteur,
      doctor,
      comms_officer,
      soldier,
      munitions,
      scout,
      pilot,
      spy
    };
  }

  // Large pools (> 500 tracked accounts)
  if (n > 500) {
    const saboteur = Math.round(n * 0.13);
    const doctor = Math.round(n * 0.136);
    const comms_officer = 4;
    const scout = 4;
    const munitions = Math.round(n * 0.08);
    const pilot = Math.round(n * 0.064);
    const spy = 0;
    const soldier = Math.max(
      0,
      n - (saboteur + doctor + comms_officer + scout + munitions + pilot)
    );
    return {
      saboteur,
      doctor,
      comms_officer,
      soldier,
      munitions,
      scout,
      pilot,
      spy
    };
  }

  // Linear interpolation between the two surrounding 30-500 table anchors
  for (let i = 0; i < CLASS_SCALING_ANCHORS.length - 1; i += 1) {
    const a1 = CLASS_SCALING_ANCHORS[i];
    const a2 = CLASS_SCALING_ANCHORS[i + 1];

    if (n > a1.poolSize && n < a2.poolSize) {
      const ratio = (n - a1.poolSize) / (a2.poolSize - a1.poolSize);
      const saboteur = Math.round(
        a1.split.saboteur + ratio * (a2.split.saboteur - a1.split.saboteur)
      );
      const doctor = Math.round(
        a1.split.doctor + ratio * (a2.split.doctor - a1.split.doctor)
      );
      const comms_officer = Math.round(
        a1.split.comms_officer +
          ratio * (a2.split.comms_officer - a1.split.comms_officer)
      );
      const munitions = Math.round(
        a1.split.munitions + ratio * (a2.split.munitions - a1.split.munitions)
      );
      const scout = Math.min(
        4,
        Math.round(a1.split.scout + ratio * (a2.split.scout - a1.split.scout))
      );
      const pilot = Math.round(
        a1.split.pilot + ratio * (a2.split.pilot - a1.split.pilot)
      );
      const spy = 0;
      const soldier = Math.max(
        0,
        n - (saboteur + doctor + comms_officer + munitions + scout + pilot)
      );

      return {
        saboteur,
        doctor,
        comms_officer,
        soldier,
        munitions,
        scout,
        pilot,
        spy
      };
    }
  }

  return { ...CLASS_SCALING_ANCHORS[0].split };
}

/**
 * Extracts a soldier's unlocked skill keys and current Role specialization (if any)
 */
function inspectSoldierLoadout(soldier) {
  const skills = Array.isArray(soldier?.skills) ? soldier.skills : [];
  const skillKeys = new Set();
  const skillNamesByKey = new Map();
  const ownedRoles = [];
  const ownedWeapons = [];
  const ownedPrimaryWeapons = [];
  const ownedBackupWeapons = [];

  for (const s of skills) {
    const key = s?.key ? normalizeKey(s.key) : normalizeKey(s?.name || s);
    const name = typeof s === 'string' ? s : s?.name || key;
    if (!key) continue;

    skillKeys.add(key);
    skillNamesByKey.set(key, name);

    if (ROLE_KEYS.includes(key) || s?.type === 'Role') {
      ownedRoles.push(key);
    }

    if (
      s?.type === 'Weapon' ||
      WEAPON_GROUPS.reloadMandatory.includes(key) ||
      WEAPON_GROUPS.shotguns.includes(key) ||
      WEAPON_GROUPS.snipers.includes(key) ||
      WEAPON_GROUPS.bruiserSmgsRifles.includes(key) ||
      WEAPON_GROUPS.explosiveLaunchers.includes(key) ||
      WEAPON_GROUPS.backupSidearms.includes(key)
    ) {
      if (key !== 'knife') {
        ownedWeapons.push(key);
        if (WEAPON_GROUPS.backupSidearms.includes(key)) {
          ownedBackupWeapons.push(key);
        } else {
          ownedPrimaryWeapons.push(key);
        }
      }
    }
  }

  return {
    skillKeys,
    skillNamesByKey,
    ownedRoles,
    currentRole: ownedRoles[0] || null,
    ownedWeapons,
    ownedPrimaryWeapons,
    ownedBackupWeapons,
    weaponCount: ownedWeapons.length
  };
}

/**
 * Detects a soldier's combat archetype from their Lv. 6 role, unlocked skills,
 * and highest-tier unlocked weapon (instead of getting locked onto a starter Favourite Weapon).
 */
function detectSoldierArchetype(soldier) {
  const loadout = inspectSoldierLoadout(soldier);
  const favWeaponKey = normalizeKey(soldier?.aiConfig?.favouriteWeapon || '');

  // Global Specialists & Medics use the specialist archetype
  if (
    loadout.ownedRoles.some((r) =>
      ['saboteur', 'comms_officer', 'doctor', 'scout'].includes(r)
    )
  ) {
    return ARCHETYPES[6];
  }

  // Munitions role prioritizes Explosive / AoE Demolitions
  if (loadout.ownedRoles.includes('munitions') || loadout.skillKeys.has('munitions')) {
    return ARCHETYPES[5];
  }

  // [UPDATED] Rank all owned weapons + selectable weaponOptions by WEAPON_PRIORITY_TIER_LIST
  // so a newly unlocked top-tier weapon (e.g. Minigun, CK-Magellan) overrides an old starter Favorite Weapon.
  const candidateWeaponKeys = new Set(loadout.ownedWeapons);
  for (const opt of soldier?.weaponOptions || []) {
    if (String(opt.value) !== '-1') {
      const k = normalizeKey(opt.name);
      if (k && k !== 'none') candidateWeaponKeys.add(k);
    }
  }

  const rankedWeapons = Array.from(candidateWeaponKeys).sort(
    (a, b) => getWeaponPriorityRank(a) - getWeaponPriorityRank(b)
  );

  for (const weaponKey of rankedWeapons) {
    for (const arch of ARCHETYPES) {
      if (arch.primaryWeapons.includes(weaponKey)) {
        return arch;
      }
    }
  }

  // Fallback to currently set Favourite Weapon if no skill/option matched
  if (favWeaponKey) {
    for (const arch of ARCHETYPES) {
      if (arch.primaryWeapons.includes(favWeaponKey)) {
        return arch;
      }
    }
  }

  return ARCHETYPES[1]; // Default: Armor-Piercing Mid-Range Bruiser
}

/**
 * [UPDATED] Picks the highest-tier unlocked weapon from form#config select[name="weapon"]
 * using WEAPON_PRIORITY_TIER_LIST so troopers never waste opening turns on starter guns.
 */
function pickBestWeaponOption(soldier, archetype) {
  const options = (soldier?.weaponOptions || []).filter(
    (opt) => String(opt.value) !== '-1' && normalizeKey(opt.name) !== 'none'
  );
  if (options.length === 0) {
    return { value: '-1', name: 'None' };
  }

  // 1. Sort all unlocked weapons by WEAPON_PRIORITY_TIER_LIST rank (lowest index = best weapon)
  const rankedOptions = [...options].sort((a, b) => {
    const rankDiff = getWeaponPriorityRank(a.name) - getWeaponPriorityRank(b.name);
    if (rankDiff !== 0) return rankDiff;

    // Tie-breaker: prefer archetype primary weapon, then backup weapon
    const aKey = normalizeKey(a.name);
    const bKey = normalizeKey(b.name);
    const aPrimary = archetype?.primaryWeapons?.includes(aKey) ? 0 : 1;
    const bPrimary = archetype?.primaryWeapons?.includes(bKey) ? 0 : 1;
    if (aPrimary !== bPrimary) return aPrimary - bPrimary;

    const aBackup = archetype?.backupWeapons?.includes(aKey) ? 0 : 1;
    const bBackup = archetype?.backupWeapons?.includes(bKey) ? 0 : 1;
    return aBackup - bBackup;
  });

  // Return the highest-ranked known weapon
  if (getWeaponPriorityRank(rankedOptions[0].name) < WEAPON_PRIORITY_TIER_LIST.length) {
    return rankedOptions[0];
  }

  // 2. Fallback for any unrecognized custom weapon name: first non-Pistol/non-Knife option
  const nonStarter = options.find(
    (opt) => !['pistol', 'knife'].includes(normalizeKey(opt.name))
  );
  return nonStarter || options[0];
}

/**
 * [ADDED] Resolves the optimal Fighting Style (Hunter / Standard / Defender) for a soldier.
 * Rules:
 *  - Defender is kept ONLY for:
 *      1) Long-range snipers (when equipped with a sniper rifle), OR
 *      2) Rocket troopers who do NOT have Infernal Tube (or any rocket launcher with < 3 total rockets).
 *         (i.e. Bazooka M25 with 6 total rockets qualifies for Defender; Infernal Tube (1),
 *          Bazooka M1 (2), and Rocket Launcher (2) are forced to Standard.)
 *  - Close-Range Shock shotgunners keep Hunter when using a shotgun.
 *  - Everyone else (including Combat Medics / Global Specialists) uses Standard.
 */
function resolveFightingStyle(soldier, archetype, chosenWeapon) {
  const loadout = inspectSoldierLoadout(soldier);
  const chosenKey = normalizeKey(chosenWeapon?.name || '');

  // Collect all rocket launchers the soldier owns (from skills + weaponOptions)
  const ownedLaunchers = new Set(
    loadout.ownedWeapons.filter((w) => WEAPON_GROUPS.explosiveLaunchers.includes(w))
  );
  for (const opt of soldier?.weaponOptions || []) {
    if (String(opt.value) !== '-1') {
      const k = normalizeKey(opt.name);
      if (WEAPON_GROUPS.explosiveLaunchers.includes(k)) {
        ownedLaunchers.add(k);
      }
    }
  }

  // 1. Long-range sniper -> Keep Defender
  if (WEAPON_GROUPS.snipers.includes(chosenKey)) {
    return 'Defender';
  }

  // 2. Rocket trooper -> Keep Defender ONLY if they have a launcher with >= 3 total rockets
  //    AND do NOT carry Infernal Tube or any launcher with < 3 total rockets
  if (
    WEAPON_GROUPS.explosiveLaunchers.includes(chosenKey) ||
    archetype?.id === 'explosive_demolitions'
  ) {
    const hasLowAmmoOrInfernalLauncher =
      ownedLaunchers.has('infernal_tube') ||
      Array.from(ownedLaunchers).some(
        (launcherKey) => (ROCKET_LAUNCHER_TOTAL_ROCKETS[launcherKey] ?? 0) < 3
      );

    const chosenTotalRockets = ROCKET_LAUNCHER_TOTAL_ROCKETS[chosenKey] ?? 0;

    if (chosenTotalRockets >= 3 && !hasLowAmmoOrInfernalLauncher) {
      return 'Defender';
    }
    return 'Standard';
  }

  // 3. Close-Range Shock shotgunners -> Keep Hunter when equipped with a shotgun
  if (
    archetype?.id === 'close_range_shock' &&
    WEAPON_GROUPS.shotguns.includes(chosenKey)
  ) {
    return 'Hunter';
  }

  // 4. Default for Combat Medics, Global Specialists, Gunners, Bruisers, Assassins -> Standard
  return 'Standard';
}

/**
 * Computes the optimal 5 AI Config dropdown values (POST params + display labels) for a soldier
 */
function computeOptimalAiConfig(soldier) {
  const archetype = detectSoldierArchetype(soldier);
  const chosenWeapon = pickBestWeaponOption(soldier, archetype);

  const locLabel = archetype.recommendedTarget || 'Anywhere!';
  const targetLabel = archetype.recommendedVictim || 'The closest';
  // [UPDATED] Dynamically resolve Fighting Style based on sniper / rocket count rules
  const moveLabel = resolveFightingStyle(soldier, archetype, chosenWeapon);
  const ttypeLabel = archetype.recommendedPriorityTarget || 'Default';

  return {
    archetypeId: archetype.id,
    archetype: archetype.name,
    configActionUrl: soldier?.configActionUrl || null,
    params: {
      weapon: String(chosenWeapon.value),
      loc: AI_CONFIG_OPTION_VALUES.loc[locLabel] ?? '-1',
      target: AI_CONFIG_OPTION_VALUES.target[targetLabel] ?? '0',
      move: AI_CONFIG_OPTION_VALUES.move[moveLabel] ?? '1',
      ttype: AI_CONFIG_OPTION_VALUES.ttype[ttypeLabel] ?? '-1'
    },
    labels: {
      favouriteWeapon: chosenWeapon.name,
      favouriteTarget: locLabel === 'Gutshot' ? 'Gutshot (nasty)' : locLabel,
      preferredVictim: targetLabel,
      fightingStyle: moveLabel,
      priorityTarget: ttypeLabel
    }
  };
}

/**
 * Builds the Raid composition metrics for a single Recruiter group
 */
function buildRecruiterPoolMetrics(recruiterName, recruiterAccounts, configuredTrackedCount) {
  const counts = {
    saboteur: 0,
    doctor: 0,
    comms_officer: 0,
    soldier: 0,
    munitions: 0,
    scout: 0,
    pilot: 0,
    spy: 0,
    unspecialized: 0
  };

  let globalSabotagePower = 0;
  let globalCommsPoints = 0;

  for (const acc of recruiterAccounts) {
    const soldier = acc?.firstSoldier;
    if (!soldier) continue;

    const lvl = Number(soldier.level) || 1;
    const loadout = inspectSoldierLoadout(soldier);

    if (loadout.ownedRoles.length === 0) {
      counts.unspecialized += 1;
    }

    for (const roleKey of loadout.ownedRoles) {
      if (counts[roleKey] !== undefined) {
        counts[roleKey] += 1;
      }
    }

    if (loadout.skillKeys.has('saboteur')) {
      globalSabotagePower += Math.max(0, lvl - 5);
    }
    if (loadout.skillKeys.has('comms_officer') && lvl >= 6) {
      globalCommsPoints += 5 + Math.max(0, lvl - 6);
    }
  }

  const poolSize = Math.max(
    Number(configuredTrackedCount) || 0,
    recruiterAccounts.length,
    1
  );
  const targets = getTargetClassSplit(poolSize);

  const deficits = {};
  for (const roleKey of ROLE_KEYS) {
    deficits[roleKey] = Math.max(0, (targets[roleKey] || 0) - (counts[roleKey] || 0));
  }

  const waveDeploymentCapacity = Math.min(20, 4 + counts.scout);

  // Ordered priority queue of classes this recruiter currently needs most
  const priorityNeeds = ROLE_KEYS.filter((k) => k !== 'spy' && deficits[k] > 0)
    .sort((a, b) => {
      const prioDiff = ROLE_METADATA[b].raidPriority - ROLE_METADATA[a].raidPriority;
      if (prioDiff !== 0) return prioDiff;
      return deficits[b] - deficits[a];
    })
    .map((k) => ({
      key: k,
      name: ROLE_METADATA[k].name,
      current: counts[k],
      target: targets[k],
      deficit: deficits[k],
      raidPriority: ROLE_METADATA[k].raidPriority
    }));

  return {
    recruiter: recruiterName || 'Unassigned',
    trackedPoolSize: poolSize,
    parsedAccountsCount: recruiterAccounts.length,
    waveDeploymentCapacity,
    counts,
    targets,
    deficits,
    priorityNeeds,
    scouts: counts.scout,
    scoutStatus:
      counts.scout < targets.scout
        ? `Need ${targets.scout - counts.scout} more Scout(s) (${counts.scout}/${targets.scout})`
        : counts.scout <= 4
          ? `Optimal (${counts.scout}/${targets.scout} Scouts = ${waveDeploymentCapacity} troops/wave)`
          : 'WARNING: 5+ Scouts causes AoE & Friendly-Fire wipeouts!',
    saboteurs: counts.saboteur,
    globalSabotagePower,
    commsOfficers: counts.comms_officer,
    globalCommsPoints,
    commsBugAlert:
      globalCommsPoints >= 10 && globalCommsPoints < 20
        ? `WARNING: Retreat Bug Zone (${globalCommsPoints} Comms pts). Stay <10 or push to 20+ for Propaganda!`
        : globalCommsPoints >= 20
          ? `Propaganda Active (${globalCommsPoints} Comms pts)`
          : `Safe Mode (${globalCommsPoints} Comms pts < 10)`,
    doctors: counts.doctor,
    munitions: counts.munitions,
    soldiers: counts.soldier,
    pilots: counts.pilot,
    spies: counts.spy
  };
}

/**
 * Evaluates all Recruiter Raid Pools across all accounts + secret.cfg assignments
 */
function evaluateRecruiterPools(accounts = []) {
  const { accountToRecruiter, recruiterAccountCounts } =
    readRecruiterAssignmentsFromSecretCfg();

  const groupedAccounts = new Map();

  for (const acc of accounts) {
    if (!acc) continue;
    const accIdLower = String(acc.id || '').toLowerCase();
    const resolvedRecruiter =
      acc.recruiter || accountToRecruiter.get(accIdLower) || 'Unassigned';
    const recKey = resolvedRecruiter.toLowerCase();

    if (!groupedAccounts.has(recKey)) {
      groupedAccounts.set(recKey, {
        recruiterName: resolvedRecruiter,
        list: []
      });
    }
    groupedAccounts.get(recKey).list.push(acc);
  }

  const poolsByRecruiter = {};
  for (const [recKey, group] of groupedAccounts.entries()) {
    const secretEntry = recruiterAccountCounts.get(recKey);
    const configuredCount = secretEntry ? secretEntry.trackedCount : group.list.length;
    poolsByRecruiter[recKey] = buildRecruiterPoolMetrics(
      group.recruiterName,
      group.list,
      configuredCount
    );
  }

  return poolsByRecruiter;
}

/**
 * Backward-compatible collective pool evaluator
 */
function evaluateCollectiveRaidPool(accounts = []) {
  return buildRecruiterPoolMetrics('All Accounts', accounts, accounts.length);
}

/**
 * Scores a single upgrade option using:
 *   TIER 1 (Top Priority): Recruiter Raid Class Composition (Score 200..350 or Block -150..-300)
 *   TIER 2 (Secondary Priority): Individual Soldier Capabilities & Weapon Synergies (Score -120..195)
 */
function scoreUpgradeOption(opt, soldier, loadout, archetype, recruiterPool) {
  const optKey = normalizeKey(opt?.key || opt?.name);
  const optName = opt?.name || optKey;
  const soldierLevel = Number(soldier?.level) || 1;
  const isRoleOption = ROLE_KEYS.includes(optKey) || opt?.type === 'Role';

  let score = 0;
  let tier = 'TIER_2_INDIVIDUAL';
  let tierLabel = 'Tier 2: Individual Capability';
  const reasons = [];

  // =========================================================================
  // TIER 1: RECRUITER RAID CLASS COMPOSITION (TOP PRIORITY)
  // =========================================================================
  if (isRoleOption && ROLE_METADATA[optKey]) {
    const meta = ROLE_METADATA[optKey];
    const currentCount = recruiterPool?.counts?.[optKey] ?? 0;
    const targetCount = recruiterPool?.targets?.[optKey] ?? 0;
    const deficit = recruiterPool?.deficits?.[optKey] ?? 0;
    const recName = recruiterPool?.recruiter || 'Unassigned';
    const poolSize = recruiterPool?.trackedPoolSize || 1;

    // 1. Already owns a different specialization helmet
    if (loadout.currentRole && loadout.currentRole !== optKey) {
      score -= 180;
      tier = 'TIER_1_BLOCKED';
      tierLabel = 'Tier 1: Class Conflict';
      reasons.push(
        `Soldier already holds the ${ROLE_METADATA[loadout.currentRole]?.name || loadout.currentRole} specialization.`
      );
      return { score, tier, tierLabel, reasons };
    }

    // 2. SPY: Strictly 0 in Raids across all pool sizes
    if (optKey === 'spy') {
      score -= 260;
      tier = 'TIER_1_BLOCKED';
      tierLabel = 'Tier 1: Raid Class Block (0 Spies)';
      reasons.push(
        `TIER 1 BLOCK: Spy is F-Tier in Raids (0/${targetCount} target for ${recName}). Infiltrates early waves alone and dies or triggers allied friendly fire.`
      );
      return { score, tier, tierLabel, reasons };
    }

    // 3. SCOUT: Hard Cap at 2-4 Scouts (never 5+)
    if (optKey === 'scout') {
      if (currentCount >= 4 || deficit <= 0) {
        score -= 220;
        tier = 'TIER_1_BLOCKED';
        tierLabel = 'Tier 1: Scout Hard Cap Reached';
        reasons.push(
          `TIER 1 BLOCK: Recruiter '${recName}' already has ${currentCount}/${targetCount} Scouts (Hard Cap 4 = 8 troops/wave). Exceeding target causes AoE & Friendly-Fire wipeouts.`
        );
        return { score, tier, tierLabel, reasons };
      }

      score = 200 + meta.raidPriority * 12 + Math.min(25, deficit * 5);
      tier = 'TIER_1_CLASS_NEED';
      tierLabel = `Tier 1: Recruiter Class Priority (${currentCount}/${targetCount})`;
      reasons.push(
        `TIER 1 RECRUITER NEED: '${recName}' (${poolSize} recruits) needs Scout (${currentCount}/${targetCount}) for +1 Wave Deployment. Place at ${meta.queueSlot}.`
      );
      return { score, tier, tierLabel, reasons };
    }

    // 4. COMMS. OFFICER: Check Hard Cap (4) and 10-19 Comms 'Retreat' Raid Bug
    if (optKey === 'comms_officer') {
      const addedCommsPts = Math.max(5, 5 + Math.max(0, soldierLevel - 6));
      const projectedComms = (recruiterPool?.globalCommsPoints || 0) + addedCommsPts;

      if (currentCount >= 4) {
        score -= 220;
        tier = 'TIER_1_BLOCKED';
        tierLabel = 'Tier 1: Comms Officer Hard Cap (4)';
        reasons.push(
          `TIER 1 BLOCK: Recruiter '${recName}' is already at the hard cap of 4 Comms. Officers (${currentCount}/${targetCount}).`
        );
        return { score, tier, tierLabel, reasons };
      }

      if (deficit <= 0) {
        if (projectedComms >= 10 && projectedComms < 20) {
          score -= 180;
          tier = 'TIER_1_BLOCKED';
          tierLabel = 'Tier 1: Comms Retreat Bug Guard';
          reasons.push(
            `TIER 1 BLOCK (Retreat Bug): Quota is full (${currentCount}/${targetCount}) and adding this officer pushes Comms to ${projectedComms} pts (10-19 Retreat bug deducts surviving Raid recruits!).`
          );
        } else {
          score -= 90;
          tier = 'TIER_1_QUOTA_FULL';
          tierLabel = `Tier 1: Comms Quota Full (${currentCount}/${targetCount})`;
          reasons.push(
            `Recruiter '${recName}' already meets Comms. Officer target (${currentCount}/${targetCount}).`
          );
        }
        return { score, tier, tierLabel, reasons };
      }

      score = 200 + meta.raidPriority * 12 + Math.min(25, deficit * 5);
      tier = 'TIER_1_CLASS_NEED';
      tierLabel = `Tier 1: Recruiter Class Priority (${currentCount}/${targetCount})`;
      const commsNote =
        projectedComms >= 10 && projectedComms < 20
          ? `Note: Pushes Comms to ${projectedComms} pts (10-19 Retreat bug zone) — level officers to reach 20+ Propaganda quickly.`
          : projectedComms >= 20
            ? `Unlocks 20+ Propaganda (${projectedComms} Comms pts)!`
            : `Stays in bug-free Safe Mode (${projectedComms} Comms pts < 10).`;
      reasons.push(
        `TIER 1 RECRUITER NEED: '${recName}' (${poolSize} recruits) needs Comms. Officer (${currentCount}/${targetCount}). ${commsNote}`
      );
      return { score, tier, tierLabel, reasons };
    }

    // 5. SABOTEUR, DOCTOR, SOLDIER, MUNITIONS, PILOT
    if (deficit > 0) {
      score = 200 + meta.raidPriority * 12 + Math.min(25, deficit * 5);
      tier = 'TIER_1_CLASS_NEED';
      tierLabel = `Tier 1: Recruiter Class Priority (${currentCount}/${targetCount})`;
      reasons.push(
        `TIER 1 RECRUITER NEED (Priority ${meta.raidPriority}/10): '${recName}' (${poolSize} tracked accounts) needs ${meta.name} (${currentCount}/${targetCount}, deficit: ${deficit}). ${meta.summary}`
      );
      return { score, tier, tierLabel, reasons };
    }

    // Quota for this specific class is already met
    if (optKey === 'saboteur') {
      // Stacking extra Saboteurs is still positive if no higher-deficit class is rolled
      score = 115;
      tier = 'TIER_1_OVERSTACK_OK';
      tierLabel = `Tier 1: Saboteur Quota Met (${currentCount}/${targetCount})`;
      reasons.push(
        `Recruiter '${recName}' has met base Saboteur target (${currentCount}/${targetCount}), but extra Saboteurs remain strong for late-Raid weapon blackout.`
      );
      return { score, tier, tierLabel, reasons };
    }

    if (optKey === 'soldier') {
      score = 105;
      tier = 'TIER_1_OVERSTACK_OK';
      tierLabel = `Tier 1: Soldier Backbone (${currentCount}/${targetCount})`;
      reasons.push(
        `Recruiter '${recName}' has ${currentCount}/${targetCount} Soldiers; Soldier helmet still grants +1 HP/lvl and caps headshot damage at 2.`
      );
      return { score, tier, tierLabel, reasons };
    }

    score = -45;
    tier = 'TIER_1_QUOTA_FULL';
    tierLabel = `Tier 1: ${meta.name} Quota Full (${currentCount}/${targetCount})`;
    reasons.push(
      `Recruiter '${recName}' already reached target for ${meta.name} (${currentCount}/${targetCount}). Prioritize unfilled classes or Tier 2 individual synergies.`
    );
    return { score, tier, tierLabel, reasons };
  }

  // =========================================================================
  // TIER 2: INDIVIDUAL SOLDIER CAPABILITIES & WEAPON SYNERGIES
  // =========================================================================

  // A. Mandatory Weapon-Specific Synergies (e.g. Minigun + Loader / Sturdy / Tail Gunner)
  if (optKey === 'loader') {
    const matchedMandatory = loadout.ownedWeapons.filter((w) =>
      WEAPON_GROUPS.reloadMandatory.includes(w)
    );
    if (matchedMandatory.length > 0) {
      const names = matchedMandatory.map((k) => loadout.skillNamesByKey.get(k) || k);
      score += 185;
      tierLabel = 'Tier 2: Mandatory Weapon + Loader Synergy';
      reasons.push(
        `MANDATORY WEAPON SYNERGY: Soldier carries ${names.join(', ')}. Loader starts the weapon loaded on Turn 1, eliminating wasted reload turns.`
      );
    } else if (loadout.ownedPrimaryWeapons.length > 0) {
      score += 110;
      reasons.push('Starts primary weapon loaded at the start of every Raid wave.');
    } else {
      score += 55;
      reasons.push('Pre-loads primary weapon once acquired.');
    }
  }

  if (optKey === 'sturdy') {
    const matchedHeavy = loadout.ownedWeapons.filter((w) =>
      WEAPON_GROUPS.heavyWeapons.includes(w)
    );
    if (matchedHeavy.length > 0) {
      const names = matchedHeavy.map((k) => loadout.skillNamesByKey.get(k) || k);
      score += 172;
      tierLabel = 'Tier 2: Heavy Weapon + Sturdy Synergy';
      reasons.push(
        `HEAVY WEAPON SYNERGY: Negates the -50% heavy weapon movement speed penalty on ${names.join(', ')} and grants +3 HP.`
      );
    } else {
      score += 95;
      reasons.push('S-Tier Survival Passive: Grants +3 base HP and negates heavy weapon slow.');
    }
  }

  if (optKey === 'tail_gunner') {
    const matchedMGs = loadout.ownedWeapons.filter((w) =>
      WEAPON_GROUPS.machineGuns.includes(w)
    );
    if (matchedMGs.length > 0) {
      const names = matchedMGs.map((k) => loadout.skillNamesByKey.get(k) || k);
      score += 168;
      tierLabel = 'Tier 2: Machine Gun + Tail Gunner Synergy';
      reasons.push(
        `MACHINE GUN SYNERGY: Adds +2 extra bursts per attack with ${names.join(', ')}.`
      );
    } else {
      score -= 50;
      reasons.push('Requires a Machine Gun (Minigun, Comanche Auto, HMG, or Gatling Gun) to function.');
    }
  }

  if (optKey === 'nimble_fingers') {
    const matchedShotgunsOrBruisers = loadout.ownedWeapons.filter(
      (w) =>
        WEAPON_GROUPS.shotguns.includes(w) ||
        ['thompson', 'famas'].includes(w)
    );
    if (matchedShotgunsOrBruisers.length > 0) {
      const names = matchedShotgunsOrBruisers.map(
        (k) => loadout.skillNamesByKey.get(k) || k
      );
      score += 162;
      tierLabel = 'Tier 2: Shotgun/Bruiser + Nimble Fingers Synergy';
      reasons.push(
        `WEAPON HANDLING SYNERGY: Operates 2x faster and loads 2 shells at once for ${names.join(', ')}.`
      );
    } else {
      score += 80;
      reasons.push('A+ Tier Weapon Handling: 2x reload operation speed.');
    }
  }

  if (optKey === 'cold_blooded') {
    const matchedAimWeapons = loadout.ownedWeapons.filter(
      (w) =>
        WEAPON_GROUPS.snipers.includes(w) ||
        WEAPON_GROUPS.machineGuns.includes(w) ||
        WEAPON_GROUPS.explosiveLaunchers.includes(w)
    );
    if (matchedAimWeapons.length > 0) {
      const names = matchedAimWeapons.map((k) => loadout.skillNamesByKey.get(k) || k);
      score += 156;
      tierLabel = 'Tier 2: Aim Speed + Weapon Synergy';
      reasons.push(`AIM SYNERGY: Aims 2x faster with ${names.join(', ')}.`);
    } else {
      score += 75;
      reasons.push('Doubles aiming speed (2x).');
    }
  }

  if (['twinoid', 'trigger_happy'].includes(optKey)) {
    const matchedBurst = loadout.ownedWeapons.filter((w) =>
      WEAPON_GROUPS.burstFireWeapons.includes(w)
    );
    if (matchedBurst.length > 0) {
      const names = matchedBurst.map((k) => loadout.skillNamesByKey.get(k) || k);
      score += optKey === 'twinoid' ? 160 : 148;
      tierLabel = 'Tier 2: Burst Rate Multiplier Synergy';
      reasons.push(
        `BURST SYNERGY: Multiplies turn damage output with ${names.join(', ')} (${
          optKey === 'twinoid' ? '+500 Init & acts twice/cycle' : '+1 burst per attack'
        }).`
      );
    } else {
      score += optKey === 'twinoid' ? 120 : 95;
      reasons.push(
        optKey === 'twinoid'
          ? 'A+ Tier Firing Rate: +500 Initiative and acts twice per cycle.'
          : 'A+ Tier Firing Rate: +1 burst per attack.'
      );
    }
  }

  if (['anatomy', 'heartbreaker', 'laser_sights', 'heat_sensor', 'vicious', 'unforgiving'].includes(optKey)) {
    const matchedCrit = loadout.ownedWeapons.filter((w) =>
      WEAPON_GROUPS.highCritWeapons.includes(w)
    );
    if (matchedCrit.length > 0) {
      const names = matchedCrit.map((k) => loadout.skillNamesByKey.get(k) || k);
      score += 152;
      tierLabel = 'Tier 2: Crit / Fatal Killshot Synergy';
      reasons.push(
        `CRIT SYNERGY: Boosts critical accuracy / Fatal Killshot rate with ${names.join(', ')}.`
      );
    } else if (archetype.coreSkills.includes(optKey)) {
      score += 95;
      reasons.push(`Core critical/aim skill for ${archetype.name}.`);
    }
  }

  if (['motorcycle', 'rush', 'charge'].includes(optKey)) {
    const matchedShotguns = loadout.ownedWeapons.filter((w) =>
      WEAPON_GROUPS.shotguns.includes(w)
    );
    if (matchedShotguns.length > 0) {
      const names = matchedShotguns.map((k) => loadout.skillNamesByKey.get(k) || k);
      score += 154;
      tierLabel = 'Tier 2: Shotgun Gap-Closer Synergy';
      reasons.push(
        `SHOCK HUNTER SYNERGY: Instant frontline gap-closer for ${names.join(', ')}.`
      );
    }
  }

  if (
    [
      'hydroshock_shells',
      'paralysing_shells',
      'armor_piercing_shells',
      'explosive_shells',
      'toxic_shells'
    ].includes(optKey)
  ) {
    const matchedAmmoGuns = loadout.ownedWeapons.filter(
      (w) =>
        WEAPON_GROUPS.shotguns.includes(w) ||
        WEAPON_GROUPS.bruiserSmgsRifles.includes(w) ||
        WEAPON_GROUPS.machineGuns.includes(w)
    );
    if (matchedAmmoGuns.length > 0) {
      const names = matchedAmmoGuns.map((k) => loadout.skillNamesByKey.get(k) || k);
      score += 138;
      tierLabel = 'Tier 2: Special Ammo + Multi-Hit Weapon Synergy';
      reasons.push(
        `SPECIAL AMMO SYNERGY: Multi-pellet/burst hits from ${names.join(', ')} apply crowd-control or armor-piercing.`
      );
    } else {
      score += 65;
      reasons.push('Special ammunition modifier.');
    }
  }

  if (['saviour', 'healing_grenade', 'hurry', 'first_aid'].includes(optKey)) {
    if (loadout.skillKeys.has('doctor')) {
      score += 164;
      tierLabel = 'Tier 2: Field Doctor Sustain Synergy';
      reasons.push(
        'COMBAT MEDIC SYNERGY: Directly amplifies Doctor healing, reviving, and skill frequency across Raid waves.'
      );
    }
  }

  if (['grenade_benny', 'king_of_boules'].includes(optKey)) {
    if (
      loadout.skillKeys.has('munitions') ||
      loadout.ownedWeapons.some((w) => WEAPON_GROUPS.explosiveLaunchers.includes(w))
    ) {
      score += 150;
      tierLabel = 'Tier 2: Demolitions / Munitions Synergy';
      reasons.push('DEMOLITIONS SYNERGY: High-damage AoE explosive synergy with Munitions/Launchers.');
    }
  }

  // B. Universal S+ Milestone Skills (Smart & Suspicious)
  if (optKey === 'smart') {
    score += soldierLevel <= 5 ? 180 : soldierLevel <= 8 ? 145 : 115;
    tierLabel = 'Tier 2: S+ Universal Milestone (Smart)';
    reasons.push(
      'S+ Tier Universal Rule #1: Increases level-up choices from 2 to 3 every level and grants Propaganda/Bait/Clown immunity.'
    );
  }

  if (optKey === 'suspicious') {
    score += 176;
    tierLabel = 'Tier 2: S+ Raid MVP (Suspicious)';
    reasons.push(
      'S+ Tier Universal Rule #3 (Raid MVP): 100% immune to enemy Sabotage AND allied Friendly Fire (+200 Init per enemy Spy).'
    );
  }

  // C. Strict 2-Weapon Rule Enforcement (1 Primary + 1 Backup)
  const isWeaponOption =
    opt?.type === 'Weapon' ||
    WEAPON_GROUPS.reloadMandatory.includes(optKey) ||
    WEAPON_GROUPS.shotguns.includes(optKey) ||
    WEAPON_GROUPS.snipers.includes(optKey) ||
    WEAPON_GROUPS.bruiserSmgsRifles.includes(optKey) ||
    WEAPON_GROUPS.explosiveLaunchers.includes(optKey) ||
    WEAPON_GROUPS.backupSidearms.includes(optKey);

  if (isWeaponOption && optKey !== 'knife') {
    const isBackupSidearm = WEAPON_GROUPS.backupSidearms.includes(optKey);

    if (loadout.weaponCount >= 2) {
      const currentWeaponNames = loadout.ownedWeapons.map(
        (k) => loadout.skillNamesByKey.get(k) || k
      );
      score -= 130;
      tier = 'TIER_2_WEAPON_CAP_PENALTY';
      tierLabel = 'Tier 2: 2-Weapon Rule Warning';
      reasons.push(
        `AVOID (2-Weapon Rule): Soldier already carries ${loadout.weaponCount} weapons (${currentWeaponNames.join(', ')}). Adding a 3rd weapon triggers fatal AI weapon-swap loops.`
      );
    } else if (loadout.ownedPrimaryWeapons.length === 0 && !isBackupSidearm) {
      // Soldier needs a primary weapon
      const isTopTierPrimary = [
        'minigun',
        'comanche_auto',
        'heavy_machine_gun',
        'sparrowhawk',
        'mos_teck',
        'ump',
        'thompson',
        'famas',
        'pump_action_shotgun',
        'semi_auto_shotgun',
        'bazooka_m25',
        'infernal_tube'
      ].includes(optKey);

      score += isTopTierPrimary ? 155 : 125;
      tierLabel = 'Tier 2: Primary Weapon Acquisition';
      reasons.push(
        `PRIMARY WEAPON: Soldier has no primary gun yet. ${optName} establishes a strong combat archetype.`
      );
    } else if (
      loadout.ownedPrimaryWeapons.length === 1 &&
      loadout.ownedBackupWeapons.length === 0 &&
      (isBackupSidearm || archetype.backupWeapons.includes(optKey))
    ) {
      const isArchetypeBackup = archetype.backupWeapons.includes(optKey);
      score += isArchetypeBackup ? 132 : 108;
      tierLabel = 'Tier 2: 2-Weapon Rule Backup Sidearm';
      reasons.push(
        `2-WEAPON RULE SYNERGY: Pairs primary weapon with ${optName} as backup sidearm to prevent enemy Saboteur disarm.`
      );
    } else if (loadout.ownedPrimaryWeapons.length >= 1 && !isBackupSidearm) {
      // Second primary weapon is acceptable only if it acts as close-range backup (e.g. FAMAS/Shotgun)
      if (archetype.backupWeapons.includes(optKey)) {
        score += 118;
        reasons.push(`Recommended backup weapon for ${archetype.name}.`);
      } else {
        score -= 25;
        reasons.push(
          'Soldier already owns a Primary Weapon; prefer a Backup Sidearm (Revolver, Desert Eagle, Beretta) or synergy skill.'
        );
      }
    }
  }

  // D. Pilot Vehicle Skills (Light Tank, Heavy Tank, Helicopter, Fighter Jet)
  if (['light_tank', 'heavy_tank', 'helicopter', 'fighter_jet'].includes(optKey)) {
    if (loadout.skillKeys.has('pilot')) {
      if (optKey === 'heavy_tank' && (recruiterPool?.waveDeploymentCapacity || 4) < 8) {
        score += 75;
        reasons.push(
          `Pilot Vehicle: Heavy Tank requires 8 Wave Deployment Capacity (4 Scouts); recruiter currently has ${recruiterPool?.waveDeploymentCapacity || 4}.`
        );
      } else {
        score += 155;
        tierLabel = 'Tier 2: Pilot + Vehicle Synergy';
        reasons.push(`PILOT SYNERGY: Soldier has Pilot helmet and can deploy ${optName}.`);
      }
    } else {
      score -= 90;
      reasons.push(`Requires the Pilot specialization helmet to deploy ${optName}.`);
    }
  }

  // E. Core Survival & Speed Passives + Archetype Fallback
  if (score === 0) {
    if (optKey === 'hard_boiled') {
      score += 118;
      reasons.push(
        'S-Tier Raid Survival: Negates all injury penalties from crippled limbs across multi-wave Raids.'
      );
    } else if (optKey === 'invincible') {
      score += 112;
      reasons.push('S-Tier Survival: Grants immunity to enemy Fatal Killshots.');
    } else if (optKey === 'bulletproof_vest') {
      score += 104;
      reasons.push('S-Tier Survival: Reduces projectile damage taken across Raid waves.');
    } else if (['dodger', 'tuck_n_roll', 'survivor', 'heavyweight'].includes(optKey)) {
      score += 92;
      reasons.push(`High-value survivability passive for ${archetype.name}.`);
    } else if (['on_point', 'sprinter', 'adrenaline', 'frenetic', 'hyperactive'].includes(optKey)) {
      score += 96;
      reasons.push('A+ Tier Speed/Initiative: Act before enemy wave fires.');
    } else if (archetype.coreSkills.includes(optKey)) {
      score += 88;
      reasons.push(`Direct synergy with ${archetype.name} build matrix.`);
    } else {
      score += 25;
      reasons.push(`Standard tactical utility for ${archetype.name}.`);
    }
  } else if (
    archetype.coreSkills.includes(optKey) &&
    score > 0 &&
    !reasons.some((r) => r.includes(archetype.name))
  ) {
    score += 15;
    reasons.push(`Matches ${archetype.name} core skill matrix.`);
  }

  return { score, tier, tierLabel, reasons };
}

/**
 * Recommends the best upgrade for a soldier using:
 *   1. Recruiter's Raid Class Composition (Tier 1)
 *   2. Individual Soldier Capabilities & Weapon Synergies (Tier 2)
 */
function recommendBestUpgrade(soldier, recruiterPool) {
  const archetype = detectSoldierArchetype(soldier);
  const loadout = inspectSoldierLoadout(soldier);
  // [UPDATED] Use computed optimal weapon & fighting style in advice output
  const optimalConfig = computeOptimalAiConfig(soldier);
  const resolvedStyle = optimalConfig.labels.fightingStyle;
  const options = Array.isArray(soldier?.availableUpgrades)
    ? soldier.availableUpgrades
    : [];

  const recSummary = recruiterPool
    ? `Recruiter '${recruiterPool.recruiter}' Pool (${recruiterPool.trackedPoolSize} tracked): ${recruiterPool.saboteurs}/${recruiterPool.targets?.saboteur ?? '?'} Saboteurs (${recruiterPool.globalSabotagePower} disarm pts), ${recruiterPool.doctors}/${recruiterPool.targets?.doctor ?? '?'} Doctors, ${recruiterPool.scouts}/${recruiterPool.targets?.scout ?? '?'} Scouts, ${recruiterPool.commsOfficers}/${recruiterPool.targets?.comms_officer ?? '?'} Comms (${recruiterPool.globalCommsPoints} pts).`
    : 'Recruiter pool metrics unavailable.';

  const topNeedsText =
    recruiterPool?.priorityNeeds?.length > 0
      ? `Top Recruiter Class Deficits: ${recruiterPool.priorityNeeds
          .slice(0, 4)
          .map((n) => `${n.name} (${n.current}/${n.target})`)
          .join(' -> ')}`
      : 'All specialist class targets met for this recruiter.';

  if (options.length === 0) {
    return {
      recommendedOptionId: null,
      recommendedOptionKey: null,
      recommendedSkill: null,
      decisionTier: 'PENDING_ROLL',
      decisionTierLabel: 'Awaiting /t/0 Upgrade Roll',
      archetype: {
        id: archetype.id,
        name: archetype.name,
        recommendedStyle: resolvedStyle,
        recommendedTarget: archetype.recommendedTarget,
        recommendedWeapon: optimalConfig.labels.favouriteWeapon
      },
      recruiterSummary: recSummary,
      topClassNeeds: topNeedsText,
      scoredOptions: [],
      reasons: [
        `Detected Archetype: ${archetype.name} (AI Weapon: ${optimalConfig.labels.favouriteWeapon}, Style: ${resolvedStyle}, Target: ${archetype.recommendedTarget}).`,
        topNeedsText,
        recSummary
      ]
    };
  }

  const scoredOptions = options.map((opt) => {
    const evaluation = scoreUpgradeOption(
      opt,
      soldier,
      loadout,
      archetype,
      recruiterPool
    );
    return {
      id: opt.id,
      key: opt.key,
      name: opt.name,
      type: opt.type,
      color: opt.color,
      selectUrl: opt.selectUrl || null,
      score: evaluation.score,
      tier: evaluation.tier,
      tierLabel: evaluation.tierLabel,
      reasons: evaluation.reasons
    };
  });

  scoredOptions.sort((a, b) => b.score - a.score);
  const best = scoredOptions[0];

  return {
    recommendedOptionId: best.id,
    recommendedOptionKey: best.key,
    recommendedSkill: best.name,
    recommendedScore: best.score,
    decisionTier: best.tier,
    decisionTierLabel: best.tierLabel,
    archetype: {
      id: archetype.id,
      name: archetype.name,
      recommendedStyle: resolvedStyle,
      recommendedTarget: archetype.recommendedTarget,
      recommendedWeapon: optimalConfig.labels.favouriteWeapon
    },
    recruiterSummary: recSummary,
    topClassNeeds: topNeedsText,
    scoredOptions,
    reasons: [
      ...best.reasons,
      `Archetype AI Config: Weapon -> ${optimalConfig.labels.favouriteWeapon} | Fighting Style -> ${resolvedStyle} | Target -> ${archetype.recommendedTarget}.`,
      topNeedsText
    ]
  };
}

/**
 * Evaluates all accounts grouped by their assigned Recruiter in secret.cfg
 * and attaches `recruiterRaidPool` and `firstSoldier.aiAdvice` to every account.
 */
function attachAiAdviceToAccounts(accounts = []) {
  if (!Array.isArray(accounts)) return [];

  const poolsByRecruiter = evaluateRecruiterPools(accounts);

  for (const acc of accounts) {
    if (!acc || !acc.firstSoldier) continue;
    const recKey = String(acc.recruiter || 'Unassigned').toLowerCase();
    const recruiterPool =
      poolsByRecruiter[recKey] ||
      buildRecruiterPoolMetrics(acc.recruiter || 'Unassigned', [acc], 1);

    acc.recruiterRaidPool = recruiterPool;
    acc.firstSoldier.aiAdvice = recommendBestUpgrade(
      acc.firstSoldier,
      recruiterPool
    );
  }

  return accounts;
}

module.exports = {
  AI_CONFIG_OPTION_VALUES,
  WEAPON_PRIORITY_TIER_LIST,
  ROCKET_LAUNCHER_TOTAL_ROCKETS,
  CLASS_SCALING_ANCHORS,
  ROLE_METADATA,
  ARCHETYPES,
  getTargetClassSplit,
  getWeaponPriorityRank,
  resolveFightingStyle,
  detectSoldierArchetype,
  pickBestWeaponOption,
  computeOptimalAiConfig,
  evaluateCollectiveRaidPool,
  evaluateRecruiterPools,
  recommendBestUpgrade,
  attachAiAdviceToAccounts
};
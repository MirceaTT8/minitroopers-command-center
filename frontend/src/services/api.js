const MOCK_ACCOUNTS = [
  {
    id: 'berbelita1',
    name: 'berbelita1',
    raidPhase: 4,
    credits: 222,
    raidCurrency: 49,
    firstSoldier: {
      slot: 0,
      name: 'Mr.Reinelmes',
      level: 8,
      archetype: 'Mid-Range Bruiser',
      upgradeCost: 181,
      aiConfig: {
        favouriteWeapon: 'Comanche Auto',
        favouriteTarget: 'In the head!',
        preferredVictim: 'The biggest threat',
        fightingStyle: 'Standard',
        priorityTarget: 'Default',
      },
      skills: [
        'Comanche Auto',
        'Browning',
        'Bazooka',
        'Grenade',
        'Pilot',
        'Saboteur',
        'Sprint',
        'Dodge',
        'Anatomy',
        'Hard Boiled',
        'Smart',
        'Suspicious',
      ],
      availableUpgrades: [
        {
          id: 'opt1',
          name: 'Twinoid',
          type: 'Active',
          color: 'Yellow',
          description: 'Fires twice per reload cycle. Strong synergy with Comanche Auto.',
        },
        {
          id: 'opt2',
          name: 'Sniper Rifle',
          type: 'Weapon',
          color: 'Red',
          description: 'Warning: Exceeds 2-weapon rule and increases Saboteur disarm risk.',
        },
      ],
      aiRecommendation: {
        recommendedOptionId: 'opt1',
        recommendedSkill: 'Twinoid',
        reasons: [
          'Individual Build: Matches Armor-Piercing Mid-Range Bruiser archetype.',
          'Rule Check: Avoids adding an extra firearm (prevents AI weapon-swap loops).',
          'Raid Synergy: Boosts sustained wave DPS for Recruiter Raid Phase 4.',
        ],
      },
    },
  },
  {
    id: 'berbelita2',
    name: 'berbelita2',
    raidPhase: 4,
    credits: 95,
    raidCurrency: 32,
    firstSoldier: {
      slot: 0,
      name: 'Caelahew',
      level: 7,
      archetype: 'Combat Medic / Global Specialist',
      upgradeCost: 140,
      aiConfig: {
        favouriteWeapon: 'FAMAS',
        favouriteTarget: 'Gutshot',
        preferredVictim: 'The weakest',
        fightingStyle: 'Defender',
        priorityTarget: 'Default',
      },
      skills: ['FAMAS', 'Beretta', 'Doctor', 'Smart', 'Hard Boiled', "Tuck 'n' Roll"],
      availableUpgrades: [
        {
          id: 'opt1',
          name: 'Suspicious',
          type: 'Active',
          color: 'Yellow',
          description: '100% Immune to enemy Sabotage and allied Friendly Fire.',
        },
        {
          id: 'opt2',
          name: 'Rush',
          type: 'Active',
          color: 'Yellow',
          description: 'Charges forward into close-quarters combat.',
        },
      ],
      aiRecommendation: {
        recommendedOptionId: 'opt1',
        recommendedSkill: 'Suspicious',
        reasons: [
          'Mandatory Level 7+ pick: Protects your Wave Doctor from allied friendly fire.',
          'Prevents enemy Saboteurs from disarming FAMAS across Raid waves.',
        ],
      },
    },
  },
  {
    id: 'berbelita3',
    name: 'berbelita3',
    raidPhase: 4,
    credits: 310,
    raidCurrency: 64,
    firstSoldier: {
      slot: 0,
      name: 'Wageider',
      level: 9,
      archetype: 'Close-Range Shock / Knockdown',
      upgradeCost: 245,
      aiConfig: {
        favouriteWeapon: 'Pump Action Shotgun',
        favouriteTarget: 'Gutshot',
        preferredVictim: 'The closest',
        fightingStyle: 'Hunter',
        priorityTarget: 'Default',
      },
      skills: [
        'Pump Action Shotgun',
        'Revolver',
        'Soldier',
        'Motorcycle',
        'Rush',
        'Hard Boiled',
        'Bulletproof Vest',
        'Suspicious',
      ],
      availableUpgrades: [
        {
          id: 'opt1',
          name: 'Hydroshock Shells',
          type: 'Weapon',
          color: 'Red',
          description: 'Adds knockdown chance on hit, cancelling enemy turns.',
        },
        {
          id: 'opt2',
          name: 'Spy',
          type: 'Role',
          color: 'Purple',
          description: 'Infiltrates enemy backline at start of battle (F-Tier in Raids).',
        },
      ],
      aiRecommendation: {
        recommendedOptionId: 'opt1',
        recommendedSkill: 'Hydroshock Shells',
        reasons: [
          'High multi-pellet knockdown synergy with Pump Action Shotgun.',
          'Never pick Spy on Raid recruits (causes isolated early-wave deaths).',
        ],
      },
    },
  },
  {
    id: 'berbelita4',
    name: 'berbelita4',
    raidPhase: 4,
    credits: 49,
    raidCurrency: 18,
    firstSoldier: {
      slot: 0,
      name: 'Bartelli',
      level: 6,
      archetype: 'Explosive / AoE Demolitions',
      upgradeCost: 110,
      aiConfig: {
        favouriteWeapon: 'Bazooka',
        favouriteTarget: 'Anywhere!',
        preferredVictim: 'The biggest threat',
        fightingStyle: 'Defender',
        priorityTarget: 'Default',
      },
      skills: ['Bazooka', 'FAMAS', 'Munitions', 'Loader', 'Hard Boiled'],
      availableUpgrades: [
        {
          id: 'opt1',
          name: 'Smart',
          type: 'Active',
          color: 'Yellow',
          description: '+1 upgrade choice on level-up and Propaganda immunity.',
        },
        {
          id: 'opt2',
          name: 'Camouflage',
          type: 'Passive',
          color: 'Green',
          description: 'Reduces enemy accuracy from long range.',
        },
      ],
      aiRecommendation: {
        recommendedOptionId: 'opt1',
        recommendedSkill: 'Smart',
        reasons: ['S+ Tier Utility: Unlocks 3 choices per level-up and blocks enemy Propaganda.'],
      },
    },
  },
  {
    id: 'berbelita5',
    name: 'berbelita5',
    raidPhase: 4,
    credits: 190,
    raidCurrency: 40,
    firstSoldier: {
      slot: 0,
      name: 'Valkor',
      level: 8,
      archetype: 'Global Reserve Specialist',
      upgradeCost: 181,
      aiConfig: {
        favouriteWeapon: 'Thompson',
        favouriteTarget: 'Gutshot',
        preferredVictim: 'The biggest threat',
        fightingStyle: 'Defender',
        priorityTarget: 'Default',
      },
      skills: ['Thompson', 'Desert Eagle', 'Saboteur', 'Smart', 'Suspicious', 'Hard Boiled'],
      availableUpgrades: [
        {
          id: 'opt1',
          name: 'Sturdy',
          type: 'Passive',
          color: 'Green',
          description: 'Increases base HP pool and survivability.',
        },
        {
          id: 'opt2',
          name: 'Nimble Fingers',
          type: 'Weapon',
          color: 'Red',
          description: 'Reduces weapon reload delay between bursts.',
        },
      ],
      aiRecommendation: {
        recommendedOptionId: 'opt1',
        recommendedSkill: 'Sturdy',
        reasons: [
          'Saboteurs scale by +1 global weapon disarm per level above 5.',
          'Sturdy keeps this reserve specialist alive longer if forced onto the field.',
        ],
      },
    },
  },
  {
    id: 'berbelita6',
    name: 'berbelita6',
    raidPhase: 4,
    credits: 112,
    raidCurrency: 27,
    firstSoldier: {
      slot: 0,
      name: 'Kaelen',
      level: 7,
      archetype: 'Global Executioner Sniper',
      upgradeCost: 140,
      aiConfig: {
        favouriteWeapon: 'SparrowHawk',
        favouriteTarget: 'In the head!',
        preferredVictim: 'The biggest threat',
        fightingStyle: 'Defender',
        priorityTarget: 'Default',
      },
      skills: ['SparrowHawk', 'Revolver', 'Comms. Officer', 'Anatomy', 'Out of Sight'],
      availableUpgrades: [
        {
          id: 'opt1',
          name: 'Suspicious',
          type: 'Active',
          color: 'Yellow',
          description: '100% Immune to enemy Sabotage and allied Friendly Fire.',
        },
        {
          id: 'opt2',
          name: 'Heartbreaker',
          type: 'Active',
          color: 'Yellow',
          description: 'Increases critical hit damage to the chest.',
        },
      ],
      aiRecommendation: {
        recommendedOptionId: 'opt1',
        recommendedSkill: 'Suspicious',
        reasons: ['Mandatory on Snipers and Comms Officers to prevent Saboteur disarm.'],
      },
    },
  },
  {
    id: 'berbelita7',
    name: 'berbelita7',
    raidPhase: 4,
    credits: 260,
    raidCurrency: 55,
    firstSoldier: {
      slot: 0,
      name: 'Draven',
      level: 8,
      archetype: 'Heavy Suppression Gunner',
      upgradeCost: 181,
      aiConfig: {
        favouriteWeapon: 'Heavy Machine Gun',
        favouriteTarget: 'Anywhere!',
        preferredVictim: 'The closest',
        fightingStyle: 'Standard',
        priorityTarget: 'Default',
      },
      skills: [
        'Heavy Machine Gun',
        'Revolver',
        'Soldier',
        'Loader',
        'Hard Boiled',
        'Bulletproof Vest',
        'Suspicious',
      ],
      availableUpgrades: [
        {
          id: 'opt1',
          name: 'Sturdy',
          type: 'Passive',
          color: 'Green',
          description: 'Increases base HP pool so frontline tank survives multiple waves.',
        },
        {
          id: 'opt2',
          name: 'Scout',
          type: 'Role',
          color: 'Purple',
          description: '+1 Wave Deployment capacity (Warning: Cap Scouts at 2-4 total).',
        },
      ],
      aiRecommendation: {
        recommendedOptionId: 'opt1',
        recommendedSkill: 'Sturdy',
        reasons: [
          'Frontline Heavy Gunner needs maximum HP retention across Raid waves.',
          'Avoid exceeding the 2-4 Scout global cap to prevent AoE/Friendly Fire bloat.',
        ],
      },
    },
  },
]

export async function fetchAccountsFromApi() {
  try {
    const response = await fetch('/api/accounts')
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    const data = await response.json()
    return { data, isMock: false }
  } catch {
    return { data: MOCK_ACCOUNTS, isMock: true }
  }
}

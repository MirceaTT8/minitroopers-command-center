// backend/services/llmAdvisorService.js
const fs = require('fs');
const path = require('path');
const {
  detectSoldierArchetype,
  evaluateCollectiveRaidPool,
  recommendBestUpgrade,
} = require('./strategyEngine');

const USAGE_LOG_PATH = path.join(__dirname, '..', 'data', 'llmUsageLog.json');

// Separate Free Tier daily quota pools — starts with highest RPD model first
const DEFAULT_FREE_WATERFALL = [
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash-lite',
  'gemini-3.8-flash',
  'gemini-4-hydrogen',
];

// Tracks models whose daily quota (429 PerDay) is exhausted -> timestamp (ms) when to retry
const exhaustedModelsUntil = new Map();

// Current standard pricing per 1M tokens (USD) for usage logging
const MODEL_RATES_PER_1M = {
  'gemini-3.1-flash-lite': { input: 0.25, output: 1.50 },
  'gemini-3.5-flash-lite': { input: 0.30, output: 2.50 },
  'gemini-3.8-flash': { input: 0.75, output: 3.75 },
  'gemini-3.6-flash': { input: 0.75, output: 3.75 },
  'gemini-4-hydrogen': { input: 1.50, output: 7.50 },
  'gemini-4-neon': { input: 3.00, output: 15.00 },
  default: { input: 0.75, output: 3.75 },
};

// Core rules distilled from Mini_Troopers_Raid_and_Army_Strategy-v2.xlsx
const STRATEGY_KNOWLEDGE_BASE = `
MINI TROOPERS TACTICAL STRATEGY MATRIX:
1. PRIORITY SPLIT: 95% Raid Mode (Recruits only; weakest deploy first; HP carries over between phases), 5% Epic Missions (Main Army + highest-level Recruits).
2. UNIVERSAL INDIVIDUAL RULES:
   - "Smart" (S+ Tier): Take early. Increases upgrade choices from 2 to 3 and grants Propaganda immunity.
   - "Suspicious" (S+ Tier, Lvl 7+): Raid MVP. 100% immune to enemy Sabotage and allied Friendly Fire. Mandatory on Doctors, Comms, Snipers, Heavy Gunners.
   - 2-Weapon Rule: Never exceed 2 weapon skills on a trooper (3+ causes AI weapon-swap loops and wastes turns).
   - "Hard Boiled" / "Sturdy" / "Bulletproof Vest" (S Tier): Damage reduction compounds across multi-wave Raids.
   - "Loader" / "Nimble Fingers" (A+ Tier): Mandatory for Heavy Machine Gun, Rocket Launcher, Bazooka, Shotguns to fire on Turn 1.
3. COLLECTIVE RECRUITER POOL RULES (RAID MODE):
   - Saboteur (S-Tier, 10/10): Stack high (5-12+) in back of reserve. +1 global disarm per level above 5.
   - Comms. Officer (S-Tier, 9/10): Optimal 1-3 in back of reserve. Starts +5 Comms at Lvl 6 (+1/lvl). CRITICAL BUG: 10-19 total Comms unlocks "Retreat", which deletes surviving recruits in Raids! Safe below 10 or at 20+ (Propaganda).
   - Doctor (A-Tier, 9/10): ~1 per wave (up to 4-6). Heals HP and crippled limbs between Raid waves.
   - Scout (A-Tier Capped, 6/10): Strictly 2 to 4 Scouts total (+1 deploy capacity each, base 4 -> 6-8). NEVER take a 5th Scout (causes AoE wipeouts and Friendly Fire).
   - Munitions (B+ Tier, 7/10): 2-4 troopers; 2x grenade rate and reloads allies on arrival.
   - Soldier (B+ Tier, 8/10): Core Level 6-7 frontline tank (+1 HP/lvl, helmet caps headshots at 2 dmg).
   - Spy (F-Tier in Raids, 2/10): NEVER pick on Raid recruits (infiltrates alone and dies or gets friendly-fired).
`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getCandidateModels() {
  if (process.env.GEMINI_MODELS) {
    return process.env.GEMINI_MODELS.split(',')
      .map((m) => m.trim())
      .filter(Boolean);
  }
  if (process.env.GEMINI_MODEL) {
    const primary = process.env.GEMINI_MODEL.trim();
    if (process.env.GEMINI_STRICT_SINGLE_MODEL === 'true') {
      return [primary];
    }
    return [primary, ...DEFAULT_FREE_WATERFALL.filter((m) => m !== primary)];
  }
  return [...DEFAULT_FREE_WATERFALL];
}

function parseRetryDelayMs(errText) {
  const match = String(errText).match(/"retryDelay"\s*:\s*"(\d+)s"/i);
  if (match) {
    return parseInt(match[1], 10) * 1000;
  }
  return 60 * 60 * 1000; // Default 1-hour cooldown if daily quota hit
}

function estimateCostUsd(model, promptTokens, outputTokens) {
  const rate = MODEL_RATES_PER_1M[model] || MODEL_RATES_PER_1M.default;
  const cost =
    (promptTokens / 1_000_000) * rate.input +
    (outputTokens / 1_000_000) * rate.output;
  return Number(cost.toFixed(6));
}

function recordLlmUsage(entry) {
  let state = {
    totalCalls: 0,
    totalPromptTokens: 0,
    totalOutputTokens: 0,
    totalTokens: 0,
    estimatedTotalCostUsd: 0,
    history: [],
  };

  if (fs.existsSync(USAGE_LOG_PATH)) {
    try {
      state = JSON.parse(fs.readFileSync(USAGE_LOG_PATH, 'utf-8'));
    } catch (_) {}
  }

  state.totalCalls += 1;
  state.totalPromptTokens += entry.promptTokens;
  state.totalOutputTokens += entry.outputTokens;
  state.totalTokens += entry.totalTokens;
  state.estimatedTotalCostUsd = Number(
    (state.estimatedTotalCostUsd + entry.estimatedCostUsd).toFixed(6)
  );
  state.history.unshift(entry);
  state.history = state.history.slice(0, 100);

  fs.mkdirSync(path.dirname(USAGE_LOG_PATH), { recursive: true });
  fs.writeFileSync(USAGE_LOG_PATH, JSON.stringify(state, null, 2), 'utf-8');
  return state;
}

function getLlmUsageSummary() {
  if (!fs.existsSync(USAGE_LOG_PATH)) {
    return {
      totalCalls: 0,
      totalPromptTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      estimatedTotalCostUsd: 0,
      history: [],
    };
  }
  return JSON.parse(fs.readFileSync(USAGE_LOG_PATH, 'utf-8'));
}

function buildPromptPayload(account, allAccounts) {
  const soldier = account.firstSoldier;
  const recruiterRoster = account.recruiter
    ? allAccounts.filter(
        (a) => a.recruiter && a.recruiter.toLowerCase() === account.recruiter.toLowerCase()
      )
    : [account];

  const collectiveMetrics = evaluateCollectiveRaidPool(recruiterRoster);
  const detectedArchetype = detectSoldierArchetype(soldier);

  const rosterSummary = recruiterRoster.map((acc) => ({
    accountId: acc.id,
    soldierName: acc.firstSoldier?.name,
    level: acc.firstSoldier?.level,
    raidPhase: acc.raidPhase,
    skills: (acc.firstSoldier?.skills || []).map((s) => s.name),
  }));

  const contextData = {
    recruiter: account.recruiter || 'Unassigned',
    raidPhase: account.raidPhase,
    collectiveRecruiterPool: collectiveMetrics,
    recruiterTroopers: rosterSummary,
    targetSoldier: {
      name: soldier.name,
      level: soldier.level,
      detectedArchetype: detectedArchetype.name,
      recommendedAiSettings: {
        fightingStyle: detectedArchetype.recommendedStyle,
        favouriteTarget: detectedArchetype.recommendedTarget,
      },
      currentAiConfig: soldier.aiConfig,
      currentSkills: soldier.skills.map((s) => ({ name: s.name, type: s.type })),
      weaponCount: soldier.skills.filter((s) => s.type === 'Weapon').length,
    },
    rolledUpgradeChoices: soldier.availableUpgrades.map((u) => ({
      id: u.id,
      key: u.key,
      name: u.name,
      type: u.type,
      color: u.color,
      description: u.description,
    })),
  };

  return {
    systemPrompt: `You are an elite tactical AI advisor for the game Mini Troopers.
Analyze the soldier's individual build, the recruiter's collective recruit roster, and the strategy matrix below to pick the single best upgrade from "rolledUpgradeChoices".
${STRATEGY_KNOWLEDGE_BASE}
Respond ONLY with valid JSON matching this exact schema:
{
  "recommendedKey": "exact key from rolledUpgradeChoices",
  "recommendedSkill": "exact name from rolledUpgradeChoices",
  "confidence": 0-100,
  "summary": "2-3 sentence tactical explanation referencing both the soldier's build and the recruiter's collective army state",
  "optionAnalysis": [
    {
      "key": "option key",
      "name": "option name",
      "verdict": "PICK | GOOD | SITUATIONAL | AVOID",
      "reason": "1 concise sentence explaining why"
    }
  ],
  "aiConfigTip": "Optional 1-sentence advice on the 5 AI dropdowns after taking this skill"
}`,
    userPrompt: JSON.stringify(contextData, null, 2),
    collectiveMetrics,
    detectedArchetype,
  };
}

async function callSingleGeminiModel(model, systemPrompt, userPrompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  // Gemini 4 Neon ignores temperature and defaults to HIGH thinking; use LOW for fast JSON decisions
  const isNeon = model.toLowerCase().includes('gemini-4-neon');
  const generationConfig = isNeon
    ? {
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingLevel: 'LOW' },
      }
    : {
        temperature: 0.2,
        responseMimeType: 'application/json',
      };

  const maxBurstAttempts = 2;
  for (let attempt = 1; attempt <= maxBurstAttempts; attempt++) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig,
      }),
    });

    if (response.status === 429) {
      const errText = await response.text();
      const isDailyOrTierQuota =
        /PerDay|per day|GenerateRequestsPerDay|limit:\s*0|free_tier/i.test(errText);

      if (isDailyOrTierQuota) {
        const cooldownMs = parseRetryDelayMs(errText);
        exhaustedModelsUntil.set(model, Date.now() + cooldownMs);
        console.warn(
          `[LLM] Model "${model}" hit daily/tier quota (429). Cooling down and rotating to next model...`
        );
        const quotaErr = new Error(`Model ${model} daily/tier quota exceeded`);
        quotaErr.isQuota = true;
        throw quotaErr;
      }

      if (attempt < maxBurstAttempts) {
        const delayMs = attempt * 4000;
        console.warn(`[LLM] "${model}" burst rate-limited (429). Retrying in ${delayMs}ms...`);
        await sleep(delayMs);
        continue;
      }

      const burstErr = new Error(`Model ${model} burst rate limit (429): ${errText}`);
      burstErr.isQuota = true;
      throw burstErr;
    }

    if (response.status === 404 || response.status === 403) {
      const errText = await response.text();
      exhaustedModelsUntil.set(model, Date.now() + 6 * 60 * 60 * 1000);
      console.warn(
        `[LLM] Model "${model}" unavailable (HTTP ${response.status}). Rotating to next model...`
      );
      const unavailErr = new Error(`Model ${model} HTTP ${response.status}: ${errText}`);
      unavailErr.isQuota = true;
      throw unavailErr;
    }

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API (${model}) HTTP ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error(`Empty response from Gemini API (${model})`);

    const meta = data.usageMetadata || {};
    const promptTokens = meta.promptTokenCount || 0;
    const outputTokens = meta.candidatesTokenCount || 0;
    const totalTokens = meta.totalTokenCount || promptTokens + outputTokens;

    return {
      model,
      parsed: JSON.parse(rawText),
      usage: {
        model,
        promptTokens,
        outputTokens,
        totalTokens,
        estimatedCostUsd: estimateCostUsd(model, promptTokens, outputTokens),
      },
    };
  }
}

async function callGeminiWithWaterfall(systemPrompt, userPrompt) {
  const candidates = getCandidateModels();
  const now = Date.now();
  const errors = [];

  for (const model of candidates) {
    const blockedUntil = exhaustedModelsUntil.get(model);
    if (blockedUntil && now < blockedUntil) {
      continue;
    }

    try {
      return await callSingleGeminiModel(model, systemPrompt, userPrompt);
    } catch (err) {
      errors.push(`${model}: ${err.message}`);
      if (err.isQuota) {
        continue; // Immediately try next model in waterfall
      }
      throw err;
    }
  }

  const exhaustedErr = new Error(
    `All configured Gemini models exhausted their quota (${candidates.join(', ')}). Enable Paid Tier billing in Google AI Studio or wait for daily quota reset.`
  );
  exhaustedErr.code = 'ALL_MODELS_QUOTA_EXHAUSTED';
  exhaustedErr.statusCode = 429;
  throw exhaustedErr;
}

async function getUpgradeAdviceWithLLM(account, allAccounts, { strictLlm = false } = {}) {
  const soldier = account.firstSoldier;
  const options = soldier?.availableUpgrades || [];

  if (options.length === 0) {
    return {
      source: 'none',
      message: 'No rolled upgrade choices available yet. Request an upgrade on /t/0 first.',
    };
  }

  const { systemPrompt, userPrompt, collectiveMetrics, detectedArchetype } =
    buildPromptPayload(account, allAccounts);

  try {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('No GEMINI_API_KEY configured in environment');
    }

    const res = await callGeminiWithWaterfall(systemPrompt, userPrompt);
    const llmResult = res.parsed;
    const usage = res.usage;

    recordLlmUsage({
      timestamp: new Date().toISOString(),
      accountId: account.id,
      soldierName: soldier.name,
      pickedSkill: llmResult.recommendedSkill,
      ...usage,
    });

    console.log(
      `[LLM Usage] ${account.id} | Model: ${res.model} | In: ${usage.promptTokens} | Out: ${usage.outputTokens} (~$${usage.estimatedCostUsd})`
    );

    return {
      source: 'llm',
      model: res.model,
      archetype: detectedArchetype.name,
      collectiveMetrics,
      usage,
      ...llmResult,
    };
  } catch (err) {
    if (strictLlm) {
      const wrapped = new Error(`Strict LLM check failed: ${err.message}`);
      wrapped.code = err.code || 'LLM_ERROR';
      wrapped.statusCode = err.statusCode || 503;
      throw wrapped;
    }

    const fallback = recommendBestUpgrade(soldier, collectiveMetrics);
    const matchedOpt =
      options.find((o) => o.id === fallback.recommendedOptionId) || options[0];

    return {
      source: 'fallback-rules',
      fallbackReason: err.message,
      archetype: detectedArchetype.name,
      collectiveMetrics,
      recommendedKey: matchedOpt.key,
      recommendedSkill: matchedOpt.name,
      confidence: 80,
      summary: fallback.reasons.join(' '),
      optionAnalysis: options.map((o) => ({
        key: o.key,
        name: o.name,
        verdict: o.key === matchedOpt.key ? 'PICK' : 'SITUATIONAL',
        reason:
          o.key === matchedOpt.key
            ? fallback.reasons[0] || 'Highest tactical synergy.'
            : 'Lower priority than recommended pick.',
      })),
      aiConfigTip: `Recommended baseline: ${detectedArchetype.recommendedStyle} / ${detectedArchetype.recommendedTarget}.`,
    };
  }
}

module.exports = { getUpgradeAdviceWithLLM, getLlmUsageSummary };
// backend/services/llmAdvisorService.js
const {
  detectSoldierArchetype,
  evaluateCollectiveRaidPool,
  recommendBestUpgrade,
} = require('./strategyEngine');

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

function buildPromptPayload(account, allAccounts) {
  const soldier = account.firstSoldier;
  // Filter to only accounts belonging to the same recruiter
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

async function callGeminiLLM(systemPrompt, userPrompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API HTTP ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error('Empty response from Gemini API');
  return JSON.parse(rawText);
}

async function callOpenAICompatibleLLM(systemPrompt, userPrompt) {
  // Works with OpenAI (https://api.openai.com/v1) OR local Ollama (http://localhost:11434/v1)
  const baseUrl = process.env.LLM_BASE_URL || 'https://api.openai.com/v1';
  const apiKey = process.env.OPENAI_API_KEY || 'ollama';
  const model = process.env.LLM_MODEL || 'gpt-4o-mini';

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`LLM API HTTP ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const rawText = data?.choices?.[0]?.message?.content;
  if (!rawText) throw new Error('Empty response from LLM API');
  return JSON.parse(rawText);
}

async function getUpgradeAdviceWithLLM(account, allAccounts) {
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
    let llmResult;
    if (process.env.GEMINI_API_KEY) {
      llmResult = await callGeminiLLM(systemPrompt, userPrompt);
    } else if (process.env.OPENAI_API_KEY || process.env.LLM_BASE_URL) {
      llmResult = await callOpenAICompatibleLLM(systemPrompt, userPrompt);
    } else {
      throw new Error('No GEMINI_API_KEY or OPENAI_API_KEY/LLM_BASE_URL configured');
    }

    return {
      source: 'llm',
      model: process.env.GEMINI_MODEL || process.env.LLM_MODEL || 'gemini-2.5-flash',
      archetype: detectedArchetype.name,
      collectiveMetrics,
      ...llmResult,
    };
  } catch (err) {
    // Graceful fallback to deterministic strategyEngine.js if offline or API key missing
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

module.exports = { getUpgradeAdviceWithLLM };
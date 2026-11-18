<template>
  <div class="bg-slate-800 p-5 rounded-xl border border-blue-500">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
      <div>
        <h2 class="text-sm font-bold text-blue-400 uppercase">
          Upgrade Selection (First Soldier — /t/0)
        </h2>
        <p class="text-xs text-slate-400 mt-0.5">
          Send an upgrade request on /t/0 to reveal {{ soldier.name }}'s rolled upgrade options.
        </p>
      </div>

      <button
        @click="$emit('request-upgrade')"
        :disabled="isUpgrading"
        class="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-4 py-2 rounded-lg font-bold text-xs text-white cursor-pointer border border-emerald-400 shrink-0"
      >
        {{
          isUpgrading
            ? 'Sending /t/0 Upgrade Request...'
            : soldier.availableUpgrades?.length
              ? 'Re-Fetch Upgrade Options (/t/0)'
              : `Request Upgrade on /t/0 (${soldier.upgradeCost} T)`
        }}
      </button>
    </div>

    <!-- Empty State -->
    <div
      v-if="!soldier.availableUpgrades || soldier.availableUpgrades.length === 0"
      class="bg-slate-900/80 border border-slate-700 rounded-lg p-5 text-center text-slate-300 mb-4"
    >
      <p class="text-sm font-semibold">
        No upgrade options loaded yet for {{ soldier.name }}.
      </p>
      <p class="text-xs text-slate-400 mt-1">
        Click <strong>Request Upgrade on /t/0</strong> above to trigger the level-up request and load your choices here.
      </p>
    </div>

    <!-- Revealed Upgrade Options Grid -->
    <div v-else class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
      <div
        v-for="opt in soldier.availableUpgrades"
        :key="opt.key"
        class="p-4 rounded-lg border flex flex-col justify-between relative"
        :class="[
          getColorClasses(opt.color),
          isRecommended(opt) ? 'ring-2 ring-yellow-400 shadow-lg shadow-yellow-500/20' : ''
        ]"
      >
        <!-- Recommended Badge Ribbon -->
        <div
          v-if="isRecommended(opt)"
          class="absolute -top-3 right-3 bg-yellow-500 text-black font-bold text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wide shadow"
        >
          #1 Recommended
        </div>

        <div>
          <div class="flex items-center justify-between gap-2 mb-1">
            <span class="text-xs font-bold uppercase px-2 py-0.5 rounded bg-black/30">
              {{ opt.type }} ({{ opt.color }})
            </span>
            <span class="text-xs font-mono px-1.5 py-0.5 rounded bg-black/30">
              #{{ opt.id }}
            </span>
          </div>

          <div class="text-lg font-bold mt-2 mb-1">{{ opt.name }}</div>
          <div class="text-[11px] font-mono opacity-80 mb-2">
            key: {{ opt.key }}
          </div>
          <p class="text-xs leading-relaxed opacity-95 mb-4">
            {{ opt.description }}
          </p>
        </div>

        <button
          v-if="opt.selectUrl"
          @click="$emit('select-upgrade', opt.selectUrl)"
          :disabled="isUpgrading"
          class="w-full bg-black/40 hover:bg-black/60 border border-white/30 py-2 rounded text-xs font-bold cursor-pointer"
        >
          Confirm &amp; Equip {{ opt.name }}
        </button>
      </div>
    </div>

    <!-- AI Advisor Recommendations Panel -->
    <div
      v-if="soldier.aiAdvice"
      class="bg-slate-900 p-5 rounded-xl border border-sky-500 shadow-xl"
    >
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-2">
          <span class="px-2 py-0.5 rounded text-xs font-bold bg-sky-600 text-white">
            AI ADVISOR RECOMMENDATION
          </span>
          <span
            class="px-2 py-0.5 rounded text-xs font-bold border"
            :class="
              soldier.aiAdvice.decisionTier?.startsWith('TIER_1')
                ? 'bg-purple-950 text-purple-300 border-purple-500'
                : 'bg-emerald-950 text-emerald-300 border-emerald-500'
            "
          >
            {{ soldier.aiAdvice.decisionTierLabel || 'Tier 2: Individual Synergy' }}
          </span>
        </div>
        <span class="text-xs text-sky-400 font-mono">
          Detected Archetype: <strong>{{ soldier.aiAdvice.archetype?.name }}</strong>
        </span>
      </div>

      <div class="bg-slate-950 p-4 rounded-lg border border-slate-800 mb-3">
        <p class="text-sm font-bold text-yellow-300 mb-1">
          Top Recommendation: {{ soldier.aiAdvice.recommendedSkill || 'No upgrade pending' }}
          <span v-if="soldier.aiAdvice.recommendedScore" class="text-xs text-slate-400 font-mono ml-2">
            (Score: {{ soldier.aiAdvice.recommendedScore }})
          </span>
        </p>
        <div class="text-xs text-slate-300 space-y-1">
          <p v-for="(reason, idx) in soldier.aiAdvice.reasons" :key="idx" class="flex items-start gap-1.5">
            <span class="text-sky-400 font-bold">•</span>
            <span>{{ reason }}</span>
          </p>
        </div>
      </div>

      <div class="text-[11px] text-slate-400 font-mono space-y-0.5">
        <p>{{ soldier.aiAdvice.recruiterSummary }}</p>
        <p class="text-yellow-400/90 font-semibold">{{ soldier.aiAdvice.topClassNeeds }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  account: {
    type: Object,
    required: true,
  },
  soldier: {
    type: Object,
    required: true,
  },
  canUpgrade: {
    type: Boolean,
    required: true,
  },
  isUpgrading: {
    type: Boolean,
    default: false,
  },
})

defineEmits(['request-upgrade', 'select-upgrade'])

function isRecommended(opt) {
  return (
    props.soldier.aiAdvice?.recommendedOptionKey &&
    opt.key === props.soldier.aiAdvice.recommendedOptionKey
  )
}

const COLOR_STYLE_MAP = {
  Gray: 'bg-zinc-700/80 border-zinc-400 text-zinc-200',
  Red: 'bg-red-900/75 border-red-500 text-red-200',
  Orange: 'bg-orange-900/75 border-orange-500 text-orange-200',
  Yellow: 'bg-yellow-900/75 border-yellow-400 text-yellow-200',
  Green: 'bg-emerald-900/75 border-emerald-500 text-emerald-200',
  Cyan: 'bg-cyan-900/75 border-cyan-400 text-cyan-200',
  Blue: 'bg-blue-900/75 border-blue-500 text-blue-200',
  Purple: 'bg-purple-900/75 border-purple-500 text-purple-200',
}

function getColorClasses(color) {
  return COLOR_STYLE_MAP[color] || COLOR_STYLE_MAP.Gray
}
</script>
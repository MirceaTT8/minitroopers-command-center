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

    <!-- Empty state before upgrade is requested or if no options are unlocked yet -->
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
        class="p-4 rounded-lg border flex flex-col justify-between"
        :class="getColorClasses(opt.color)"
      >
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

    <!-- Phase 2 AI Strategy Slot -->
    <div class="bg-blue-950/60 p-4 rounded-lg border border-sky-400">
      <div class="text-xs font-bold text-sky-400 mb-1">
        [AI ADVISOR - PHASE 2 SCOPE]
      </div>
      <p class="text-xs text-slate-300 leading-relaxed">
        In Phase 2, Python FastAPI will score these upgrade options against your Recruiter's Raid
        Phase {{ account.raidPhase ?? '?' }} global passives and {{ soldier.name }}'s weapon
        archetype.
      </p>
    </div>
  </div>
</template>

<script setup>
defineProps({
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
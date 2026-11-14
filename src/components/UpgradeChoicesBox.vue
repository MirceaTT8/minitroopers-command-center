<script setup>
defineProps({
  soldier: {
    type: Object,
    required: true,
  },
  canUpgrade: {
    type: Boolean,
    required: true,
  },
})

function colorBorderClass(color) {
  switch (color) {
    case 'Red':
      return 'border-red-500/80'
    case 'Purple':
      return 'border-purple-500/80'
    case 'Yellow':
      return 'border-yellow-500/80'
    default:
      return 'border-emerald-500/80'
  }
}

function colorTextClass(color) {
  switch (color) {
    case 'Red':
      return 'text-red-400'
    case 'Purple':
      return 'text-purple-300'
    case 'Yellow':
      return 'text-yellow-400'
    default:
      return 'text-emerald-400'
  }
}
</script>

<template>
  <div class="bg-slate-900 p-5 rounded-xl border-2 border-blue-500/60">
    <h2 class="text-xs font-extrabold tracking-wider text-blue-400 uppercase mb-4">
      Upgrade Selection (First Soldier) &amp; Phase 2 AI Advisor
    </h2>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <!-- Upgrade Option Cards -->
      <div
        v-for="(option, index) in soldier.availableUpgrades"
        :key="option.id"
        class="bg-slate-950 p-4 rounded-lg border-2 flex flex-col justify-between"
        :class="colorBorderClass(option.color)"
      >
        <div>
          <div class="text-xs font-extrabold uppercase mb-1" :class="colorTextClass(option.color)">
            Option {{ String.fromCharCode(65 + index) }} ({{ option.color }} / {{ option.type }})
          </div>
          <div class="text-lg font-extrabold text-white mb-2">
            {{ option.name }}
          </div>
          <p class="text-xs text-slate-300 leading-relaxed mb-4">
            {{ option.description }}
          </p>
        </div>

        <button
          type="button"
          :disabled="!canUpgrade"
          class="w-full py-2 px-3 rounded-md text-xs font-extrabold transition-colors cursor-pointer"
          :class="
            canUpgrade
              ? 'bg-blue-600 hover:bg-blue-500 text-white'
              : 'bg-slate-800 text-slate-500 cursor-not-allowed'
          "
        >
          {{
            canUpgrade ? `Take Upgrade (${soldier.upgradeCost} T)` : `Need ${soldier.upgradeCost} T`
          }}
        </button>
      </div>

      <!-- Phase 2 AI Advisor Slot -->
      <div
        class="bg-blue-950/50 p-4 rounded-lg border border-sky-400/70 flex flex-col justify-between"
      >
        <div>
          <div class="text-xs font-extrabold text-sky-400 uppercase mb-1">
            [AI ADVISOR — PHASE 2 SCOPE]
          </div>
          <div v-if="soldier.aiRecommendation" class="text-xs font-extrabold text-green-400 mb-2">
            Recommended: {{ soldier.aiRecommendation.recommendedSkill }}
          </div>
          <ul
            v-if="soldier.aiRecommendation"
            class="text-xs text-slate-200 space-y-1.5 list-disc list-inside"
          >
            <li v-for="(reason, idx) in soldier.aiRecommendation.reasons" :key="idx">
              {{ reason }}
            </li>
          </ul>
        </div>

        <p class="text-[11px] text-slate-400 mt-3 pt-2 border-t border-slate-800">
          Evaluated against Mini_Troopers_Raid_and_Army_Strategy.xlsx
        </p>
      </div>
    </div>
  </div>
</template>

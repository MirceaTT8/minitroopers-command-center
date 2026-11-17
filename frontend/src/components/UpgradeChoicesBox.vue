<template>
  <div class="bg-slate-800 p-5 rounded-xl border border-blue-500">
    <h2 class="text-sm font-bold text-blue-400 uppercase mb-4">
      Upgrade Selection (First Soldier) &amp; Phase 2 AI Advisor
    </h2>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div
        v-for="opt in soldier.availableUpgrades"
        :key="opt.id"
        class="bg-slate-900 p-4 rounded-lg border border-slate-700"
      >
        <div class="text-xs font-bold text-yellow-400 mb-1">
          {{ opt.type }} ({{ opt.color }})
        </div>
        <div class="text-lg font-bold mb-2">{{ opt.name }}</div>
        <p class="text-xs text-slate-400 mb-4">{{ opt.description }}</p>
        <button
          :disabled="!canUpgrade"
          class="w-full bg-blue-600 disabled:bg-slate-700 py-1.5 rounded text-xs font-bold cursor-pointer"
        >
          Take Upgrade ({{ soldier.upgradeCost }} T)
        </button>
      </div>

      <div class="bg-blue-950/60 p-4 rounded-lg border border-sky-400">
        <div class="text-xs font-bold text-sky-400 mb-1">
          [AI ADVISOR - PHASE 2 SCOPE]
        </div>
        <p class="text-xs text-slate-300 leading-relaxed">
          In Phase 2, Python FastAPI will score upgrade options against your Recruiter's Raid
          Phase {{ account.raidPhase ?? '?' }} global passives and {{ soldier.name }}'s weapon
          archetype.
        </p>
      </div>
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
})
</script>
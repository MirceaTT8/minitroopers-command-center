<script setup>
defineProps({
  soldier: {
    type: Object,
    required: true,
  },
  raidPhase: {
    type: [Number, String],
    required: true,
  },
})
</script>

<template>
  <div class="bg-slate-900 p-5 rounded-xl border border-slate-800">
    <h2 class="text-xs font-extrabold tracking-wider text-yellow-400 uppercase mb-4">
      Soldier Stats &amp; AI Config
    </h2>

    <div class="space-y-3 text-sm">
      <div class="flex justify-between items-center py-1.5 border-b border-slate-800/80">
        <span class="text-slate-400">Soldier Name:</span>
        <span class="font-bold text-white">{{ soldier.name }} (Slot #0)</span>
      </div>

      <div class="flex justify-between items-center py-1.5 border-b border-slate-800/80">
        <span class="text-slate-400">Level / Archetype:</span>
        <span class="font-bold text-sky-400">
          Lvl {{ soldier.level }} | {{ soldier.archetype }}
        </span>
      </div>

      <div class="flex justify-between items-center py-1.5 border-b border-slate-800/80">
        <span class="text-slate-400">Favourite Weapon:</span>
        <span
          class="px-2.5 py-0.5 bg-slate-950 border border-slate-700 rounded text-xs font-bold text-white"
        >
          {{ soldier.aiConfig.favouriteWeapon }} [v]
        </span>
      </div>

      <div class="flex justify-between items-center py-1.5 border-b border-slate-800/80">
        <span class="text-slate-400">Favourite Target:</span>
        <span
          class="px-2.5 py-0.5 bg-slate-950 border border-slate-700 rounded text-xs font-bold text-white"
        >
          {{ soldier.aiConfig.favouriteTarget }} [v]
        </span>
      </div>

      <div class="flex justify-between items-center py-1.5 border-b border-slate-800/80">
        <span class="text-slate-400">Preferred Victim:</span>
        <span
          class="px-2.5 py-0.5 bg-slate-950 border border-slate-700 rounded text-xs font-bold text-white"
        >
          {{ soldier.aiConfig.preferredVictim }} [v]
        </span>
      </div>

      <div class="flex justify-between items-center py-1.5 border-b border-slate-800/80">
        <span class="text-slate-400">Fighting Style:</span>
        <span
          class="px-2.5 py-0.5 bg-slate-950 border border-slate-700 rounded text-xs font-bold text-white"
        >
          {{ soldier.aiConfig.fightingStyle }} [v]
        </span>
      </div>

      <div class="flex justify-between items-center py-1.5 border-b border-slate-800/80">
        <span class="text-slate-400">Priority Target:</span>
        <span
          class="px-2.5 py-0.5 bg-slate-950 border border-slate-700 rounded text-xs font-bold text-white"
        >
          {{ soldier.aiConfig.priorityTarget }} [v]
        </span>
      </div>

      <div class="flex justify-between items-center pt-1.5">
        <span class="text-slate-400">Recruiter Raid:</span>
        <span class="font-bold text-yellow-400">Phase {{ raidPhase }} (Global Pool)</span>
      </div>
    </div>
  </div>
</template>

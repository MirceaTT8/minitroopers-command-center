<template>
  <div class="bg-slate-800 p-5 rounded-xl border border-slate-700 h-fit">
    <div class="flex items-center gap-4 mb-4 pb-4 border-b border-slate-700">
      <img
        v-if="soldier.avatarUrl"
        :src="soldier.avatarUrl"
        :alt="soldier.name"
        class="w-16 h-16 rounded bg-slate-900 border border-slate-600"
      />
      <div>
        <h2 class="text-lg font-bold text-white">{{ soldier.name }}</h2>
        <p class="text-xs text-yellow-400 font-semibold">
          Slot #0 • Level {{ soldier.level ?? '?' }} • Army Power {{ account.power }}
        </p>
      </div>
    </div>

    <h3 class="text-xs font-bold text-yellow-400 uppercase mb-3">
      Soldier Stats &amp; AI Targeting Config
    </h3>
    <div class="space-y-2.5 text-sm">
      <div class="flex justify-between">
        <span class="text-slate-400">Favourite Weapon:</span>
        <span class="font-bold text-white">{{ soldier.aiConfig.favouriteWeapon }}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-slate-400">Favourite Target:</span>
        <span class="font-bold text-white">{{ soldier.aiConfig.favouriteTarget }}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-slate-400">Preferred Victim:</span>
        <span class="font-bold text-white">{{ soldier.aiConfig.preferredVictim }}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-slate-400">Fighting Style:</span>
        <span class="font-bold text-white">{{ soldier.aiConfig.fightingStyle }}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-slate-400">Priority Target:</span>
        <span class="font-bold text-white">{{ soldier.aiConfig.priorityTarget }}</span>
      </div>
      <div class="flex justify-between pt-2 border-t border-slate-700">
        <span class="text-slate-400">Recruiter Raid:</span>
        <span class="font-bold text-yellow-400">
          {{ account.raidPhase ? `Phase ${account.raidPhase}` : 'N/A' }}
        </span>
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
})
</script>
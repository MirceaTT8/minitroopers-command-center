<template>
  <div
    @click="$emit('select', account.id)"
    class="bg-slate-800 p-5 rounded-xl shadow-lg border cursor-pointer transition-all hover:scale-[1.01]"
    :class="isReady ? 'border-green-500' : 'border-slate-700'"
  >
    <div class="flex justify-between items-center mb-3">
      <h2 class="text-xl font-bold text-yellow-400">{{ account.name }}</h2>
      <div class="flex items-center gap-2 text-xs text-slate-400">
        <span>Power: <strong class="text-white">{{ account.power }}</strong></span>
        <span v-if="account.raidPhase">• Raid Phase {{ account.raidPhase }}</span>
      </div>
    </div>

    <div class="p-4 bg-slate-900 rounded-lg border border-slate-700 flex items-center gap-4">
      <img
        v-if="account.firstSoldier.avatarUrl"
        :src="account.firstSoldier.avatarUrl"
        :alt="account.firstSoldier.name"
        class="w-14 h-14 rounded bg-slate-800 border border-slate-600 shrink-0"
      />
      <div class="min-w-0">
        <p class="font-semibold text-slate-300 truncate">
          1st Soldier:
          <span class="text-white">
            {{ account.firstSoldier.name }} (Lvl {{ account.firstSoldier.level ?? '?' }})
          </span>
        </p>
        <p class="text-sm text-slate-400 mt-1">
          Credits: <span class="text-white font-bold">{{ account.credits }} T</span> |
          Upgrade: <span class="text-white font-bold">{{ account.firstSoldier.upgradeCost }} T</span>
        </p>
        <p class="text-xs text-slate-500 mt-1">
          Unlocked Skills:
          <span class="text-slate-300 font-semibold">{{ account.firstSoldier.skills.length }}</span>
        </p>
      </div>
    </div>

    <div class="mt-4 flex items-center justify-between">
      <UpgradeBadge
        :credits="account.credits"
        :upgradeCost="account.firstSoldier.upgradeCost"
      />
      <span class="text-xs font-bold text-sky-400">Inspect Soldier -&gt;</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import UpgradeBadge from './UpgradeBadge.vue'

const props = defineProps({
  account: {
    type: Object,
    required: true,
  },
})

defineEmits(['select'])

const isReady = computed(
  () =>
    props.account.firstSoldier.upgradeCost > 0 &&
    props.account.credits >= props.account.firstSoldier.upgradeCost
)
</script>
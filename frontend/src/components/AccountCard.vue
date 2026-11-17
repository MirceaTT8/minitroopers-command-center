<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import UpgradeBadge from './UpgradeBadge.vue'

const props = defineProps({
  account: {
    type: Object,
    required: true,
  },
})

const router = useRouter()
const canUpgrade = computed(() => props.account.credits >= props.account.firstSoldier.upgradeCost)

function openAccountDetail() {
  router.push({ name: 'soldier-detail', params: { id: props.account.id } })
}
</script>

<template>
  <div
    @click="openAccountDetail"
    class="bg-slate-900 p-5 rounded-xl shadow-lg border-2 cursor-pointer transition-all hover:-translate-y-0.5 flex flex-col justify-between"
    :class="
      canUpgrade
        ? 'border-green-500/80 hover:border-green-400'
        : 'border-slate-800 hover:border-slate-700'
    "
  >
    <div>
      <!-- Top Row: Account Name & Raid Phase -->
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-lg font-extrabold text-yellow-400">Account: {{ account.name }}</h2>
        <span class="text-xs font-semibold text-slate-400">
          Raid Phase {{ account.raidPhase }}
        </span>
      </div>

      <!-- First Soldier Box -->
      <div class="p-3.5 bg-slate-950 rounded-lg border border-slate-800 mb-4">
        <div class="flex items-center justify-between">
          <p class="text-sm font-bold text-white">
            1st Soldier: {{ account.firstSoldier.name }} (Lvl {{ account.firstSoldier.level }})
          </p>
          <span class="text-[11px] text-sky-400 font-semibold">
            {{ account.firstSoldier.archetype }}
          </span>
        </div>
        <p class="text-xs text-slate-300 mt-1.5">
          Credits: <span class="font-bold text-white">{{ account.credits }} T</span>
          <span class="mx-2 text-slate-600">|</span>
          Upgrade Cost:
          <span class="font-bold text-white">{{ account.firstSoldier.upgradeCost }} T</span>
        </p>
      </div>
    </div>

    <!-- Bottom Row: Status Pill & Inspect Button -->
    <div class="flex items-center justify-between gap-2 pt-1">
      <UpgradeBadge :credits="account.credits" :upgradeCost="account.firstSoldier.upgradeCost" />

      <button
        type="button"
        class="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer"
        :class="
          canUpgrade
            ? 'bg-blue-600 hover:bg-blue-500 text-white'
            : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
        "
      >
        {{ canUpgrade ? 'Inspect & Upgrade ->' : 'Inspect Stats ->' }}
      </button>
    </div>
  </div>
</template>

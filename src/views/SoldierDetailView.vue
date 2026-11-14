<script setup>
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAccountsStore } from '@/stores/accountsStore'
import SoldierStatsPanel from '@/components/SoldierStatsPanel.vue'
import SkillColorGrid from '@/components/SkillColorGrid.vue'
import UpgradeChoicesBox from '@/components/UpgradeChoicesBox.vue'

const route = useRoute()
const router = useRouter()
const store = useAccountsStore()

onMounted(async () => {
  if (store.accounts.length === 0) {
    await store.fetchAccounts()
  }
})

const account = computed(() => store.getAccountById(route.params.id))
const soldier = computed(() => account.value?.firstSoldier)
const canUpgrade = computed(
  () => account.value && account.value.credits >= soldier.value.upgradeCost,
)
</script>

<template>
  <div v-if="account && soldier" class="space-y-6">
    <!-- Top Navigation & Soldier Title -->
    <div class="flex flex-wrap items-center gap-4">
      <button
        type="button"
        @click="router.push('/')"
        class="bg-slate-800 hover:bg-slate-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer"
      >
        &lt;- Back to List
      </button>
      <h1 class="text-xl font-extrabold text-sky-400">
        {{ account.name }} — {{ soldier.name }}'s Stats Sheet (Lvl {{ soldier.level }})
      </h1>
    </div>

    <!-- Upgrade Readiness Banner -->
    <div
      class="px-4 py-3 rounded-xl border font-bold text-sm"
      :class="
        canUpgrade
          ? 'bg-green-950/80 border-green-500 text-green-300'
          : 'bg-red-950/80 border-red-500 text-red-300'
      "
    >
      <span v-if="canUpgrade">
        [UPGRADE AVAILABLE] Credits: {{ account.credits }} T | Upgrade Cost:
        {{ soldier.upgradeCost }} T | Remaining After: {{ account.credits - soldier.upgradeCost }} T
      </span>
      <span v-else>
        [LOCKED — INSUFFICIENT CREDITS] Credits: {{ account.credits }} T | Upgrade Cost:
        {{ soldier.upgradeCost }} T (Need {{ soldier.upgradeCost - account.credits }} T more)
      </span>
    </div>

    <!-- Middle 2-Column Layout: Stats Panel (Left) + Color-Coded Skills Grid (Right) -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <SoldierStatsPanel :soldier="soldier" :raidPhase="account.raidPhase" />
      <div class="lg:col-span-2">
        <SkillColorGrid :skills="soldier.skills" />
      </div>
    </div>

    <!-- Bottom Panel: First Soldier Upgrade Selection & AI Advisor -->
    <UpgradeChoicesBox :soldier="soldier" :canUpgrade="canUpgrade" />
  </div>

  <div v-else class="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
    <p class="text-slate-300 font-bold mb-4">Account not found.</p>
    <button
      type="button"
      @click="router.push('/')"
      class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-xs font-bold cursor-pointer"
    >
      Return to Dashboard
    </button>
  </div>
</template>

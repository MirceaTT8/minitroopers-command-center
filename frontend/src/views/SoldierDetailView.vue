<template>
  <div v-if="account && soldier" class="min-h-screen bg-slate-900 text-white p-8">
    <div class="flex items-center gap-4 mb-4">
      <button
        @click="$router.push('/')"
        class="bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded text-sm font-bold cursor-pointer"
      >
        &lt;- Back to List
      </button>
      <h1 class="text-2xl font-bold text-sky-400">
        {{ account.name }} — {{ soldier.name }}'s Stats Sheet (Lvl {{ soldier.level ?? '?' }})
      </h1>
    </div>

    <div
      class="p-3 rounded-lg border mb-6 font-bold text-sm"
      :class="
        canUpgrade
          ? 'bg-green-950 border-green-500 text-green-300'
          : 'bg-red-950 border-red-500 text-red-300'
      "
    >
      <span v-if="canUpgrade">
        [UPGRADE AVAILABLE] Credits: {{ account.credits }} T | Upgrade Cost:
        {{ soldier.upgradeCost }} T | Remaining after upgrade:
        {{ account.credits - soldier.upgradeCost }} T
      </span>
      <span v-else>
        [INSUFFICIENT FUNDS] Credits: {{ account.credits }} T | Upgrade Cost:
        {{ soldier.upgradeCost }} T (Short by
        {{ Math.max(0, soldier.upgradeCost - account.credits) }} T)
      </span>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
      <SoldierStatsPanel :account="account" :soldier="soldier" />
      <div class="lg:col-span-2">
        <SkillColorGrid :skills="soldier.skills" />
      </div>
    </div>

    <UpgradeChoicesBox
      :account="account"
      :soldier="soldier"
      :canUpgrade="canUpgrade"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAccountsStore } from '../stores/accountsStore'
import SoldierStatsPanel from '../components/SoldierStatsPanel.vue'
import SkillColorGrid from '../components/SkillColorGrid.vue'
import UpgradeChoicesBox from '../components/UpgradeChoicesBox.vue'

const route = useRoute()
const store = useAccountsStore()
const account = ref(null)

const soldier = computed(() => account.value?.firstSoldier || null)
const canUpgrade = computed(() => {
  if (!account.value || !soldier.value) return false
  return (
    soldier.value.upgradeCost > 0 &&
    account.value.credits >= soldier.value.upgradeCost
  )
})

onMounted(async () => {
  account.value = await store.getAccount(route.params.accountId)
})
</script>
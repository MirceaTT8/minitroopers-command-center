<template>
  <span
    v-if="isReady"
    class="px-3 py-1 text-xs font-bold text-green-300 bg-green-900/60 border border-green-500 rounded"
  >
    [READY] UPGRADE AVAILABLE
  </span>
  <span
    v-else
    class="px-3 py-1 text-xs font-bold text-red-300 bg-red-900/60 border border-red-500 rounded"
  >
    [LOCKED] NEED {{ Math.max(0, upgradeCost - credits) }} T
  </span>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  credits: {
    type: Number,
    required: true,
  },
  upgradeCost: {
    type: Number,
    required: true,
  },
})

const isReady = computed(
  () => props.upgradeCost > 0 && props.credits >= props.upgradeCost
)
</script>
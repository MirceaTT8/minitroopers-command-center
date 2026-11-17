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

const isReady = computed(() => props.credits >= props.upgradeCost)
</script>

<template>
  <span
    v-if="isReady"
    class="inline-flex items-center px-3 py-1 text-xs font-extrabold tracking-wide rounded-md bg-green-950/90 text-green-400 border border-green-500/70"
  >
    [READY] UPGRADE AVAILABLE
  </span>
  <span
    v-else
    class="inline-flex items-center px-3 py-1 text-xs font-extrabold tracking-wide rounded-md bg-red-950/90 text-red-300 border border-red-500/60"
  >
    [LOCKED] NEED CREDITS
  </span>
</template>

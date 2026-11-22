import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import {
  fetchAllAccounts,
  fetchAccountById,
  triggerAccountsSync,
  triggerAutoConfigAll,
  requestSoldierUpgrade,
  selectSoldierUpgrade,
  fetchAiUpgradeAdvice,
} from '../services/api'

const MAX_UPGRADES_PER_TROOPER = 5
const LLM_COOLDOWN_MS = 1500

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function hasAffordableOrPendingUpgrade(account) {
  const soldier = account?.firstSoldier
  if (!soldier) return false
  const hasPending =
    Array.isArray(soldier.availableUpgrades) && soldier.availableUpgrades.length > 0
  const canAfford = soldier.upgradeCost > 0 && account.credits >= soldier.upgradeCost
  return hasPending || canAfford
}

export const useAccountsStore = defineStore('accounts', () => {
  const accounts = ref([])
  const loading = ref(false)
  const syncing = ref(false)
  const autoConfiguring = ref(false)
  const autoConfigMessage = ref('')
  const upgradingAccountIds = ref({})
  const error = ref('')

  // Auto-Upgrade All (AI) state
  const autoUpgrading = ref(false)
  const autoUpgradeStopRequested = ref(false)
  const autoUpgradeLogs = ref([])
  const autoUpgradeProgress = ref({
    phase: 'idle', // 'idle' | 'syncing' | 'upgrading' | 'stopped' | 'done'
    currentAccountId: null,
    currentTrooperStep: 0,
    totalAccounts: 0,
    processedAccounts: 0,
    totalUpgradesApplied: 0,
    skippedAccounts: [],
  })

  const readyToUpgradeCount = computed(() =>
    accounts.value.filter((acc) => hasAffordableOrPendingUpgrade(acc)).length
  )

  function pushAutoLog(level, message) {
    const time = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    autoUpgradeLogs.value.unshift({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      time,
      level, // 'info' | 'success' | 'warn' | 'error'
      message,
    })
  }

  function clearAutoUpgradeLogs() {
    autoUpgradeLogs.value = []
    if (!autoUpgrading.value) {
      autoUpgradeProgress.value = {
        phase: 'idle',
        currentAccountId: null,
        currentTrooperStep: 0,
        totalAccounts: 0,
        processedAccounts: 0,
        totalUpgradesApplied: 0,
        skippedAccounts: [],
      }
    }
  }

  function stopAutoUpgrade() {
    if (autoUpgrading.value) {
      autoUpgradeStopRequested.value = true
      pushAutoLog('warn', 'Stop requested. Will halt cleanly after the current step finishes...')
    }
  }

  function replaceAccountInList(updatedAccount) {
    if (!updatedAccount) return
    const idx = accounts.value.findIndex(
      (acc) => acc.id.toLowerCase() === updatedAccount.id.toLowerCase()
    )
    if (idx !== -1) {
      accounts.value[idx] = updatedAccount
    } else {
      accounts.value.push(updatedAccount)
    }
  }

  async function loadAccounts() {
    loading.value = true
    error.value = ''
    try {
      accounts.value = await fetchAllAccounts()
    } catch (err) {
      error.value = err.message
    } finally {
      loading.value = false
    }
  }

  async function syncAccounts() {
    syncing.value = true
    error.value = ''
    try {
      const result = await triggerAccountsSync()
      accounts.value = result.accounts || []
      return true
    } catch (err) {
      error.value = err.message
      return false
    } finally {
      syncing.value = false
    }
  }

  async function autoConfigureAll(accountIds = null) {
    if (autoConfiguring.value || syncing.value || autoUpgrading.value) return null
    autoConfiguring.value = true
    autoConfigMessage.value = ''
    error.value = ''
    try {
      const result = await triggerAutoConfigAll(accountIds)
      if (Array.isArray(result.accounts)) {
        accounts.value = result.accounts
      }
      autoConfigMessage.value = result.message || 'Auto-config complete'
      return result
    } catch (err) {
      error.value = err.message
      return null
    } finally {
      autoConfiguring.value = false
    }
  }

  async function getAccount(accountId) {
    const existing = accounts.value.find(
      (acc) => acc.id.toLowerCase() === accountId.toLowerCase()
    )
    if (existing) return existing

    try {
      const fetched = await fetchAccountById(accountId)
      replaceAccountInList(fetched)
      return fetched
    } catch (err) {
      error.value = err.message
      return null
    }
  }

  async function requestUpgradeForAccount(accountId) {
    const key = accountId.toLowerCase()
    upgradingAccountIds.value[key] = true
    error.value = ''
    try {
      const result = await requestSoldierUpgrade(accountId)
      if (result.account) {
        replaceAccountInList(result.account)
      }
      return result.account
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      upgradingAccountIds.value[key] = false
    }
  }

  async function chooseUpgradeForAccount(accountId, selectUrl) {
    const key = accountId.toLowerCase()
    upgradingAccountIds.value[key] = true
    error.value = ''
    try {
      const result = await selectSoldierUpgrade(accountId, selectUrl)
      if (result.account) {
        replaceAccountInList(result.account)
      }
      return result.account
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      upgradingAccountIds.value[key] = false
    }
  }

  function isAccountUpgrading(accountId) {
    return Boolean(upgradingAccountIds.value[accountId?.toLowerCase()])
  }

  /**
   * Auto-Upgrade All First Soldiers (/t/0) sequentially using Gemini LLM.
   * - Syncs all accounts first (--scrape-only)
   * - Loops on each trooper until out of credits or hard cap (5) is reached
   * - Strictly skips & leaves a trooper alone for the whole run on any LLM or server error
   */
  async function autoUpgradeAllAccounts(recruiterFilter = 'ALL') {
    if (autoUpgrading.value || syncing.value || autoConfiguring.value) return

    autoUpgrading.value = true
    autoUpgradeStopRequested.value = false
    autoUpgradeLogs.value = []
    error.value = ''

    const skippedSet = new Set()

    autoUpgradeProgress.value = {
      phase: 'syncing',
      currentAccountId: null,
      currentTrooperStep: 0,
      totalAccounts: 0,
      processedAccounts: 0,
      totalUpgradesApplied: 0,
      skippedAccounts: [],
    }

    try {
      // 1. SKIPPED: Sync all accounts first so credits, levels, and choices are 100% fresh
      // pushAutoLog('info', 'Step 1: Syncing all accounts (--scrape-only) before upgrading...')
      // const syncOk = await syncAccounts()
      // if (!syncOk) {
      //   pushAutoLog('error', `Sync failed: ${error.value || 'Unknown error'}. Aborting auto-upgrade.`)
      //   autoUpgradeProgress.value.phase = 'stopped'
      //   return
      // }
      // pushAutoLog('success', `Sync complete. Loaded ${accounts.value.length} accounts.`)

      pushAutoLog('info', 'Step 1: Skipping scrape — loading cached accounts...')
      await loadAccounts()
      pushAutoLog('success', `Loaded ${accounts.value.length} cached account(s).`)

      if (autoUpgradeStopRequested.value) {
        autoUpgradeProgress.value.phase = 'stopped'
        pushAutoLog('warn', 'Auto-upgrade stopped after sync.')
        return
      }

      // 2. Select target accounts based on active Recruiter filter
      const targetIds = accounts.value
        .filter((acc) => {
          if (recruiterFilter === 'ALL') return true
          return (acc.recruiter || 'Unassigned') === recruiterFilter
        })
        .map((acc) => acc.id)

      autoUpgradeProgress.value.phase = 'upgrading'
      autoUpgradeProgress.value.totalAccounts = targetIds.length

      pushAutoLog(
        'info',
        `Step 2: Starting AI auto-upgrade loop for ${targetIds.length} account(s) (Cap: ${MAX_UPGRADES_PER_TROOPER}/trooper, Scope: ${recruiterFilter}).`
      )

      // 3. Process every account strictly one-by-one
      for (const accountId of targetIds) {
        if (autoUpgradeStopRequested.value) break
        if (skippedSet.has(accountId.toLowerCase())) continue

        autoUpgradeProgress.value.currentAccountId = accountId
        autoUpgradeProgress.value.currentTrooperStep = 0

        let upgradesDoneForTrooper = 0

        // Inner loop: keep upgrading this trooper until out of credits or hard cap (5)
        while (upgradesDoneForTrooper < MAX_UPGRADES_PER_TROOPER) {
          if (autoUpgradeStopRequested.value) break

          let currentAcc = accounts.value.find(
            (a) => a.id.toLowerCase() === accountId.toLowerCase()
          )
          if (!currentAcc || !hasAffordableOrPendingUpgrade(currentAcc)) {
            if (upgradesDoneForTrooper === 0) {
              pushAutoLog(
                'info',
                `[${accountId}] No affordable upgrade (${currentAcc?.credits ?? 0} T / ${currentAcc?.firstSoldier?.upgradeCost ?? 0} T). Moving on.`
              )
            }
            break
          }

          const soldierBefore = currentAcc.firstSoldier
          const prevSnapshot = {
            level: soldierBefore.level,
            credits: currentAcc.credits,
            skillCount: soldierBefore.skills?.length || 0,
            pendingCount: soldierBefore.availableUpgrades?.length || 0,
          }

          autoUpgradeProgress.value.currentTrooperStep = upgradesDoneForTrooper + 1

          try {
            // 3a. Request upgrade on /t/0 if rolled choices aren't revealed yet
            let hasPending =
              Array.isArray(soldierBefore.availableUpgrades) &&
              soldierBefore.availableUpgrades.length > 0

            if (!hasPending) {
              pushAutoLog(
                'info',
                `[${accountId}] (${upgradesDoneForTrooper + 1}/${MAX_UPGRADES_PER_TROOPER}) Requesting /t/0 upgrade for ${soldierBefore.name} (Lvl ${soldierBefore.level ?? '?'}, ${currentAcc.credits} T >= ${soldierBefore.upgradeCost} T)...`
              )
              currentAcc = await requestUpgradeForAccount(accountId)
            }

            const options = currentAcc?.firstSoldier?.availableUpgrades || []
            if (options.length === 0) {
              throw new Error('No rolled skill options appeared on /t/0 after upgrade request.')
            }

            if (autoUpgradeStopRequested.value) {
              pushAutoLog(
                'warn',
                `[${accountId}] Stop requested before LLM selection. Rolled choices remain saved on /t/0.`
              )
              break
            }

            // 3b. Gentle cooldown before Gemini API call to respect rate limits
            await sleep(LLM_COOLDOWN_MS)

            // 3c. Ask Gemini LLM (strictLlm: true -> fails instead of falling back)
            pushAutoLog(
              'info',
              `[${accountId}] Asking Gemini LLM to choose from: ${options.map((o) => o.name).join(', ')}...`
            )
            const advice = await fetchAiUpgradeAdvice(accountId, { strictLlm: true })

            if (!advice || advice.source !== 'llm') {
              throw new Error('Gemini did not return a live LLM recommendation.')
            }

            // Match LLM recommendation to an exact rolled option with a selectUrl
            const chosenOpt = options.find(
              (o) =>
                o.key === advice.recommendedKey ||
                o.name.toLowerCase() === String(advice.recommendedSkill || '').toLowerCase()
            )

            if (!chosenOpt || !chosenOpt.selectUrl) {
              throw new Error(
                `LLM picked "${advice.recommendedSkill || advice.recommendedKey}", which does not match any valid selectable option.`
              )
            }

            // 3d. Equip the chosen upgrade
            pushAutoLog(
              'info',
              `[${accountId}] Gemini picked "${chosenOpt.name}" (${advice.confidence ?? '?'}% confidence). Equipping...`
            )
            const updatedAcc = await chooseUpgradeForAccount(accountId, chosenOpt.selectUrl)

            // Verify actual state progress to prevent infinite loops on stale HTML
            const soldierAfter = updatedAcc?.firstSoldier
            const progressed =
              soldierAfter &&
              (soldierAfter.level !== prevSnapshot.level ||
                updatedAcc.credits !== prevSnapshot.credits ||
                (soldierAfter.skills?.length || 0) !== prevSnapshot.skillCount ||
                (soldierAfter.availableUpgrades?.length || 0) !== prevSnapshot.pendingCount)

            if (!progressed) {
              throw new Error(
                'Account HTML did not reflect upgrade changes after selecting skill (stopping to prevent loop).'
              )
            }

            upgradesDoneForTrooper += 1
            autoUpgradeProgress.value.totalUpgradesApplied += 1

            pushAutoLog(
              'success',
              `[${accountId}] Equipped "${chosenOpt.name}"! Now Lvl ${soldierAfter.level ?? '?'} | Credits: ${updatedAcc.credits} T | Next Cost: ${soldierAfter.upgradeCost} T.`
            )
          } catch (trooperErr) {
            // If ALL models exhausted their daily quota, halt the entire batch immediately
            // so we NEVER spend credits on remaining troopers without an LLM
            if (trooperErr.code === 'ALL_MODELS_QUOTA_EXHAUSTED') {
              skippedSet.add(accountId.toLowerCase())
              autoUpgradeProgress.value.skippedAccounts = Array.from(skippedSet)
              autoUpgradeStopRequested.value = true
              pushAutoLog(
                'error',
                `[QUOTA EXHAUSTED] Halting entire Auto-Upgrade batch so no more credits are spent: ${trooperErr.message}`
              )
              break
            }

            // Single-trooper error: skip this trooper and leave it alone for the rest of the run
            skippedSet.add(accountId.toLowerCase())
            autoUpgradeProgress.value.skippedAccounts = Array.from(skippedSet)
            error.value = ''
            pushAutoLog(
              'error',
              `[${accountId}] SKIPPED for rest of run: ${trooperErr.message}`
            )
            break
          }
        }

        // Log if we stopped because of the 5-upgrade hard cap
        const finalAcc = accounts.value.find(
          (a) => a.id.toLowerCase() === accountId.toLowerCase()
        )
        if (
          upgradesDoneForTrooper >= MAX_UPGRADES_PER_TROOPER &&
          finalAcc &&
          hasAffordableOrPendingUpgrade(finalAcc) &&
          !skippedSet.has(accountId.toLowerCase())
        ) {
          pushAutoLog(
            'warn',
            `[${accountId}] Hit hard cap of ${MAX_UPGRADES_PER_TROOPER} upgrades (still has ${finalAcc.credits} T). Moving to next trooper.`
          )
        }

        autoUpgradeProgress.value.processedAccounts += 1
      }

      autoUpgradeProgress.value.currentAccountId = null
      autoUpgradeProgress.value.phase = autoUpgradeStopRequested.value ? 'stopped' : 'done'

      pushAutoLog(
        autoUpgradeStopRequested.value ? 'warn' : 'success',
        `Auto-Upgrade ${autoUpgradeStopRequested.value ? 'stopped' : 'finished'}: ${autoUpgradeProgress.value.totalUpgradesApplied} upgrade(s) applied across ${autoUpgradeProgress.value.processedAccounts}/${autoUpgradeProgress.value.totalAccounts} accounts. Skipped: ${skippedSet.size}.`
      )
    } finally {
      autoUpgrading.value = false
    }
  }

  return {
    accounts,
    loading,
    syncing,
    autoConfiguring,
    autoConfigMessage,
    upgradingAccountIds,
    error,
    readyToUpgradeCount,
    autoUpgrading,
    autoUpgradeStopRequested,
    autoUpgradeLogs,
    autoUpgradeProgress,
    loadAccounts,
    syncAccounts,
    autoConfigureAll,
    getAccount,
    requestUpgradeForAccount,
    chooseUpgradeForAccount,
    isAccountUpgrading,
    autoUpgradeAllAccounts,
    stopAutoUpgrade,
    clearAutoUpgradeLogs,
  }
})
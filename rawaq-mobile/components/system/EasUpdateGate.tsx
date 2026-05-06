import { useCallback, useEffect, useRef } from 'react'
import { AppState, Platform } from 'react-native'
import * as Updates from 'expo-updates'

const MIN_CHECK_INTERVAL_MS = 60_000

export function EasUpdateGate() {
  const checkingRef = useRef(false)
  const reloadingRef = useRef(false)
  const lastCheckRef = useRef(0)

  const checkAndApplyUpdate = useCallback(async (reason: string) => {
    if (Platform.OS === 'web' || !Updates.isEnabled || reloadingRef.current || checkingRef.current) {
      return
    }

    const now = Date.now()
    if (now - lastCheckRef.current < MIN_CHECK_INTERVAL_MS) {
      return
    }

    checkingRef.current = true
    lastCheckRef.current = now

    try {
      console.log('[updates] running', {
        channel: Updates.channel,
        isEmbeddedLaunch: Updates.isEmbeddedLaunch,
        reason,
        runtimeVersion: Updates.runtimeVersion,
        updateId: Updates.updateId,
      })

      const check = await Updates.checkForUpdateAsync()
      if (!check.isAvailable && !check.isRollBackToEmbedded) {
        return
      }

      const fetched = await Updates.fetchUpdateAsync()
      if (!fetched.isNew && !fetched.isRollBackToEmbedded) {
        return
      }

      reloadingRef.current = true
      await Updates.reloadAsync()
    } catch (error) {
      console.warn('[updates] check/apply failed', error)
    } finally {
      checkingRef.current = false
    }
  }, [])

  useEffect(() => {
    const startupTimer = setTimeout(() => {
      void checkAndApplyUpdate('startup')
    }, 1500)

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void checkAndApplyUpdate('foreground')
      }
    })

    return () => {
      clearTimeout(startupTimer)
      subscription.remove()
    }
  }, [checkAndApplyUpdate])

  return null
}

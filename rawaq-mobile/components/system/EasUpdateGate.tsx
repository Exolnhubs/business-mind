import { useCallback, useEffect, useRef } from 'react'
import { Alert, AppState, Platform } from 'react-native'
import * as Updates from 'expo-updates'

const MIN_CHECK_INTERVAL_MS = 60_000

export function EasUpdateGate() {
  const checkingRef = useRef(false)
  const reloadingRef = useRef(false)
  const lastCheckRef = useRef(0)

  const reloadWithUpdate = useCallback(async () => {
    if (reloadingRef.current) return
    reloadingRef.current = true
    await Updates.reloadAsync()
  }, [])

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

      const fallbackTimer = setTimeout(() => {
        void reloadWithUpdate()
      }, 2500)

      Alert.alert(
        'Update ready',
        'A critical fix has been downloaded. Rawaq will restart now.',
        [{
          text: 'Restart',
          onPress: () => {
            clearTimeout(fallbackTimer)
            void reloadWithUpdate()
          },
        }],
        { cancelable: false },
      )
    } catch (error) {
      console.warn('[updates] check/apply failed', error)
    } finally {
      checkingRef.current = false
    }
  }, [reloadWithUpdate])

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

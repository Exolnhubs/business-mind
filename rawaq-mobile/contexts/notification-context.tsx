import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './auth-context'

interface NotificationContextValue {
  unreadCount: number
  resetUnread: () => void
  incrementUnread: () => void
}

const NotificationContext = createContext<NotificationContextValue>({
  unreadCount: 0,
  resetUnread: () => {},
  incrementUnread: () => {},
})

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    if (!user) { setUnreadCount(0); return }

    // Initial count
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false)
      .then(({ count }) => setUnreadCount(count ?? 0))

    // Realtime: increment badge on new notification insert
    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => setUnreadCount((n) => n + 1),
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user])

  return (
    <NotificationContext.Provider value={{
      unreadCount,
      resetUnread:    () => setUnreadCount(0),
      incrementUnread: () => setUnreadCount((n) => n + 1),
    }}>
      {children}
    </NotificationContext.Provider>
  )
}

export const useNotifications = () => useContext(NotificationContext)

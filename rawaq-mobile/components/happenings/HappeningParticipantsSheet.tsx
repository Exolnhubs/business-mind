import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { apiGet, apiPost } from '@/lib/api'
import { Colors, FontSize, FontWeight, Radius, Shadow, Spacing } from '@/theme'
import { formatDate } from '@/lib/utils'

type Participant = {
  id: string
  display_name: string
  avatar_url: string | null
  joined_at: string
  platform_joined_at: string
}

type PendingParticipant = {
  user_id: string
  display_name: string
  avatar_url: string | null
  requested_at: string
}

type Props = {
  visible: boolean
  happeningId: string | null
  isAuthor?: boolean
  requiresApproval?: boolean
  onClose: () => void
}

const PAGE_SIZE = 15

export function HappeningParticipantsSheet({ visible, happeningId, isAuthor, requiresApproval, onClose }: Props) {
  const router = useRouter()
  const showTabs = isAuthor && requiresApproval

  const [activeTab, setActiveTab]   = useState<'approved' | 'pending'>('approved')
  const [loading, setLoading]       = useState(false)
  const [total, setTotal]           = useState(0)
  const [participants, setParticipants] = useState<Participant[]>([])

  const [loadingPending, setLoadingPending] = useState(false)
  const [pendingList, setPendingList]       = useState<PendingParticipant[]>([])
  const [actionUser, setActionUser]         = useState<string | null>(null)

  // Load approved participants
  useEffect(() => {
    if (!visible || !happeningId || activeTab !== 'approved') return
    let active = true
    const id   = happeningId

    async function load() {
      setLoading(true)
      const { data } = await apiGet<{ total: number; participants: Participant[] }>(
        `/api/happenings/${id}/participants?limit=${PAGE_SIZE}`,
      )
      if (!active) return
      setTotal(data?.total ?? 0)
      setParticipants(data?.participants ?? [])
      setLoading(false)
    }

    void load()
    return () => { active = false }
  }, [visible, happeningId, activeTab])

  // Load pending participants (author only)
  useEffect(() => {
    if (!visible || !happeningId || !showTabs || activeTab !== 'pending') return
    let active = true
    const id   = happeningId

    async function load() {
      setLoadingPending(true)
      const { data } = await apiGet<{ pending: PendingParticipant[] }>(
        `/api/happenings/${id}/approve`,
      )
      if (!active) return
      setPendingList(data?.pending ?? [])
      setLoadingPending(false)
    }

    void load()
    return () => { active = false }
  }, [visible, happeningId, showTabs, activeTab])

  async function handleAction(userId: string, action: 'approve' | 'reject') {
    if (!happeningId) return
    setActionUser(userId)
    const { error } = await apiPost(`/api/happenings/${happeningId}/approve`, { user_id: userId, action })
    setActionUser(null)
    if (error) {
      Alert.alert('Error', error)
      return
    }
    setPendingList((prev) => prev.filter((p) => p.user_id !== userId))
    if (action === 'approve') setTotal((t) => t + 1)
  }

  function openProfile(userId: string) {
    onClose()
    router.push({ pathname: '/user/[id]', params: { id: userId } })
  }

  function viewAll() {
    if (!happeningId) return
    onClose()
    router.push({ pathname: '/happenings/[id]/participants', params: { id: happeningId } })
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Participants</Text>
              <Text style={styles.subtitle}>{total} joined</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={18} color={Colors.gray[600]} />
            </TouchableOpacity>
          </View>

          {showTabs && (
            <View style={styles.tabBar}>
              <TouchableOpacity
                onPress={() => setActiveTab('approved')}
                style={[styles.tab, activeTab === 'approved' && styles.tabActive]}
              >
                <Text style={[styles.tabText, activeTab === 'approved' && styles.tabTextActive]}>
                  Approved ({total})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setActiveTab('pending')}
                style={[styles.tab, activeTab === 'pending' && styles.tabActive]}
              >
                <Text style={[styles.tabText, activeTab === 'pending' && styles.tabTextActive]}>
                  Pending ({pendingList.length})
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {activeTab === 'approved' ? (
            loading ? (
              <View style={styles.center}>
                <ActivityIndicator color={Colors.brand[500]} />
              </View>
            ) : participants.length === 0 ? (
              <View style={styles.center}>
                <Text style={styles.emptyText}>No one has joined yet.</Text>
              </View>
            ) : (
              <ScrollView contentContainerStyle={styles.list}>
                {participants.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    style={styles.row}
                    activeOpacity={0.7}
                    onPress={() => openProfile(p.id)}
                  >
                    <View style={styles.avatar}>
                      {p.avatar_url ? (
                        <Image source={{ uri: p.avatar_url }} style={styles.avatarImg} />
                      ) : (
                        <Text style={styles.avatarFallback}>
                          {p.display_name.slice(0, 1).toUpperCase()}
                        </Text>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name} numberOfLines={1}>{p.display_name}</Text>
                      <Text style={styles.meta} numberOfLines={1}>
                        Joined Rawaq · {formatDate(p.platform_joined_at)}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={14} color={Colors.gray[400]} />
                  </TouchableOpacity>
                ))}

                {total > PAGE_SIZE && (
                  <TouchableOpacity onPress={viewAll} style={styles.viewAll}>
                    <Text style={styles.viewAllText}>
                      View all {total} participants
                    </Text>
                    <Ionicons name="chevron-forward" size={14} color={Colors.brand[600]} />
                  </TouchableOpacity>
                )}
              </ScrollView>
            )
          ) : (
            loadingPending ? (
              <View style={styles.center}>
                <ActivityIndicator color={Colors.brand[500]} />
              </View>
            ) : pendingList.length === 0 ? (
              <View style={styles.center}>
                <Text style={styles.emptyText}>No pending requests.</Text>
              </View>
            ) : (
              <ScrollView contentContainerStyle={styles.list}>
                {pendingList.map((p) => (
                  <View key={p.user_id} style={styles.pendingRow}>
                    <TouchableOpacity
                      style={styles.pendingIdentity}
                      activeOpacity={0.72}
                      onPress={() => openProfile(p.user_id)}
                    >
                      <View style={styles.avatar}>
                        {p.avatar_url ? (
                          <Image source={{ uri: p.avatar_url }} style={styles.avatarImg} />
                        ) : (
                          <Text style={styles.avatarFallback}>
                            {p.display_name.slice(0, 1).toUpperCase()}
                          </Text>
                        )}
                      </View>
                      <View style={styles.identityText}>
                        <Text style={styles.name} numberOfLines={1}>{p.display_name}</Text>
                        <Text style={styles.meta} numberOfLines={1}>
                          Requested · {formatDate(p.requested_at)}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={14} color={Colors.gray[400]} />
                    </TouchableOpacity>
                    <View style={styles.pendingActions}>
                      <TouchableOpacity
                        onPress={() => handleAction(p.user_id, 'approve')}
                        disabled={actionUser === p.user_id}
                        style={[styles.approveBtn, actionUser === p.user_id && { opacity: 0.5 }]}
                      >
                        <Text style={styles.approveBtnText}>Approve</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleAction(p.user_id, 'reject')}
                        disabled={actionUser === p.user_id}
                        style={[styles.rejectBtn, actionUser === p.user_id && { opacity: 0.5 }]}
                      >
                        <Text style={styles.rejectBtnText}>Decline</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )
          )}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.lg,
    maxHeight: '80%',
    ...Shadow.card,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.gray[300],
    marginBottom: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  title: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.gray[900] },
  subtitle: { fontSize: FontSize.xs, color: Colors.gray[500], marginTop: 2 },
  closeButton: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.gray[100],
    alignItems: 'center', justifyContent: 'center',
  },
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    borderRadius: Radius.xl,
    backgroundColor: Colors.gray[100],
    padding: 4,
    gap: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.lg,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: Colors.white,
  },
  tabText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.gray[500],
  },
  tabTextActive: {
    color: Colors.gray[900],
  },
  center: { padding: Spacing.xl, alignItems: 'center' },
  emptyText: { fontSize: FontSize.sm, color: Colors.gray[500] },
  list: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  pendingIdentity: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  identityText: {
    flex: 1,
    minWidth: 0,
  },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.brand[100],
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: 40, height: 40 },
  avatarFallback: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.brand[700] },
  name: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.gray[900] },
  meta: { fontSize: FontSize.xs, color: Colors.gray[500], marginTop: 2 },
  pendingActions: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  approveBtn: {
    borderRadius: Radius.lg,
    backgroundColor: Colors.brand[600],
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
  },
  approveBtnText: {
    fontSize: 11,
    fontWeight: FontWeight.bold,
    color: Colors.white,
  },
  rejectBtn: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
  },
  rejectBtnText: {
    fontSize: 11,
    fontWeight: FontWeight.semibold,
    color: Colors.gray[600],
  },
  viewAll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: Spacing.md,
  },
  viewAllText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.brand[600] },
})

import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
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
import { apiGet } from '@/lib/api'
import { Colors, FontSize, FontWeight, Radius, Shadow, Spacing } from '@/theme'
import { formatDate } from '@/lib/utils'

type Participant = {
  id: string
  display_name: string
  avatar_url: string | null
  joined_at: string
  platform_joined_at: string
}

type ParticipantsResponse = {
  total: number
  participants: Participant[]
}

type Props = {
  visible: boolean
  happeningId: string | null
  onClose: () => void
}

const PAGE_SIZE = 15

export function HappeningParticipantsSheet({ visible, happeningId, onClose }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [participants, setParticipants] = useState<Participant[]>([])

  useEffect(() => {
    if (!visible || !happeningId) return
    let active = true
    const id = happeningId

    async function load() {
      setLoading(true)
      const { data } = await apiGet<ParticipantsResponse>(
        `/api/happenings/${id}/participants?limit=${PAGE_SIZE}`,
      )
      if (!active) return
      setTotal(data?.total ?? 0)
      setParticipants(data?.participants ?? [])
      setLoading(false)
    }

    void load()
    return () => {
      active = false
    }
  }, [visible, happeningId])

  function openProfile(userId: string) {
    onClose()
    router.push(`/user/${userId}` as any)
  }

  function viewAll() {
    if (!happeningId) return
    onClose()
    router.push(`/happenings/${happeningId}/participants` as any)
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

          {loading ? (
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
  viewAll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: Spacing.md,
  },
  viewAllText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.brand[600] },
})

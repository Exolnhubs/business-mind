import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { apiGet } from '@/lib/api'
import { Colors, FontSize, FontWeight, Spacing } from '@/theme'
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

const PAGE_SIZE = 15

export default function HappeningParticipantsScreen() {
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const [participants, setParticipants] = useState<Participant[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const loadPage = useCallback(async (offset: number, replace: boolean) => {
    if (!id) return
    if (replace) setLoading(true)
    else setLoadingMore(true)
    const { data } = await apiGet<ParticipantsResponse>(
      `/api/happenings/${id}/participants?limit=${PAGE_SIZE}&offset=${offset}`,
      { force: replace },
    )
    setTotal(data?.total ?? 0)
    setParticipants((prev) => (replace ? (data?.participants ?? []) : [...prev, ...(data?.participants ?? [])]))
    setLoading(false)
    setLoadingMore(false)
    setRefreshing(false)
  }, [id])

  useEffect(() => {
    void loadPage(0, true)
  }, [loadPage])

  function onEndReached() {
    if (loadingMore || loading || participants.length >= total) return
    void loadPage(participants.length, false)
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Participants' }} />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.brand[500]} />
        </View>
      ) : (
        <FlatList
          data={participants}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true)
                void loadPage(0, true)
              }}
              tintColor={Colors.brand[500]}
            />
          }
          ListHeaderComponent={
            <Text style={styles.header}>{total} joined</Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.7}
              onPress={() => router.push(`/user/${item.id}` as any)}
            >
              <View style={styles.avatar}>
                {item.avatar_url ? (
                  <Image source={{ uri: item.avatar_url }} style={styles.avatarImg} />
                ) : (
                  <Text style={styles.avatarFallback}>
                    {item.display_name.slice(0, 1).toUpperCase()}
                  </Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>{item.display_name}</Text>
                <Text style={styles.meta} numberOfLines={1}>
                  Joined Rawaq · {formatDate(item.platform_joined_at)}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color={Colors.gray[400]} />
            </TouchableOpacity>
          )}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore ? (
              <View style={{ paddingVertical: Spacing.md }}>
                <ActivityIndicator color={Colors.brand[500]} />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>No one has joined yet.</Text>
            </View>
          }
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  emptyText: { fontSize: FontSize.sm, color: Colors.gray[500] },
  list: { padding: Spacing.lg, paddingBottom: Spacing['5xl'] },
  header: { fontSize: FontSize.xs, color: Colors.gray[500], marginBottom: Spacing.md, textTransform: 'uppercase', fontWeight: FontWeight.bold },
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
})

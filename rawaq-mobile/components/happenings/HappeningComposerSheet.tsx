import { useEffect, useState } from 'react'
import {
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { LocationPickerModal, type PickedLocation } from '@/components/communities/LocationPickerModal'
import { apiGet, apiPost } from '@/lib/api'
import { Colors, FontSize, FontWeight, Radius, Shadow, Spacing } from '@/theme'
import type { Community, HappeningType } from '@/types/database'

type JoinedCommunity = Pick<Community, 'id' | 'name' | 'slug' | 'level' | 'city' | 'member_count'>

type HappeningComposerSheetProps = {
  visible: boolean
  onClose: () => void
  onPosted?: (community: JoinedCommunity) => void
}

const TYPE_LABELS: Record<HappeningType, string> = {
  open_invite: 'Invite',
  info: 'Info',
  question: 'Question',
  alert: 'Alert',
}

const TYPE_ICONS: Record<HappeningType, keyof typeof Ionicons.glyphMap> = {
  open_invite: 'add-circle-outline',
  info: 'information-circle-outline',
  question: 'help-circle-outline',
  alert: 'alert-circle-outline',
}

const LEVEL_LABELS: Record<JoinedCommunity['level'], string> = {
  micro: 'Micro',
  interest: 'Interest',
  district: 'District',
  city: 'City',
  country: 'Country',
}

export function HappeningComposerSheet({ visible, onClose, onPosted }: HappeningComposerSheetProps) {
  const router = useRouter()
  const [communities, setCommunities] = useState<JoinedCommunity[]>([])
  const [loadingCommunities, setLoadingCommunities] = useState(false)
  const [selectedCommunity, setSelectedCommunity] = useState<JoinedCommunity | null>(null)
  const [postType, setPostType] = useState<HappeningType>('open_invite')
  const [postBody, setPostBody] = useState('')
  const [postExpiry, setPostExpiry] = useState(6)
  const [postLocation, setPostLocation] = useState<PickedLocation | null>(null)
  const [posting, setPosting] = useState(false)
  const [showLocationPicker, setShowLocationPicker] = useState(false)

  useEffect(() => {
    if (!visible) return
    let active = true

    async function loadJoinedCommunities() {
      setLoadingCommunities(true)
      const { data } = await apiGet<{ data: JoinedCommunity[] }>(
        '/api/communities?member_only=true&per_page=50&page=1',
        { ttlMs: 60_000 },
      )
      if (active) {
        setCommunities(data?.data ?? [])
        setLoadingCommunities(false)
      }
    }

    void loadJoinedCommunities()

    return () => {
      active = false
    }
  }, [visible])

  function resetComposer() {
    setSelectedCommunity(null)
    setPostType('open_invite')
    setPostBody('')
    setPostExpiry(6)
    setPostLocation(null)
    setPosting(false)
  }

  function handleClose() {
    setShowLocationPicker(false)
    resetComposer()
    onClose()
  }

  function openLocationPicker() {
    setTimeout(() => setShowLocationPicker(true), 0)
  }

  async function submitHappening() {
    if (!selectedCommunity || !postBody.trim()) return
    setPosting(true)
    const { error } = await apiPost(`/api/communities/${selectedCommunity.slug}/happenings`, {
      type: postType,
      body: postBody.trim(),
      expires_in_hours: postExpiry,
      ...(postLocation
        ? {
            lat: postLocation.lat,
            lng: postLocation.lng,
            location_label: postLocation.label,
          }
        : {}),
    })

    setPosting(false)

    if (error) {
      Alert.alert('Error', error)
      return
    }

    onPosted?.(selectedCommunity)
    handleClose()
  }

  return (
    <>
      <Modal visible={visible && !showLocationPicker} animationType="slide" transparent onRequestClose={handleClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.overlay}
        >
          <View style={styles.sheet}>
            <View style={styles.handle} />

            {!selectedCommunity ? (
              <>
                <View style={styles.header}>
                  <Text style={styles.title}>Post a happening</Text>
                  <Text style={styles.subtitle}>
                    Pick one of your joined communities to share an invite, question, update, or alert.
                  </Text>
                </View>

                {loadingCommunities ? (
                  <View style={styles.centerState}>
                    <ActivityIndicator color={Colors.brand[600]} />
                  </View>
                ) : communities.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Ionicons name="people-outline" size={26} color={Colors.gray[500]} />
                    <Text style={styles.emptyTitle}>Join a community first</Text>
                    <Text style={styles.emptyHint}>
                      Happenings are community-first, so you’ll need at least one joined community before posting.
                    </Text>
                    <TouchableOpacity
                      style={styles.primaryButton}
                      onPress={() => {
                        handleClose()
                        router.push('/communities')
                      }}
                    >
                      <Text style={styles.primaryButtonText}>Browse Communities</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <ScrollView
                    style={styles.communityList}
                    contentContainerStyle={styles.communityListContent}
                    showsVerticalScrollIndicator={false}
                  >
                    {communities.map((community) => (
                      <TouchableOpacity
                        key={community.id}
                        activeOpacity={0.84}
                        onPress={() => setSelectedCommunity(community)}
                        style={styles.communityCard}
                      >
                        <View style={styles.communityCardHeader}>
                          <Text style={styles.communityName}>{community.name}</Text>
                          <View style={styles.communityLevelBadge}>
                            <Text style={styles.communityLevelText}>{LEVEL_LABELS[community.level]}</Text>
                          </View>
                        </View>
                        <Text style={styles.communityMeta}>
                          {community.city ? `${community.city} • ` : ''}
                          {community.member_count.toLocaleString()} members
                        </Text>
                        <View style={styles.communityCardFooter}>
                          <Text style={styles.communityActionHint}>Post here</Text>
                          <Ionicons name="chevron-forward" size={16} color={Colors.brand[600]} />
                        </View>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}

                <View style={styles.actionsRow}>
                  <TouchableOpacity onPress={handleClose} style={styles.secondaryButton}>
                    <Text style={styles.secondaryButtonText}>Close</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <View style={styles.header}>
                  <TouchableOpacity
                    onPress={() => setSelectedCommunity(null)}
                    style={styles.backRow}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="chevron-back" size={18} color={Colors.gray[600]} />
                    <Text style={styles.backText}>Choose another community</Text>
                  </TouchableOpacity>
                  <Text style={styles.title}>Post in {selectedCommunity.name}</Text>
                  <Text style={styles.subtitle}>
                    Same quick happening flow, just reachable from anywhere on Home.
                  </Text>
                </View>

                <View style={styles.selectedCommunityCard}>
                  <Text style={styles.selectedCommunityLabel}>Posting to</Text>
                  <Text style={styles.selectedCommunityName}>{selectedCommunity.name}</Text>
                  <Text style={styles.selectedCommunityMeta}>
                    {LEVEL_LABELS[selectedCommunity.level]}
                    {selectedCommunity.city ? ` • ${selectedCommunity.city}` : ''}
                  </Text>
                </View>

                <View style={styles.typeChips}>
                  {(['open_invite', 'info', 'question', 'alert'] as HappeningType[]).map((type) => (
                    <TouchableOpacity
                      key={type}
                      onPress={() => setPostType(type)}
                      style={[styles.typeChip, postType === type && styles.typeChipActive]}
                    >
                      <Ionicons
                        name={TYPE_ICONS[type]}
                        size={13}
                        color={postType === type ? Colors.white : Colors.gray[600]}
                      />
                      <Text style={[styles.typeChipText, postType === type && styles.typeChipTextActive]}>
                        {TYPE_LABELS[type]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TextInput
                  value={postBody}
                  onChangeText={(value) => setPostBody(value.slice(0, 280))}
                  placeholder="What's happening? (e.g. Anyone for padel in 30 min?)"
                  placeholderTextColor={Colors.gray[400]}
                  multiline
                  maxLength={280}
                  style={styles.postInput}
                />
                <Text style={styles.charCount}>{postBody.length}/280</Text>

                <View style={styles.locationRow}>
                  <TouchableOpacity onPress={openLocationPicker} style={styles.locationButton}>
                    <Ionicons name="map-outline" size={13} color={Colors.gray[500]} />
                    <Text style={styles.locationButtonText}>
                      {postLocation ? 'Edit meetup spot' : 'Pick meetup spot'}
                    </Text>
                  </TouchableOpacity>
                  {postLocation && (
                    <TouchableOpacity
                      onPress={() => setPostLocation(null)}
                      style={[styles.locationButton, styles.locationButtonAttached]}
                    >
                      <Ionicons name="location" size={13} color="#15803d" />
                      <Text style={[styles.locationButtonText, styles.locationButtonTextAttached]} numberOfLines={1}>
                        {postLocation.label} x
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                <View style={styles.expiryRow}>
                  <Text style={styles.expiryLabel}>Expires in:</Text>
                  {[1, 3, 6, 12, 24].map((hours) => (
                    <TouchableOpacity
                      key={hours}
                      onPress={() => setPostExpiry(hours)}
                      style={[styles.expiryChip, postExpiry === hours && styles.expiryChipActive]}
                    >
                      <Text style={[styles.expiryChipText, postExpiry === hours && styles.expiryChipTextActive]}>
                        {hours}h
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    onPress={handleClose}
                    style={styles.secondaryButton}
                    disabled={posting}
                  >
                    <Text style={styles.secondaryButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={submitHappening}
                    disabled={posting || !postBody.trim()}
                    style={[styles.primaryButton, (posting || !postBody.trim()) && styles.primaryButtonDisabled]}
                  >
                    {posting
                      ? <ActivityIndicator size="small" color={Colors.white} />
                      : <Text style={styles.primaryButtonText}>Post Happening</Text>}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <LocationPickerModal
        visible={showLocationPicker}
        initialLocation={postLocation}
        onClose={() => setShowLocationPicker(false)}
        onConfirm={(location) => {
          setPostLocation(location)
          setShowLocationPicker(false)
        }}
      />
    </>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: Radius.xl + 4,
    borderTopRightRadius: Radius.xl + 4,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing['3xl'],
    maxHeight: '88%',
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.gray[300],
    alignSelf: 'center',
    marginBottom: Spacing.lg,
  },
  header: {
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.gray[900],
  },
  subtitle: {
    marginTop: Spacing.xs,
    fontSize: FontSize.sm,
    color: Colors.gray[500],
    lineHeight: 20,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  backText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    color: Colors.gray[600],
  },
  centerState: {
    paddingVertical: Spacing['3xl'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing['3xl'],
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.gray[50],
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.gray[100],
  },
  emptyTitle: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.gray[900],
  },
  emptyHint: {
    fontSize: FontSize.sm,
    color: Colors.gray[500],
    lineHeight: 20,
    textAlign: 'center',
  },
  communityList: {
    maxHeight: 360,
  },
  communityListContent: {
    gap: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  communityCard: {
    borderRadius: Radius.xl,
    backgroundColor: '#faf7f2',
    borderWidth: 1,
    borderColor: '#ede5db',
    padding: Spacing.lg,
    ...Shadow.card,
  },
  communityCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  communityName: {
    flex: 1,
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.gray[900],
  },
  communityLevelBadge: {
    borderRadius: Radius.full,
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#e7ded3',
  },
  communityLevelText: {
    fontSize: 11,
    fontWeight: FontWeight.semibold,
    color: Colors.gray[600],
  },
  communityMeta: {
    marginTop: 6,
    fontSize: FontSize.xs,
    color: Colors.gray[500],
  },
  communityCardFooter: {
    marginTop: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  communityActionHint: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.brand[600],
  },
  selectedCommunityCard: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: '#ddd6fe',
    backgroundColor: '#f5f3ff',
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  selectedCommunityLabel: {
    fontSize: 11,
    fontWeight: FontWeight.bold,
    color: '#6d28d9',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  selectedCommunityName: {
    marginTop: 6,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: '#4c1d95',
  },
  selectedCommunityMeta: {
    marginTop: 4,
    fontSize: FontSize.xs,
    color: '#6d28d9',
  },
  typeChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    backgroundColor: Colors.gray[100],
    borderWidth: 1,
    borderColor: Colors.gray[200],
  },
  typeChipActive: {
    backgroundColor: Colors.brand[600],
    borderColor: Colors.brand[600],
  },
  typeChipText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.gray[700],
  },
  typeChipTextActive: {
    color: Colors.white,
  },
  postInput: {
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: Radius.xl,
    padding: Spacing.md,
    fontSize: FontSize.sm,
    color: Colors.gray[900],
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: Spacing.xs,
  },
  charCount: {
    fontSize: 11,
    color: Colors.gray[400],
    textAlign: 'right',
    marginBottom: Spacing.sm,
  },
  locationRow: {
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  locationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 6,
    borderRadius: Radius.lg,
    backgroundColor: Colors.gray[100],
    borderWidth: 1,
    borderColor: Colors.gray[200],
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  locationButtonAttached: {
    backgroundColor: '#f0fdf4',
    borderColor: '#86efac',
  },
  locationButtonText: {
    fontSize: 11,
    color: Colors.gray[600],
  },
  locationButtonTextAttached: {
    color: '#15803d',
  },
  expiryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
    flexWrap: 'wrap',
  },
  expiryLabel: {
    fontSize: FontSize.xs,
    color: Colors.gray[500],
  },
  expiryChip: {
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 5,
    borderRadius: Radius.full,
    backgroundColor: Colors.gray[100],
    borderWidth: 1,
    borderColor: Colors.gray[200],
  },
  expiryChipActive: {
    backgroundColor: Colors.brand[100],
    borderColor: Colors.brand[300],
  },
  expiryChipText: {
    fontSize: 11,
    fontWeight: FontWeight.semibold,
    color: Colors.gray[600],
  },
  expiryChipTextActive: {
    color: Colors.brand[700],
  },
  actionsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  secondaryButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    borderRadius: Radius.xl,
    backgroundColor: Colors.gray[100],
  },
  secondaryButtonText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.gray[700],
  },
  primaryButton: {
    flex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    borderRadius: Radius.xl,
    backgroundColor: Colors.brand[600],
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.white,
  },
})

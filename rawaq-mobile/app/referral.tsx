import { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Share, ActivityIndicator, Alert, Clipboard,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { apiGet } from '@/lib/api'
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/theme'
import { TicketFlipLoader } from '@/components/ui/TicketFlipLoader'
import type { UserCoupon } from '@/types/database'

interface ReferralData {
  code: string
  referral_url: string
  clicks: number
  signups: number
  conversions: number
  coupons: UserCoupon[]
}

export default function ReferralScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [data, setData]     = useState<ReferralData | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied]   = useState(false)
  const headerTopSpacing = Math.max(Spacing.sm, Math.min(insets.top * 0.18, Spacing.md))

  useEffect(() => {
    apiGet<ReferralData>('/api/referral/code').then(({ data }) => {
      if (data) setData(data)
    }).finally(() => setLoading(false))
  }, [])

  async function handleShare() {
    if (!data) return
    try {
      await Share.share({
        message: `Join me on Rawaq 🎟️ Discover and book amazing local events. Use my link:\n${data.referral_url}`,
        url:     data.referral_url,
      })
    } catch { /* user dismissed */ }
  }

  async function handleCopy() {
    if (!data) return
    Clipboard.setString(data.referral_url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  function copyCouponCode(code: string) {
    Clipboard.setString(code)
    Alert.alert('Copied!', `Coupon code "${code}" copied to clipboard.`)
  }

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <View style={styles.centered}>
          <TicketFlipLoader size="md" />
        </View>
      </SafeAreaView>
    )
  }

  if (!data) {
    return (
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <View style={styles.centered}>
          <Text style={styles.errorText}>Could not load referral info.</Text>
        </View>
      </SafeAreaView>
    )
  }

  const activeCoupons = data.coupons.filter(
    (c) => c.promo && c.promo.used_count === 0 && new Date(c.expires_at) > new Date(),
  )

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingTop: headerTopSpacing }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={20} color={Colors.gray[700]} />
        </TouchableOpacity>
        <Text style={styles.title}>Refer &amp; Earn</Text>
      </View>

      {/* Explainer */}
      <View style={styles.heroCard}>
        <Text style={styles.heroTitle}>Invite friends, earn discounts 🎁</Text>
        <Text style={styles.heroItem}>✅ Friend registers → <Text style={styles.bold}>15% off coupon</Text> for you</Text>
        <Text style={styles.heroItem}>🎟️ First paid booking → <Text style={styles.bold}>25% off coupon</Text> for you</Text>
      </View>

      {/* Share link */}
      <View style={styles.card}>
        <Text style={styles.label}>Your referral link</Text>
        <View style={styles.linkRow}>
          <Text style={styles.linkText} numberOfLines={1}>{data.referral_url}</Text>
        </View>
        <Text style={styles.codeHint}>Code: <Text style={styles.mono}>{data.code}</Text></Text>
        <View style={styles.shareRow}>
          <TouchableOpacity style={styles.btnPrimary} onPress={handleShare}>
            <Ionicons name="share-outline" size={16} color={Colors.white} />
            <Text style={styles.btnPrimaryText}>Share</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnSecondary} onPress={handleCopy}>
            <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={16} color={Colors.brand[600]} />
            <Text style={styles.btnSecondaryText}>{copied ? 'Copied!' : 'Copy link'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        {[
          { label: 'Clicks',  value: data.clicks },
          { label: 'Joined',  value: data.signups },
          { label: 'Booked',  value: data.conversions },
        ].map(({ label, value }) => (
          <View key={label} style={styles.statCard}>
            <Text style={styles.statValue}>{value}</Text>
            <Text style={styles.statLabel}>{label}</Text>
          </View>
        ))}
      </View>

      {/* Coupons */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Your Coupons</Text>
          {activeCoupons.length > 0 && (
            <View style={styles.activeBadge}>
              <Text style={styles.activeBadgeText}>{activeCoupons.length} active</Text>
            </View>
          )}
        </View>
        {data.coupons.length === 0 ? (
          <Text style={styles.emptyText}>Share your link to start earning coupons.</Text>
        ) : (
          data.coupons.map((coupon) => {
            const promo = coupon.promo
            if (!promo) return null
            const isUsed    = promo.used_count >= 1
            const isExpired = new Date(coupon.expires_at) < new Date()
            const status    = isUsed ? 'used' : isExpired ? 'expired' : 'active'
            return (
              <View key={coupon.id} style={[styles.couponCard, (isUsed || isExpired) && styles.couponFaded]}>
                <View style={styles.couponLeft}>
                  <View style={styles.couponTopRow}>
                    <Text style={styles.couponCode}>{promo.code}</Text>
                    <View style={[styles.statusBadge,
                      status === 'active' && styles.statusActive,
                      status === 'used'   && styles.statusUsed,
                      status === 'expired'&& styles.statusExpired,
                    ]}>
                      <Text style={[styles.statusText,
                        status === 'active' && { color: Colors.green.text },
                        status === 'used'   && { color: Colors.gray[400] },
                        status === 'expired'&& { color: Colors.red.text },
                      ]}>{status}</Text>
                    </View>
                  </View>
                  <Text style={styles.couponMeta}>
                    {promo.discount_type === 'percent' ? `${promo.discount_value}% off` : `${promo.discount_value} off`}
                    {' · '}
                    {coupon.reason === 'referral_signup' ? 'Signup reward' : 'First booking reward'}
                  </Text>
                  <Text style={styles.couponExpiry}>
                    Expires {new Date(coupon.expires_at).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </Text>
                </View>
                {status === 'active' && (
                  <TouchableOpacity style={styles.copyBtn} onPress={() => copyCouponCode(promo.code)}>
                    <Text style={styles.copyBtnText}>Copy</Text>
                  </TouchableOpacity>
                )}
              </View>
            )
          })
        )}
      </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea:  { flex: 1, backgroundColor: Colors.gray[50] },
  container:  { flex: 1, backgroundColor: Colors.gray[50] },
  content:    { paddingHorizontal: Spacing.lg, paddingBottom: Spacing['3xl'] },
  centered:   { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText:  { color: Colors.gray[400], fontSize: FontSize.sm },

  header:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.lg },
  backBtn:  { padding: Spacing.xs },
  title:    { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.gray[900] },

  heroCard:   { backgroundColor: Colors.brand[50], borderRadius: Radius.xl, padding: Spacing.lg, marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.brand[100] },
  heroTitle:  { fontWeight: FontWeight.semibold, color: Colors.gray[900], marginBottom: Spacing.sm },
  heroItem:   { fontSize: FontSize.sm, color: Colors.gray[600], marginBottom: 4 },
  bold:       { fontWeight: FontWeight.semibold },

  card:    { backgroundColor: Colors.white, borderRadius: Radius.xl, padding: Spacing.lg, marginBottom: Spacing.md, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
  label:   { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.gray[700], marginBottom: Spacing.sm },
  linkRow: { backgroundColor: Colors.gray[50], borderRadius: Radius.md, padding: Spacing.sm + 2, marginBottom: Spacing.xs },
  linkText:{ fontSize: FontSize.xs, color: Colors.gray[500], fontFamily: 'monospace' },
  codeHint:{ fontSize: FontSize.xs, color: Colors.gray[400], marginBottom: Spacing.md },
  mono:    { fontFamily: 'monospace', fontWeight: FontWeight.medium },

  shareRow:       { flexDirection: 'row', gap: Spacing.sm },
  btnPrimary:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs, backgroundColor: Colors.brand[500], borderRadius: Radius.md, paddingVertical: Spacing.sm + 2 },
  btnPrimaryText: { color: Colors.white, fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  btnSecondary:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs, backgroundColor: Colors.brand[50], borderRadius: Radius.md, paddingVertical: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.brand[200] },
  btnSecondaryText:{ color: Colors.brand[600], fontSize: FontSize.sm, fontWeight: FontWeight.medium },

  statsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  statCard: { flex: 1, backgroundColor: Colors.white, borderRadius: Radius.xl, padding: Spacing.md, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
  statValue:{ fontSize: FontSize['2xl'], fontWeight: FontWeight.bold, color: Colors.brand[600] },
  statLabel:{ fontSize: FontSize.xs, color: Colors.gray[500], marginTop: 2 },

  section:       { gap: Spacing.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.xs },
  sectionTitle:  { fontSize: FontSize.base, fontWeight: FontWeight.semibold, color: Colors.gray[900] },
  activeBadge:   { backgroundColor: Colors.green.light, borderRadius: Radius.full, paddingHorizontal: Spacing.sm, paddingVertical: 2 },
  activeBadgeText:{ fontSize: FontSize.xs, color: Colors.green.text, fontWeight: FontWeight.medium },
  emptyText:     { textAlign: 'center', color: Colors.gray[400], fontSize: FontSize.sm, paddingVertical: Spacing.xl },

  couponCard:    { backgroundColor: Colors.white, borderRadius: Radius.xl, padding: Spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
  couponFaded:   { opacity: 0.55 },
  couponLeft:    { flex: 1 },
  couponTopRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 2 },
  couponCode:    { fontFamily: 'monospace', fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.gray[900] },
  couponMeta:    { fontSize: FontSize.xs, color: Colors.gray[500] },
  couponExpiry:  { fontSize: FontSize.xs, color: Colors.gray[400], marginTop: 2 },

  statusBadge:   { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  statusActive:  { backgroundColor: Colors.green.light },
  statusUsed:    { backgroundColor: Colors.gray[100] },
  statusExpired: { backgroundColor: Colors.red.light },
  statusText:    { fontSize: FontSize.xs, fontWeight: FontWeight.medium },

  copyBtn:     { backgroundColor: Colors.brand[50], borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderWidth: 1, borderColor: Colors.brand[200] },
  copyBtnText: { fontSize: FontSize.xs, color: Colors.brand[600], fontWeight: FontWeight.medium },
})

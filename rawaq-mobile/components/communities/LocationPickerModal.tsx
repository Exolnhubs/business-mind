import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import MapView, { MapPressEvent, Marker, Region, UrlTile } from 'react-native-maps'
import * as Location from 'expo-location'
import Constants from 'expo-constants'
import { Ionicons } from '@expo/vector-icons'
import { Colors, FontSize, FontWeight, Radius, Shadow, Spacing } from '@/theme'

export type PickedLocation = {
  lat: number
  lng: number
  label: string
  address: string
  city: string
  country: string
  countryCode: string
}

type SearchResult = {
  display_name: string
  lat: string
  lon: string
}

const DEFAULT_REGION: Region = {
  latitude: 29.9792,
  longitude: 31.1342,
  latitudeDelta: 0.18,
  longitudeDelta: 0.18,
}

export function LocationPickerModal({
  visible,
  initialLocation,
  onClose,
  onConfirm,
}: {
  visible: boolean
  initialLocation: PickedLocation | null
  onClose: () => void
  onConfirm: (location: PickedLocation | null) => void
}) {
  const googleMapsApiKey =
    Constants.expoConfig?.android?.config?.googleMaps?.apiKey ??
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ??
    null
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searchMessage, setSearchMessage] = useState<string | null>(null)
  const [resolving, setResolving] = useState(false)
  const [selected, setSelected] = useState<PickedLocation | null>(initialLocation)
  const [region, setRegion] = useState<Region>(
    initialLocation
      ? {
          latitude: initialLocation.lat,
          longitude: initialLocation.lng,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }
      : DEFAULT_REGION,
  )

  useEffect(() => {
    if (!visible) return

    setSelected(initialLocation)
    setQuery(initialLocation?.label ?? '')
    setResults([])
    setSearchMessage(null)
    setRegion(
      initialLocation
        ? {
            latitude: initialLocation.lat,
            longitude: initialLocation.lng,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
          }
        : DEFAULT_REGION,
    )
  }, [initialLocation, visible])

  async function reverseLabel(lat: number, lng: number) {
    try {
      const parts = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng })
      const first = parts[0]
      if (!first) {
        const fallback = `${lat.toFixed(5)}, ${lng.toFixed(5)}`
        return {
          lat,
          lng,
          label: fallback,
          address: fallback,
          city: 'Selected area',
          country: '',
          countryCode: '',
        }
      }

      const city = (first.city || first.subregion || first.region || first.district || first.country || 'Selected area').slice(0, 100)
      const addressLine = [
        first.name,
        first.street,
        first.streetNumber,
        first.district,
        first.city,
        first.region,
      ].filter(Boolean).join(', ')
      const label = addressLine || `${lat.toFixed(5)}, ${lng.toFixed(5)}`

      return {
        lat,
        lng,
        label,
        address: addressLine || label,
        city,
        country: first.country || '',
        countryCode: first.isoCountryCode || '',
      }
    } catch {
      const fallback = `${lat.toFixed(5)}, ${lng.toFixed(5)}`
      return {
        lat,
        lng,
        label: fallback,
        address: fallback,
        city: 'Selected area',
        country: '',
        countryCode: '',
      }
    }
  }

  async function searchWithGoogle(queryText: string, apiKey: string): Promise<SearchResult[]> {
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(queryText)}&key=${apiKey}`,
      )
      if (!response.ok) return []

      const payload = await response.json() as {
        status?: string
        results?: Array<{
          formatted_address?: string
          geometry?: { location?: { lat?: number; lng?: number } }
        }>
      }

      if (payload.status !== 'OK' || !payload.results?.length) return []

      return payload.results.slice(0, 5).flatMap((item) => {
        const lat = item.geometry?.location?.lat
        const lng = item.geometry?.location?.lng
        if (typeof lat !== 'number' || typeof lng !== 'number') return []
        return [{
          display_name: item.formatted_address || `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
          lat: String(lat),
          lon: String(lng),
        }]
      })
    } catch {
      return []
    }
  }

  async function searchWithOpenStreetMap(queryText: string): Promise<SearchResult[]> {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(queryText)}`,
        {
          headers: {
            Accept: 'application/json',
            'Accept-Language': 'en',
          },
        },
      )
      if (!response.ok) return []
      const payload = await response.json() as SearchResult[]
      return Array.isArray(payload) ? payload.slice(0, 5) : []
    } catch {
      return []
    }
  }

  async function handleMapPick(lat: number, lng: number) {
    setResolving(true)
    try {
      const location = await reverseLabel(lat, lng)
      setSelected(location)
      setQuery(location.label)
      setResults([])
      setSearchMessage(null)
      setRegion({
        latitude: lat,
        longitude: lng,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      })
    } finally {
      setResolving(false)
    }
  }

  async function searchLocation() {
    if (!query.trim()) return
    setSearching(true)
    setSearchMessage(null)
    try {
      const trimmedQuery = query.trim()
      const googleResults = googleMapsApiKey ? await searchWithGoogle(trimmedQuery, googleMapsApiKey) : []
      if (googleResults.length > 0) {
        setResults(googleResults)
        return
      }

      const geocoded = await Location.geocodeAsync(trimmedQuery)
      const limited = geocoded.slice(0, 5)
      if (limited.length > 0) {
        const resolved = await Promise.all(
          limited.map(async (item) => {
            const label = await reverseLabel(item.latitude, item.longitude)
            return {
              display_name: label.label,
              lat: String(item.latitude),
              lon: String(item.longitude),
            } satisfies SearchResult
          }),
        )

        setResults(resolved)
        return
      }

      const osmResults = await searchWithOpenStreetMap(trimmedQuery)
      if (osmResults.length > 0) {
        setResults(osmResults)
        return
      }

      setResults([])
      setSearchMessage('No places matched that search yet. Try a landmark, district, or street name.')
    } catch {
      setResults([])
      setSearchMessage('Search is temporarily unavailable. Try dropping a pin or using your current location.')
    } finally {
      setSearching(false)
    }
  }

  async function useMyLocation() {
    setResolving(true)
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') return
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      await handleMapPick(pos.coords.latitude, pos.coords.longitude)
    } finally {
      setResolving(false)
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Pick meetup location</Text>
              <Text style={styles.subtitle}>Search for a gate, landmark, or drop a pin on the map.</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={18} color={Colors.gray[600]} />
            </TouchableOpacity>
          </View>

          <View style={styles.searchRow}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search meetup spot"
              placeholderTextColor={Colors.gray[400]}
              style={styles.searchInput}
            />
            <TouchableOpacity onPress={searchLocation} disabled={searching || !query.trim()} style={styles.searchBtn}>
              {searching ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.searchBtnText}>Search</Text>}
            </TouchableOpacity>
          </View>

          {(results.length > 0 || searchMessage) && (
            <View style={styles.resultsCard}>
              {results.length > 0 ? (
                <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                  {results.map((result) => (
                    <TouchableOpacity
                      key={`${result.lat}-${result.lon}-${result.display_name}`}
                      onPress={() => {
                        const lat = Number(result.lat)
                        const lng = Number(result.lon)
                        setResults([])
                        setSearchMessage(null)
                        setRegion({
                          latitude: lat,
                          longitude: lng,
                          latitudeDelta: 0.02,
                          longitudeDelta: 0.02,
                        })
                        handleMapPick(lat, lng)
                      }}
                      style={styles.resultItem}
                    >
                      <Text style={styles.resultTitle}>{result.display_name}</Text>
                      <Text style={styles.resultMeta}>
                        {Number(result.lat).toFixed(5)}, {Number(result.lon).toFixed(5)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              ) : (
                <View style={styles.searchMessageWrap}>
                  <Text style={styles.searchMessageText}>{searchMessage}</Text>
                </View>
              )}
            </View>
          )}

          <MapView
            style={styles.map}
            region={region}
            onRegionChangeComplete={setRegion}
            loadingEnabled
            showsCompass
            showsUserLocation
            moveOnMarkerPress={false}
            mapType={Platform.OS === 'android' ? 'none' : 'standard'}
            zoomControlEnabled={Platform.OS === 'android'}
            toolbarEnabled={Platform.OS === 'android'}
            showsMyLocationButton={Platform.OS === 'android'}
            onPress={(event: MapPressEvent) => {
              const { latitude, longitude } = event.nativeEvent.coordinate
              handleMapPick(latitude, longitude)
            }}
          >
            {Platform.OS === 'android' && (
              <UrlTile
                urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                maximumZ={19}
                shouldReplaceMapContent
              />
            )}
            {selected && (
              <Marker
                coordinate={{ latitude: selected.lat, longitude: selected.lng }}
                draggable
                onDragEnd={(event) => {
                  const { latitude, longitude } = event.nativeEvent.coordinate
                  handleMapPick(latitude, longitude)
                }}
              />
            )}
          </MapView>
          {Platform.OS === 'android' && (
            <Text style={styles.mapAttribution}>Map data © OpenStreetMap contributors</Text>
          )}

          <View style={styles.infoCard}>
            <View style={styles.infoHeader}>
              <Text style={styles.infoLabel}>Selected spot</Text>
              <TouchableOpacity onPress={useMyLocation} style={styles.useMyLocationBtn}>
                <Ionicons name="locate-outline" size={13} color={Colors.brand[700]} />
                <Text style={styles.useMyLocationText}>Use my location</Text>
              </TouchableOpacity>
            </View>
            {selected ? (
              <>
                <Text style={styles.infoTitle}>{selected.label}</Text>
                <Text style={styles.infoMeta}>{selected.lat.toFixed(5)}, {selected.lng.toFixed(5)}</Text>
              </>
            ) : (
              <Text style={styles.infoMeta}>No meetup spot selected yet.</Text>
            )}
            {resolving && <Text style={styles.resolvingText}>Updating selected address…</Text>}
          </View>

          <View style={styles.footer}>
            <TouchableOpacity
              onPress={() => {
                setSelected(null)
                setQuery('')
                setResults([])
                setSearchMessage(null)
              }}
              style={styles.clearBtn}
            >
              <Text style={styles.clearBtnText}>Clear</Text>
            </TouchableOpacity>
            <View style={styles.footerActions}>
              <TouchableOpacity onPress={onClose} style={styles.cancelBtn}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => onConfirm(selected)} style={styles.confirmBtn}>
                <Text style={styles.confirmBtnText}>Confirm location</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  sheet: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    ...Shadow.card,
  },
  handle: {
    alignSelf: 'center',
    width: 46,
    height: 5,
    borderRadius: Radius.full,
    backgroundColor: Colors.gray[200],
    marginBottom: Spacing.md,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, marginBottom: Spacing.md },
  title: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.gray[900] },
  subtitle: { marginTop: 4, fontSize: FontSize.xs, color: Colors.gray[500], lineHeight: 18 },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: Radius.full,
    backgroundColor: Colors.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 1,
    fontSize: FontSize.sm,
    color: Colors.gray[900],
    backgroundColor: Colors.white,
  },
  searchBtn: {
    minWidth: 88,
    borderRadius: Radius.lg,
    backgroundColor: Colors.brand[600],
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
  },
  searchBtnText: { color: '#fff', fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  resultsCard: {
    maxHeight: 160,
    borderWidth: 1,
    borderColor: Colors.gray[100],
    borderRadius: Radius.lg,
    backgroundColor: Colors.gray[50],
    marginBottom: Spacing.md,
  },
  searchMessageWrap: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  searchMessageText: {
    fontSize: FontSize.xs,
    color: Colors.gray[500],
    lineHeight: 18,
  },
  resultItem: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 1,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  resultTitle: { fontSize: FontSize.sm, color: Colors.gray[800], fontWeight: FontWeight.medium },
  resultMeta: { marginTop: 2, fontSize: FontSize.xs, color: Colors.gray[400] },
  map: {
    width: '100%',
    height: 280,
    borderRadius: Radius.xl,
    overflow: 'hidden',
  },
  mapAttribution: {
    marginTop: 6,
    fontSize: 10,
    color: Colors.gray[400],
    textAlign: 'right',
  },
  infoCard: {
    marginTop: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.brand[100],
    borderRadius: Radius.lg,
    backgroundColor: Colors.brand[50],
    padding: Spacing.md,
  },
  infoHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  infoLabel: {
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: Colors.brand[700],
    fontWeight: FontWeight.bold,
  },
  infoTitle: { fontSize: FontSize.sm, color: Colors.gray[900], fontWeight: FontWeight.semibold },
  infoMeta: { fontSize: FontSize.xs, color: Colors.gray[500], lineHeight: 18 },
  resolvingText: { marginTop: 6, fontSize: FontSize.xs, color: Colors.brand[700] },
  useMyLocationBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  useMyLocationText: { fontSize: FontSize.xs, color: Colors.brand[700], fontWeight: FontWeight.medium },
  footer: { marginTop: Spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
  clearBtn: { paddingVertical: Spacing.sm, paddingHorizontal: Spacing.sm },
  clearBtnText: { fontSize: FontSize.xs, color: Colors.gray[500], fontWeight: FontWeight.medium },
  footerActions: { flexDirection: 'row', gap: Spacing.sm },
  cancelBtn: {
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm + 1,
    backgroundColor: Colors.white,
  },
  cancelBtnText: { color: Colors.gray[700], fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  confirmBtn: {
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm + 1,
    backgroundColor: Colors.brand[600],
  },
  confirmBtnText: { color: '#fff', fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
})

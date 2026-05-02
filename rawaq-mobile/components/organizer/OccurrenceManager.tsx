import { useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
} from 'react-native'
import { apiGet, apiPatch } from '@/lib/api'
import { Colors, FontSize, FontWeight, Radius, Spacing } from '@/theme'
import { ConfirmDateTimePicker } from '@/components/ui/ConfirmDateTimePicker'
import type { EventOccurrence } from '@/types/database'

type OrganizerOccurrence = EventOccurrence
type PickerTarget = 'start' | 'end' | null

interface OccurrenceManagerProps {
  eventId: string
  enabled: boolean
}

function parseDate(value: string) {
  return new Date(value.includes('T') ? value : value.replace(' ', 'T'))
}

function toPickerValue(value: string | null) {
  if (!value) return ''
  return new Date(value).toISOString().slice(0, 16).replace('T', ' ')
}

function formatOccurrence(value: string) {
  return new Date(value).toLocaleString('en-SA-u-ca-gregory', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export function OccurrenceManager({ eventId, enabled }: OccurrenceManagerProps) {
  const [occurrences, setOccurrences] = useState<OrganizerOccurrence[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savingOccurrenceId, setSavingOccurrenceId] = useState<string | null>(null)
  const [editingOccurrenceId, setEditingOccurrenceId] = useState<string | null>(null)
  const [draftStartAt, setDraftStartAt] = useState('')
  const [draftEndAt, setDraftEndAt] = useState('')
  const [draftCapacity, setDraftCapacity] = useState('')
  const [pickerTarget, setPickerTarget] = useState<PickerTarget>(null)
  const [pickerTempDate, setPickerTempDate] = useState(new Date())

  useEffect(() => {
    if (!enabled) {
      setOccurrences([])
      return
    }

    async function load() {
      setLoading(true)
      setError(null)
      const { data, error: apiError } = await apiGet<OrganizerOccurrence[]>(`/api/events/${eventId}/occurrences`, {
        force: true,
      })
      setLoading(false)
      if (apiError) {
        setError(apiError)
        return
      }
      setOccurrences(data ?? [])
    }

    void load()
  }, [enabled, eventId])

  function beginEditing(occurrence: OrganizerOccurrence) {
    setEditingOccurrenceId(occurrence.id)
    setDraftStartAt(toPickerValue(occurrence.starts_at))
    setDraftEndAt(toPickerValue(occurrence.ends_at))
    setDraftCapacity(occurrence.capacity?.toString() ?? '')
  }

  function stopEditing() {
    setEditingOccurrenceId(null)
    setDraftStartAt('')
    setDraftEndAt('')
    setDraftCapacity('')
    setPickerTarget(null)
  }

  function openPicker(target: PickerTarget) {
    if (!target) return
    const current = target === 'start' ? draftStartAt : draftEndAt
    const fallback = target === 'end' && draftStartAt ? parseDate(draftStartAt) : new Date()
    setPickerTempDate(current ? parseDate(current) : fallback)
    setPickerTarget(target)
  }

  function getPickerMinimumDate() {
    return pickerTarget === 'end' && draftStartAt ? parseDate(draftStartAt) : new Date()
  }

  function commitPickerValue(selected: Date) {
    const iso = selected.toISOString().slice(0, 16).replace('T', ' ')
    if (pickerTarget === 'start') {
      setDraftStartAt(iso)
      if (draftEndAt && parseDate(draftEndAt).getTime() < selected.getTime()) {
        setDraftEndAt(iso)
      }
    } else {
      const next = draftStartAt && selected.getTime() < parseDate(draftStartAt).getTime()
        ? parseDate(draftStartAt).toISOString().slice(0, 16).replace('T', ' ')
        : iso
      setDraftEndAt(next)
    }
    setPickerTarget(null)
  }

  async function updateStatus(occurrence: OrganizerOccurrence, status: 'scheduled' | 'cancelled') {
    setSavingOccurrenceId(occurrence.id)
    setError(null)
    const { data, error: apiError } = await apiPatch<OrganizerOccurrence>(
      `/api/events/${eventId}/occurrences/${occurrence.id}`,
      { status },
    )
    setSavingOccurrenceId(null)
    if (apiError) {
      setError(apiError)
      return
    }
    if (data) {
      setOccurrences((current) => current.map((item) => (item.id === occurrence.id ? data : item)))
    }
  }

  async function saveOccurrence(occurrenceId: string) {
    setSavingOccurrenceId(occurrenceId)
    setError(null)
    const { data, error: apiError } = await apiPatch<OrganizerOccurrence>(
      `/api/events/${eventId}/occurrences/${occurrenceId}`,
      {
        starts_at: parseDate(draftStartAt).toISOString(),
        ends_at: draftEndAt ? parseDate(draftEndAt).toISOString() : null,
        capacity: draftCapacity ? Number(draftCapacity) : null,
      },
    )
    setSavingOccurrenceId(null)
    if (apiError) {
      setError(apiError)
      return
    }
    if (data) {
      setOccurrences((current) => current.map((item) => (item.id === occurrenceId ? data : item)))
      stopEditing()
    }
  }

  if (!enabled) return null

  const upcomingOccurrences = occurrences.filter((occurrence) => new Date(occurrence.starts_at).getTime() > Date.now())

  return (
    <View style={styles.section}>
      <Text style={styles.title}>Manage Sessions</Text>
      <Text style={styles.subtitle}>
        Session edits only affect that date. Custom edits and cancelled sessions are kept as exceptions.
      </Text>

      {loading ? <ActivityIndicator color={Colors.brand[500]} style={{ marginTop: Spacing.md }} /> : null}
      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {!loading && upcomingOccurrences.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No generated upcoming sessions yet.</Text>
        </View>
      ) : null}

      {upcomingOccurrences.slice(0, 10).map((occurrence) => {
        const isEditing = editingOccurrenceId === occurrence.id
        const isSaving = savingOccurrenceId === occurrence.id

        return (
          <View key={occurrence.id} style={styles.card}>
            <Text style={styles.cardTitle}>{formatOccurrence(occurrence.starts_at)}</Text>
            <Text style={styles.cardMeta}>
              {occurrence.ends_at ? `Ends ${formatOccurrence(occurrence.ends_at)}` : 'No explicit end time'}
            </Text>
            <View style={styles.badgeRow}>
              <Text style={[styles.badge, occurrence.status === 'cancelled' ? styles.badgeRed : styles.badgeGreen]}>
                {occurrence.status === 'cancelled' ? 'Cancelled' : 'Scheduled'}
              </Text>
              {occurrence.is_exception ? <Text style={[styles.badge, styles.badgeAmber]}>Custom</Text> : null}
              <Text style={styles.badge}>{occurrence.bookings_count} booked</Text>
              {occurrence.capacity !== null ? <Text style={styles.badge}>Cap {occurrence.capacity}</Text> : null}
            </View>

            <View style={styles.actions}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => (isEditing ? stopEditing() : beginEditing(occurrence))}>
                <Text style={styles.secondaryBtnText}>{isEditing ? 'Close' : 'Edit'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={occurrence.status === 'cancelled' ? styles.restoreBtn : styles.cancelBtn}
                disabled={isSaving}
                onPress={() => void updateStatus(occurrence, occurrence.status === 'cancelled' ? 'scheduled' : 'cancelled')}
              >
                <Text style={styles.primaryBtnText}>{occurrence.status === 'cancelled' ? 'Restore' : 'Cancel'}</Text>
              </TouchableOpacity>
            </View>

            {isEditing ? (
              <View style={styles.editor}>
                <TouchableOpacity style={styles.pickerField} onPress={() => openPicker('start')}>
                  <Text style={styles.pickerLabel}>Start</Text>
                  <Text style={styles.pickerValue}>{draftStartAt ? formatOccurrence(parseDate(draftStartAt).toISOString()) : 'Pick start'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.pickerField} onPress={() => openPicker('end')}>
                  <Text style={styles.pickerLabel}>End</Text>
                  <Text style={styles.pickerValue}>{draftEndAt ? formatOccurrence(parseDate(draftEndAt).toISOString()) : 'Pick end'}</Text>
                </TouchableOpacity>
                <View style={styles.capacityField}>
                  <Text style={styles.pickerLabel}>Capacity</Text>
                  <TextInput
                    value={draftCapacity}
                    onChangeText={setDraftCapacity}
                    placeholder="Unlimited"
                    placeholderTextColor={Colors.gray[400]}
                    keyboardType="number-pad"
                    style={styles.capacityInput}
                  />
                </View>
                <View style={styles.actions}>
                  <TouchableOpacity style={styles.secondaryBtn} onPress={stopEditing}>
                    <Text style={styles.secondaryBtnText}>Discard</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.saveBtn}
                    disabled={isSaving || !draftStartAt}
                    onPress={() => void saveOccurrence(occurrence.id)}
                  >
                    <Text style={styles.primaryBtnText}>{isSaving ? 'Saving...' : 'Save Session'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
          </View>
        )
      })}

      {pickerTarget !== null ? (
        <ConfirmDateTimePicker
          visible={pickerTarget !== null}
          value={pickerTempDate}
          minimumDate={getPickerMinimumDate()}
          title={pickerTarget === 'start' ? 'Select session start date and time' : 'Select session end date and time'}
          onCancel={() => setPickerTarget(null)}
          onConfirm={commitPickerValue}
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  section: {
    marginTop: Spacing.xl,
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.gray[200],
  },
  title: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.gray[900],
  },
  subtitle: {
    marginTop: Spacing.xs,
    fontSize: FontSize.sm,
    color: Colors.gray[500],
    lineHeight: 20,
  },
  errorBox: {
    marginTop: Spacing.md,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
  errorText: {
    color: '#b91c1c',
    fontSize: FontSize.sm,
  },
  emptyCard: {
    marginTop: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.gray[50],
    padding: Spacing.lg,
  },
  emptyText: {
    fontSize: FontSize.sm,
    color: Colors.gray[500],
  },
  card: {
    marginTop: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.gray[50],
    padding: Spacing.md,
  },
  cardTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.gray[900],
  },
  cardMeta: {
    marginTop: 4,
    fontSize: FontSize.xs,
    color: Colors.gray[500],
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  badge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
    backgroundColor: Colors.white,
    fontSize: FontSize.xs,
    color: Colors.gray[600],
    overflow: 'hidden',
  },
  badgeGreen: {
    backgroundColor: '#dcfce7',
    color: '#166534',
  },
  badgeRed: {
    backgroundColor: '#fee2e2',
    color: '#b91c1c',
  },
  badgeAmber: {
    backgroundColor: '#fef3c7',
    color: '#b45309',
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  secondaryBtn: {
    flex: 1,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    backgroundColor: Colors.white,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  secondaryBtnText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    color: Colors.gray[700],
  },
  cancelBtn: {
    flex: 1,
    borderRadius: Radius.md,
    backgroundColor: Colors.red.DEFAULT,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  restoreBtn: {
    flex: 1,
    borderRadius: Radius.md,
    backgroundColor: Colors.green.DEFAULT,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  saveBtn: {
    flex: 1,
    borderRadius: Radius.md,
    backgroundColor: Colors.brand[500],
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  primaryBtnText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.white,
  },
  editor: {
    marginTop: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.white,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.gray[200],
  },
  pickerField: {
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  pickerLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.gray[500],
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  pickerValue: {
    fontSize: FontSize.sm,
    color: Colors.gray[900],
  },
  capacityField: {
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
  capacityValue: {
    fontSize: FontSize.sm,
    color: Colors.gray[900],
  },
  capacityInput: {
    fontSize: FontSize.sm,
    color: Colors.gray[900],
    paddingVertical: 0,
  },
})

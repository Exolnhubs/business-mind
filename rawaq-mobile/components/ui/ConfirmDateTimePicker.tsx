import { useEffect, useRef, useState } from 'react'
import {
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import DateTimePicker, {
  DateTimePickerAndroid,
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker'
import { useLocale } from '@/contexts/locale-context'
import { Colors, FontSize, FontWeight, Radius, Shadow, Spacing } from '@/theme'

type PickerStep = 'date' | 'time'

interface ConfirmDateTimePickerProps {
  visible: boolean
  value: Date
  minimumDate?: Date
  title?: string
  onCancel: () => void
  onConfirm: (value: Date) => void
}

function cloneDate(value: Date) {
  const next = new Date(value)
  return isNaN(next.getTime()) ? new Date() : next
}

function clampToMinimum(value: Date, minimumDate?: Date) {
  if (!minimumDate || value.getTime() >= minimumDate.getTime()) return value
  return cloneDate(minimumDate)
}

function mergeDatePart(source: Date, target: Date) {
  const next = cloneDate(target)
  next.setFullYear(source.getFullYear(), source.getMonth(), source.getDate())
  return next
}

function mergeTimePart(source: Date, target: Date) {
  const next = cloneDate(target)
  next.setHours(source.getHours(), source.getMinutes(), 0, 0)
  return next
}

export function ConfirmDateTimePicker({
  visible,
  value,
  minimumDate,
  title = 'Select date and time',
  onCancel,
  onConfirm,
}: ConfirmDateTimePickerProps) {
  const { t, isRTL } = useLocale()
  const [step, setStep] = useState<PickerStep>('date')
  const [draftDate, setDraftDate] = useState(() => clampToMinimum(cloneDate(value), minimumDate))
  const cancelRef = useRef(onCancel)
  const confirmRef = useRef(onConfirm)

  useEffect(() => {
    cancelRef.current = onCancel
    confirmRef.current = onConfirm
  }, [onCancel, onConfirm])

  useEffect(() => {
    if (!visible) return
    setStep('date')
    setDraftDate(clampToMinimum(cloneDate(value), minimumDate))
  }, [minimumDate, value, visible])

  useEffect(() => {
    if (!visible || Platform.OS !== 'android') return

    let isActive = true
    const initialValue = clampToMinimum(cloneDate(value), minimumDate)

    function openTimePicker(dateValue: Date) {
      DateTimePickerAndroid.open({
        value: dateValue,
        mode: 'time',
        display: 'default',
        onChange: (event, selected) => {
          if (!isActive) return
          if (event.type === 'dismissed' || !selected) {
            cancelRef.current()
            return
          }

          const next = clampToMinimum(mergeTimePart(selected, dateValue), minimumDate)
          confirmRef.current(next)
        },
      })
    }

    DateTimePickerAndroid.open({
      value: initialValue,
      mode: 'date',
      display: 'default',
      minimumDate,
      onChange: (event, selected) => {
        if (!isActive) return
        if (event.type === 'dismissed' || !selected) {
          cancelRef.current()
          return
        }

        openTimePicker(clampToMinimum(mergeDatePart(selected, initialValue), minimumDate))
      },
    })

    return () => {
      isActive = false
      DateTimePickerAndroid.dismiss('date')
      DateTimePickerAndroid.dismiss('time')
    }
  }, [minimumDate, value, visible])

  function handlePickerChange(event: DateTimePickerEvent, selected?: Date) {
    if (event.type === 'dismissed' || !selected) return

    setDraftDate((current) => {
      const next = step === 'date'
        ? mergeDatePart(selected, current)
        : mergeTimePart(selected, current)
      return clampToMinimum(next, minimumDate)
    })
  }

  function handleConfirm() {
    onConfirm(clampToMinimum(draftDate, minimumDate))
  }

  if (Platform.OS === 'android') return null

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={[styles.header, isRTL && styles.headerRtl]}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.stepLabel}>{step === 'date' ? t('ticket.date') : t('ticket.time')}</Text>
          </View>

          <DateTimePicker
            key={step}
            value={draftDate}
            mode={step}
            display="spinner"
            minimumDate={step === 'date' ? minimumDate : undefined}
            onChange={handlePickerChange}
            themeVariant="light"
            textColor={Colors.gray[900]}
            style={styles.iosPicker}
          />

          <View style={styles.actions}>
            <TouchableOpacity style={styles.secondaryBtn} onPress={onCancel}>
              <Text style={styles.secondaryText}>{t('common.cancel')}</Text>
            </TouchableOpacity>

            {step === 'time' ? (
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => setStep('date')}>
                <Text style={styles.secondaryText}>{t('common.back')}</Text>
              </TouchableOpacity>
            ) : null}

            {step === 'date' ? (
              <TouchableOpacity style={styles.primaryBtn} onPress={() => setStep('time')}>
                <Text style={styles.primaryText}>{t('common.next')}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.primaryBtn} onPress={handleConfirm}>
                <Text style={styles.primaryText}>{t('common.done')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(17, 24, 39, 0.35)',
  },
  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing['2xl'],
    ...Shadow.modal,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  headerRtl: {
    flexDirection: 'row-reverse',
  },
  title: {
    flex: 1,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.gray[900],
  },
  stepLabel: {
    marginLeft: Spacing.md,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.brand[700],
    textTransform: 'uppercase',
  },
  iosPicker: {
    alignSelf: 'stretch',
    width: '100%',
    height: 216,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  secondaryBtn: {
    minWidth: 76,
    alignItems: 'center',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    backgroundColor: Colors.white,
  },
  secondaryText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.gray[600],
  },
  primaryBtn: {
    minWidth: 84,
    alignItems: 'center',
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    backgroundColor: Colors.brand[500],
  },
  primaryText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.white,
  },
})

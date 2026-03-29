'use client'

import type { PaymentOption } from '@/lib/gateways/types'

interface Props {
  options: PaymentOption[]
  selected: string | null
  onSelect: (id: string) => void
}

export function PaymentMethodSelector({ options, selected, onSelect }: Props) {
  if (options.length === 0) return null

  // Hide selector when there's only one option (just confirm directly)
  if (options.length === 1) return null

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Payment method</p>
      {options.map((opt) => {
        const isSelected = selected === opt.id
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onSelect(opt.id)}
            className={`w-full text-left rounded-xl border-2 px-4 py-3 transition-all ${
              isSelected
                ? 'border-brand-500 bg-brand-50'
                : 'border-gray-200 hover:border-brand-300 hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="text-xl leading-none shrink-0">{opt.icon}</span>
              <div className="min-w-0">
                <p className={`text-sm font-semibold ${isSelected ? 'text-brand-700' : 'text-gray-900'}`}>
                  {opt.label}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">{opt.description}</p>
              </div>
              {isSelected && (
                <span className="ml-auto text-brand-600 text-sm font-medium shrink-0">✓</span>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}

'use client'

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="px-5 py-2.5 text-sm font-semibold text-white bg-amber-500 rounded-xl hover:bg-amber-600 transition"
    >
      🖨️ Print / Save PDF
    </button>
  )
}

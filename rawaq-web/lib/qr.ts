import QRCode from 'qrcode'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://rawaq.app'

/** Returns a base64 PNG data URL for a ticket QR code. */
export async function generateTicketQR(ticketId: string): Promise<string> {
  const verifyUrl = `${APP_URL}/api/tickets/verify?t=${ticketId}`
  return QRCode.toDataURL(verifyUrl, {
    width: 300,
    margin: 2,
    color: { dark: '#111827', light: '#ffffff' },
    errorCorrectionLevel: 'M',
  })
}

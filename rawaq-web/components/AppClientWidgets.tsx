'use client'

import dynamic from 'next/dynamic'

const ChunkLoadRecovery = dynamic(
  () => import('@/components/ChunkLoadRecovery').then((m) => ({ default: m.ChunkLoadRecovery })),
  { ssr: false, loading: () => null },
)

const ServiceWorkerRegister = dynamic(
  () => import('@/components/ServiceWorkerRegister').then((m) => ({ default: m.ServiceWorkerRegister })),
  { ssr: false, loading: () => null },
)

const CustomCursor = dynamic(
  () => import('@/components/ui/CustomCursor').then((m) => ({ default: m.CustomCursor })),
  { ssr: false, loading: () => null },
)

const SupportChatWidget = dynamic(
  () => import('@/components/support/SupportChatWidget').then((m) => ({ default: m.SupportChatWidget })),
  { ssr: false, loading: () => null },
)

export function RootClientWidgets() {
  return (
    <>
      <ChunkLoadRecovery />
      <ServiceWorkerRegister />
      <CustomCursor />
      <SupportChatWidget />
    </>
  )
}

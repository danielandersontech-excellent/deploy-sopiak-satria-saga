import type { Metadata } from 'next'
import { SERVICES } from '@/lib/data'

type Props = {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  return SERVICES.map((service) => ({ slug: service.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const service = SERVICES.find((s) => s.slug === slug)

  if (!service) {
    return { title: 'Layanan Tidak Ditemukan - PT Sopiak Satria Saga' }
  }

  return {
    title: `${service.title} - PT Sopiak Satria Saga`,
    description: service.shortDesc,
    openGraph: {
      title: `${service.title} - PT Sopiak Satria Saga`,
      description: service.shortDesc,
      type: 'website',
    },
  }
}

export default function ServiceLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

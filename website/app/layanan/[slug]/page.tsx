import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { SERVICES, COMPANY } from '@/lib/data'
import ServiceDetailClient from './ServiceDetailClient'

type Props = { params: Promise<{ slug: string }> }

export async function generateStaticParams() {
  return SERVICES.map((s) => ({ slug: s.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const svc = SERVICES.find((s) => s.slug === slug)
  if (!svc) return { title: 'Layanan Tidak Ditemukan' }
  return {
    title: `${svc.title} - ${COMPANY.name}`,
    description: svc.shortDesc,
    openGraph: { title: `${svc.title} - ${COMPANY.name}`, description: svc.shortDesc, type: 'website' },
  }
}

export default async function ServicePage({ params }: Props) {
  const { slug } = await params
  const svc = SERVICES.find((s) => s.slug === slug)
  if (!svc) notFound()
  return <ServiceDetailClient slug={slug} />
}

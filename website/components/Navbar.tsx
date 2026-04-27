'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Menu, X } from 'lucide-react'
import { NAV_LINKS } from '@/lib/data'

function LogoImage({ size = 42 }: { size?: number }) {
  return (
    <div style={{ width: size, height: size, position: 'relative' }}>
      <Image
        src="/image/ptsss-logo.png"
        alt="PTSSS Logo"
        width={size}
        height={size}
        className="object-contain"
        priority
      />
    </div>
  )
}

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 50)
    window.addEventListener('scroll', h)
    return () => window.removeEventListener('scroll', h)
  }, [])

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [mobileOpen])

  return (
    <nav className={`navbar ${scrolled ? 'scrolled' : ''}`}>
      <div className="nav-inner">
        <Link href="/" className="nav-logo">
          <LogoImage size={40} />
          <div className="nav-logo-text">
            <span className="nav-logo-name">SOPIAK SATRIA SAGA</span>
            <span className="nav-logo-sub">Security Management</span>
          </div>
        </Link>

        <div className="nav-links">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href}>
              {link.label}
            </Link>
          ))}
          <Link href="/#kontak" className="nav-cta-btn">
            Hubungi Kami
          </Link>
        </div>

        <button className="nav-burger" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Menu">
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {mobileOpen && (
        <div className="nav-mobile-overlay">
          <div style={{ marginBottom: 24 }}>
            <LogoImage size={56} />
          </div>
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} onClick={() => setMobileOpen(false)}>
              {link.label}
            </Link>
          ))}
          <Link
            href="/#kontak"
            className="btn-primary"
            onClick={() => setMobileOpen(false)}
            style={{ marginTop: 16 }}
          >
            Hubungi Kami
          </Link>
        </div>
      )}
    </nav>
  )
}
import Navbar from '@/components/Navbar'
import Hero from '@/components/Hero'
import Services from '@/components/Services'
import Technology from '@/components/Technology'
import Showcase from '@/components/Showcase'
import WhyUs from '@/components/WhyUs'
import Commitment from '@/components/Commitment'
import CTA from '@/components/CTA'
import Contact from '@/components/Contact'
import Footer from '@/components/Footer'

export default function Home() {
  return (
    <>
      <Navbar />
      <Hero />
      <Services />
      <Technology />
      <Showcase />
      <WhyUs />
      <Commitment />
      <CTA />
      <Contact />
      <Footer />
    </>
  )
}

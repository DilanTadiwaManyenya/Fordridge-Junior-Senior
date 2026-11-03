import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import crest from '../assets/fordridge-crest.jpeg'
import { schoolInfo } from '../data/schoolInfo'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { submitEnquiry } from './enquiry-workflow'
import './public-site.css'

const navItems = [
  ['About', '/about'], ['Junior School', '/junior-school'], ['Senior School', '/senior-school'], ['Gallery', '/gallery'], ['Admissions', '/admissions'], ['Contact', '/contact'],
]

const galleryImages = Object.values(import.meta.glob('../assets/images/*.{jpeg,jpg,png,webp}', { eager: true, import: 'default' }))
const shuffleImages = (images) => [...images].sort(() => Math.random() - 0.5)

function PageTitle({ title, description }) {
  useEffect(() => {
    document.title = `${title} | ${schoolInfo.name}`
    let meta = document.querySelector('meta[name="description"]')
    if (!meta) { meta = document.createElement('meta'); meta.name = 'description'; document.head.appendChild(meta) }
    meta.content = description
  }, [title, description])
  return null
}

function Brand({ compact = false }) {
  return <Link to="/" className="public-brand" aria-label={`${schoolInfo.name} home`}>
    <img src={crest} alt="Fordridge Senior School crest" />
    {!compact && <span><strong>{schoolInfo.shortName}</strong><small>JUNIOR &amp; SENIOR SCHOOL</small></span>}
  </Link>
}

export function SiteLayout({ children }) {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  useEffect(() => setOpen(false), [location.pathname])
  return <div className="public-site">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <header className="public-header"><Brand />
      <button className="menu-toggle" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="main-navigation">{open ? 'Close' : 'Menu'}<span aria-hidden="true">☰</span></button>
      <nav id="main-navigation" className={open ? 'public-nav is-open' : 'public-nav'} aria-label="Main navigation">
        {navItems.map(([label, to]) => <NavLink key={to} to={to}>{label}</NavLink>)}
        <a className="portal-button" href="/portal/login">Portal Login</a>
      </nav>
    </header>
    <main id="main-content">{children}</main>
    <footer className="public-footer"><div className="footer-brand"><Brand /><p>{schoolInfo.motto}</p></div><div><h2>Visit us</h2><p>{schoolInfo.address}</p></div><div><h2>Get in touch</h2><p>{schoolInfo.phone}<br />{schoolInfo.email}</p><a className="footer-portal" href="/portal/login">Portal Login</a></div></footer>
  </div>
}

function PageHero({ eyebrow, title, text }) { return <section className="page-hero"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{text}</p></div><img src={crest} alt="" /></section> }
function Section({ title, children, muted = false }) { return <section className={muted ? 'content-section muted-section' : 'content-section'}><div className="section-heading"><h2>{title}</h2></div>{children}</section> }
function Cards({ items }) { return <div className="info-grid">{items.map((item) => <article key={item.title} className="info-card"><h3>{item.title}</h3><p>{item.text}</p></article>)}</div> }

export function HomePage() { return <><PageTitle title="Home" description="Fordridge Junior and Senior School in Harare, Zimbabwe." /><section className="home-hero"><div><p className="eyebrow">Kirkman Road · Harare, Zimbabwe</p><h1>Learn.<br /><em>Excel.</em><br />Achieve.</h1><p>Fordridge is a welcoming school community supporting learners across our Junior and Senior arms.</p><Link className="primary-button" to="/admissions">Apply / Enquire <span>→</span></Link></div><img src={crest} alt="Fordridge Senior School crest" /></section>
  <Section title="A school journey with purpose"><p className="intro-copy">At Fordridge, learners are encouraged to develop knowledge, character and confidence in a supportive environment.</p><div className="school-card-grid"><Link to="/junior-school" className="school-card junior"><span>01</span><h3>Junior School</h3><p>A strong start for growing minds.</p><b>Explore Junior School →</b></Link><Link to="/senior-school" className="school-card senior"><span>02</span><h3>Senior School</h3><p>Preparation for the next chapter.</p><b>Explore Senior School →</b></Link></div></Section>
  <Section title="Why Fordridge" muted><Cards items={schoolInfo.highlights} /></Section>
  <section className="notice-strip"><p><strong>School information</strong> <span>Contact the school for current admissions guidance, term dates and community updates.</span></p><Link to="/contact">Contact the school →</Link></section>
  <section className="contact-strip"><div><p className="eyebrow">Visit Fordridge</p><h2>Let’s start a conversation.</h2><p>{schoolInfo.address}</p></div><Link className="light-button" to="/contact">Contact us</Link></section></> }

export function AboutPage() { return <><PageTitle title="About" description="Learn about Fordridge Junior and Senior School." /><PageHero eyebrow="About Fordridge" title="A community for learning and growth." text="Fordridge brings together a Junior and Senior School in a shared commitment to helping learners flourish." /><Section title="Our story"><p className="intro-copy">Fordridge supports learners through the Junior and Senior stages of their school journey. The school works with families to encourage curiosity, steady progress and confidence.</p></Section><Section title="Mission and vision" muted><Cards items={[{ title: 'Our mission', text: 'To provide a supportive learning environment where every learner can build knowledge, character and confidence.' }, { title: 'Our vision', text: 'To prepare learners to pursue their goals with integrity, curiosity and a commitment to continued growth.' }]} /></Section><Section title="Our values"><Cards items={[{ title: 'Learn', text: 'We approach learning with curiosity, commitment and care.' }, { title: 'Excel', text: 'We strive for quality and growth in every endeavour.' }, { title: 'Achieve', text: 'We support learners to pursue meaningful goals with confidence.' }]} /></Section><Section title="Leadership" muted><div className="leadership-grid">{schoolInfo.leadership.map((person) => <article key={person.role}><img src={crest} alt="" /><h3>{person.name}</h3><p className="role">{person.role}</p><p>{person.bio}</p></article>)}</div></Section></> }

const activities = [{ title: 'Sport and wellbeing', text: 'Contact the school to learn about current sporting and wellbeing opportunities.' }, { title: 'Culture and creativity', text: 'Ask the school team about clubs, creative activities and events offered during the year.' }, { title: 'Leadership and service', text: 'The school can share current opportunities for learner leadership and community involvement.' }]
export function JuniorPage() { return <><PageTitle title="Junior School" description="Discover Fordridge Junior School." /><PageHero eyebrow="Junior School" title="A confident beginning." text="The Junior School supports learners as they build knowledge, confidence and positive learning habits." /><Section title="Junior School overview"><p className="intro-copy">The Junior School provides a foundation for continued learning and personal growth. Contact the school for current year-group information and placement guidance.</p></Section><Section title="Curriculum" muted><Cards items={[{ title: 'Core learning', text: 'Learners develop communication, literacy, numeracy and problem-solving skills.' }, { title: 'Learning support', text: 'Families can speak with the school about support for each learner’s needs and progress.' }, { title: 'Growing independence', text: 'Learning encourages confidence, responsibility and care for others.' }]} /></Section><Section title="Activities"><Cards items={activities} /></Section></> }
export function SeniorPage() { return <><PageTitle title="Senior School" description="Discover Fordridge Senior School programmes." /><PageHero eyebrow="Senior School" title="Ready for what’s next." text="The Senior School supports learners to deepen their knowledge, discover their strengths and prepare for future opportunities." /><Section title="Senior School overview"><p className="intro-copy">Learners continue their academic and personal development through the Senior School. The school team can advise families about current year groups, subject choices and progression.</p></Section><Section title="Academic pathways" muted><Cards items={[{ title: 'Plan the next step', text: 'Speak with the school about the examination pathways and subject choices currently available.' }, { title: 'Individual guidance', text: 'The school can help families understand progression options and requirements for each learner.' }]} /></Section><Section title="Beyond the classroom" muted><Cards items={activities} /></Section></> }

export function GalleryPage() {
  const [images, setImages] = useState(() => shuffleImages(galleryImages))
  return <><PageTitle title="Gallery" description="A glimpse of life at Fordridge Junior and Senior School." /><PageHero eyebrow="Gallery" title="Life at Fordridge." text="A selection of moments from our school community." /><Section title="School gallery"><div className="gallery-toolbar"><p className="intro-copy">Images are shown in a new random order each time you visit.</p><button className="gallery-shuffle" onClick={() => setImages(shuffleImages(galleryImages))}>Shuffle images</button></div><div className="gallery-grid">{images.map((image, index) => <figure key={image}><img src={image} alt={`Fordridge school life, photo ${index + 1}`} loading="lazy" /><figcaption>Fordridge school life</figcaption></figure>)}</div></Section></>
}

function EnquiryForm({ kind = 'enquiry' }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '' }); const [status, setStatus] = useState(''); const [sending, setSending] = useState(false)
  async function submit(e) { e.preventDefault(); setStatus(''); if (!form.name.trim() || !form.email.trim() || !form.message.trim()) return setStatus('Please complete your name, email address and message.'); if (!/^\S+@\S+\.\S+$/.test(form.email)) return setStatus('Please enter a valid email address.'); setSending(true)
    const result = await submitEnquiry(supabase, isSupabaseConfigured, { name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim() || null, message: form.message.trim(), enquiry_type: kind })
    if (!result.ok) { setStatus(result.reason === 'unavailable' ? 'The enquiry service is unavailable. Please contact the school by phone or email.' : 'We could not send your message right now. Please try again later.'); setSending(false); return }
    setStatus('Thank you — your message has been received. We will be in touch soon.'); setForm({ name: '', email: '', phone: '', message: '' }); setSending(false)
  }
  return <form className="public-form" onSubmit={submit} noValidate><label>Name <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label><label>Email <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label><label>Phone <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label><label>Message <textarea rows="5" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} required /></label><button className="primary-button" disabled={sending}>{sending ? 'Sending…' : 'Send enquiry'}</button>{status && <p className={status.startsWith('Thank') ? 'form-success' : 'form-error'} role="status">{status}</p>}{!isSupabaseConfigured && <p className="form-note">The enquiry service is unavailable. Please contact the school using the details on this page.</p>}</form>
}
export function AdmissionsPage() { return <><PageTitle title="Admissions" description="Start an admissions enquiry with Fordridge." /><PageHero eyebrow="Admissions" title="Your Fordridge journey starts here." text="Families are welcome to contact Fordridge to discuss admission to the Junior or Senior School." /><Section title="How to apply"><div className="steps"><article><b>01</b><h3>Make an enquiry</h3><p>Tell the school which year group you are considering and how the team can contact you.</p></article><article><b>02</b><h3>Talk with the school</h3><p>The admissions team can explain current availability, entry requirements and any next steps.</p></article><article><b>03</b><h3>Complete the application</h3><p>Request the current application form and submit it with the documents the school specifies.</p></article></div></Section><Section title="Application information" muted><Cards items={[{ title: 'Application form', text: 'Contact the school office for the current form and submission instructions.' }, { title: 'Supporting documents', text: 'The admissions team will confirm which learner and guardian documents are needed for the year group.' }, { title: 'Placement guidance', text: 'Any placement conversation or assessment requirements will be explained by the school.' }]} /></Section><Section title="Admissions enquiry"><p className="intro-copy">Send a question and the school team will follow up using the contact details you provide.</p><EnquiryForm kind="admissions" /></Section></> }
export function ContactPage() { const whatsapp = schoolInfo.whatsapp ? `https://wa.me/${schoolInfo.whatsapp.replace(/\D/g, '')}` : null; const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(schoolInfo.address)}`; return <><PageTitle title="Contact" description="Contact Fordridge Junior and Senior School in Harare." /><PageHero eyebrow="Contact" title="We would love to hear from you." text="Contact the school team or use the address below to plan your visit." /><Section title="Contact details"><div className="contact-grid"><article><h3>Find us</h3><p>{schoolInfo.address}</p><a href={mapUrl} target="_blank" rel="noreferrer">View directions →</a></article><article><h3>Call or email</h3><p>{schoolInfo.phone}<br />{schoolInfo.email}</p>{whatsapp && <a href={whatsapp}>Message us on WhatsApp →</a>}</article></div></Section><Section title="Send us a message"><EnquiryForm kind="contact" /></Section></> }

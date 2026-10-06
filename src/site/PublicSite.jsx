import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import crest from '../assets/fordridge-crest.jpeg'
import { schoolInfo } from '../data/schoolInfo'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
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
  <section className="notice-strip"><p><strong>School notices</strong> <span>[EDIT THIS] Add the latest admissions, calendar or community notice here.</span></p><Link to="/contact">Contact the school →</Link></section>
  <section className="contact-strip"><div><p className="eyebrow">Visit Fordridge</p><h2>Let’s start a conversation.</h2><p>{schoolInfo.address}</p></div><Link className="light-button" to="/contact">Contact us</Link></section></> }

export function AboutPage() { return <><PageTitle title="About" description="Learn about Fordridge Senior School." /><PageHero eyebrow="About Fordridge" title="A community for learning and growth." text="Fordridge brings together a Junior and Senior School in a shared commitment to helping learners flourish." /><Section title="Our story"><p className="intro-copy">[EDIT THIS] Share Fordridge’s founding story, community roots and the journey that shaped the school.</p></Section><Section title="Mission and vision" muted><Cards items={[{ title: 'Our mission', text: '[EDIT THIS] Describe the school’s mission.' }, { title: 'Our vision', text: '[EDIT THIS] Describe the school’s vision.' }]} /></Section><Section title="Our values"><Cards items={[{ title: 'Learn', text: 'We approach learning with curiosity, commitment and care.' }, { title: 'Excel', text: 'We strive for quality and growth in every endeavour.' }, { title: 'Achieve', text: 'We support learners to pursue meaningful goals with confidence.' }]} /></Section><Section title="Leadership" muted><div className="leadership-grid">{schoolInfo.leadership.map((person) => <article key={person.role}><img src={crest} alt="" /><h3>{person.name}</h3><p className="role">{person.role}</p><p>{person.bio}</p></article>)}</div></Section></> }

const activities = [{ title: 'Sport and wellbeing', text: '[EDIT THIS] Add school sporting and wellbeing opportunities.' }, { title: 'Culture and creativity', text: '[EDIT THIS] Add clubs, arts and cultural activities.' }, { title: 'Leadership and service', text: '[EDIT THIS] Add leadership and community initiatives.' }]
export function JuniorPage() { return <><PageTitle title="Junior School" description="Discover Fordridge Junior School." /><PageHero eyebrow="Junior School" title="A confident beginning." text="Our Junior School provides a caring environment in which young learners can build strong foundations." /><Section title="Junior School overview"><p className="intro-copy">[EDIT THIS] Add a concise overview of the Junior School, its year groups and learning approach.</p></Section><Section title="Curriculum" muted><Cards items={[{ title: 'Core learning', text: '[EDIT THIS] Describe the Junior School curriculum.' }, { title: 'Learning support', text: '[EDIT THIS] Describe learner support and enrichment.' }, { title: 'Growing independence', text: '[EDIT THIS] Describe how learners develop confidence and responsibility.' }]} /></Section><Section title="Activities"><Cards items={activities} /></Section></> }
export function SeniorPage() { return <><PageTitle title="Senior School" description="Discover Fordridge Senior School programmes." /><PageHero eyebrow="Senior School" title="Ready for what’s next." text="Fordridge Senior School supports learners to deepen their knowledge, discover their strengths and prepare for future opportunities." /><Section title="Senior School overview"><p className="intro-copy">[EDIT THIS] Add a concise overview of the Senior School, its year groups and learning environment.</p></Section><Section title="Academic pathways" muted><Cards items={[{ title: 'O-Level', text: 'Learners may prepare for ZIMSEC and Cambridge O-Level pathways. [EDIT THIS] Confirm available examination options.' }, { title: 'A-Level', text: 'Learners may prepare for ZIMSEC and Cambridge A-Level pathways. [EDIT THIS] Confirm available examination options.' }]} /></Section><Section title="Subject streams"><Cards items={[{ title: 'Arts', text: '[EDIT THIS] List available Arts subjects.' }, { title: 'Commercials', text: '[EDIT THIS] List available Commercial subjects.' }, { title: 'Sciences', text: '[EDIT THIS] List available Science subjects.' }]} /></Section><Section title="Beyond the classroom" muted><Cards items={activities} /></Section></> }

export function GalleryPage() {
  const [images, setImages] = useState(() => shuffleImages(galleryImages))
  return <><PageTitle title="Gallery" description="A glimpse of life at Fordridge Junior and Senior School." /><PageHero eyebrow="Gallery" title="Life at Fordridge." text="A selection of moments from our school community." /><Section title="School gallery"><div className="gallery-toolbar"><p className="intro-copy">Images are shown in a new random order each time you visit.</p><button className="gallery-shuffle" onClick={() => setImages(shuffleImages(galleryImages))}>Shuffle images</button></div><div className="gallery-grid">{images.map((image, index) => <figure key={image}><img src={image} alt={`Fordridge school life, photo ${index + 1}`} loading="lazy" /><figcaption>Fordridge school life</figcaption></figure>)}</div></Section></>
}

function EnquiryForm({ kind = 'enquiry' }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '' }); const [status, setStatus] = useState(''); const [sending, setSending] = useState(false)
  async function submit(e) { e.preventDefault(); setStatus(''); if (!form.name.trim() || !form.email.trim() || !form.message.trim()) return setStatus('Please complete your name, email address and message.'); if (!/^\S+@\S+\.\S+$/.test(form.email)) return setStatus('Please enter a valid email address.'); setSending(true)
    if (isSupabaseConfigured && supabase) { const { error } = await supabase.from('enquiries').insert({ name: form.name, email: form.email, phone: form.phone || null, message: form.message, enquiry_type: kind }); if (error) { setStatus('We could not send your message right now. Please try again later.'); setSending(false); return } }
    setStatus('Thank you — your message has been received. We will be in touch soon.'); setForm({ name: '', email: '', phone: '', message: '' }); setSending(false)
  }
  return <form className="public-form" onSubmit={submit} noValidate><label>Name <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label><label>Email <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label><label>Phone <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label><label>Message <textarea rows="5" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} required /></label><button className="primary-button" disabled={sending}>{sending ? 'Sending…' : 'Send enquiry'}</button>{status && <p className={status.startsWith('Thank') ? 'form-success' : 'form-error'} role="status">{status}</p>}{!isSupabaseConfigured && <p className="form-note">[EDIT THIS] Connect Supabase to save enquiries.</p>}</form>
}
export function AdmissionsPage() { return <><PageTitle title="Admissions" description="Start an admissions enquiry with Fordridge." /><PageHero eyebrow="Admissions" title="Your Fordridge journey starts here." text="We welcome enquiries from families who would like to learn more about our Junior and Senior School." /><Section title="How to apply"><div className="steps"><article><b>01</b><h3>Make an enquiry</h3><p>Send us your details and the year group you are considering.</p></article><article><b>02</b><h3>Connect with us</h3><p>[EDIT THIS] Add the school’s admissions consultation or visit process.</p></article><article><b>03</b><h3>Submit your application</h3><p>[EDIT THIS] Add formal application and assessment details.</p></article></div></Section><Section title="Required documents" muted><Cards items={[{ title: 'For your application', text: '[EDIT THIS] List required forms and supporting documents.' }, { title: 'For placement', text: '[EDIT THIS] List any academic records or identification documents required.' }]} /></Section><Section title="Admissions enquiry"><p className="intro-copy">Complete the form and a member of the Fordridge team will respond.</p><EnquiryForm kind="admissions" /></Section></> }
export function ContactPage() { const whatsapp = schoolInfo.whatsapp === '[EDIT THIS]' ? null : `https://wa.me/${schoolInfo.whatsapp.replace(/\D/g, '')}`; return <><PageTitle title="Contact" description="Contact Fordridge Senior School in Harare." /><PageHero eyebrow="Contact" title="We would love to hear from you." text="Get in touch with Fordridge or plan your visit to our campus on Kirkman Road." /><Section title="Contact details"><div className="contact-grid"><article><h3>Find us</h3><p>{schoolInfo.address}</p></article><article><h3>Call or email</h3><p>{schoolInfo.phone}<br />{schoolInfo.email}</p>{whatsapp ? <a href={whatsapp}>Message us on WhatsApp →</a> : <p>[EDIT THIS] Add WhatsApp number.</p>}</article></div></Section><Section title="Map" muted><div className="map-placeholder"><strong>Map location</strong><p>[EDIT THIS] Embed or link the school’s verified map location.</p></div></Section><Section title="Send us a message"><EnquiryForm kind="contact" /></Section></> }

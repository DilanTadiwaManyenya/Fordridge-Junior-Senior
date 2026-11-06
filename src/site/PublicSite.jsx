import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import crest from '../assets/fordridge-crest.jpeg'
import { schoolInfo } from '../data/schoolInfo'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { submitEnquiry } from './enquiry-workflow'
import './public-site.css'

const navItems = [
  ['Home', '/'], ['About', '/about'], ['Junior School', '/junior-school'], ['Senior School', '/senior-school'], ['Gallery', '/gallery'], ['Admissions', '/admissions'], ['Contact', '/contact'],
]

const galleryImages = Object.values(import.meta.glob('../assets/images/*.{jpeg,jpg,png,webp}', { eager: true, import: 'default' }))
const campusImages = Object.values(import.meta.glob('../assets/images/*.{jpeg,jpg,png,webp}', { eager: true, import: 'default', query: '?url' }))
const featuredPhotos = [
  { src: campusImages[10], alt: 'Fordridge learners gathered outside the school building', label: 'A community that learns together' },
  { src: campusImages[3], alt: 'Learners working together in a science practical', label: 'Curiosity in action' },
  { src: campusImages[15], alt: 'Fordridge learners taking part in an outdoor team activity', label: 'Learning beyond the classroom' },
]
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
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const targets = document.querySelectorAll('#main-content .editorial-hero-copy, #main-content .editorial-hero-image, #main-content .story-feature > div, #main-content .values-editorial > article, #main-content .activity-editorial > article, #main-content .home-proof, #main-content .home-life-heading, #main-content .life-photo, #main-content .admissions-steps > article, #main-content .admissions-note > div, #main-content .contact-quick > a, #main-content .contact-location > div, #main-content .public-form, #main-content .home-hero .hero-seal, #main-content .home-hero .hero-index, #main-content .content-section > .section-heading, #main-content .content-section > .intro-copy, #main-content .school-card')
    let observer
    const reveal = (target) => {
      if (!target.classList.contains('motion-pending')) return
      target.classList.remove('motion-pending')
      requestAnimationFrame(() => target.classList.add('motion-visible'))
      observer?.unobserve(target)
    }
    const revealVisible = () => {
      targets.forEach((target) => {
        const rect = target.getBoundingClientRect()
        if (rect.top < window.innerHeight * 0.92 && rect.bottom > 0) reveal(target)
      })
    }
    targets.forEach((target, index) => {
      target.style.setProperty('--motion-index', String(index % 4))
      target.classList.add('motion-reveal')
      target.classList.add('motion-pending')
    })
    requestAnimationFrame(revealVisible)
    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
        if (entry.isIntersecting) reveal(entry.target)
      }), { threshold: 0.01, rootMargin: '0px 0px -24px 0px' })
      targets.forEach((target) => observer.observe(target))
    } else {
      window.addEventListener('scroll', revealVisible, { passive: true })
      window.addEventListener('resize', revealVisible)
    }
    return () => {
      observer?.disconnect()
      window.removeEventListener('scroll', revealVisible)
      window.removeEventListener('resize', revealVisible)
    }
  }, [location.pathname])
  return <div className="public-site">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <header className="public-header"><Brand />
      <button className="menu-toggle" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="main-navigation" aria-label={open ? 'Close main navigation' : 'Open main navigation'}><span>{open ? 'Close' : 'Menu'}</span><span className={open ? 'menu-icon is-open' : 'menu-icon'} aria-hidden="true"><i /><i /></span></button>
      <nav id="main-navigation" className={open ? 'public-nav is-open' : 'public-nav'} aria-label="Main navigation" data-open={open} onKeyDown={(event) => { if (event.key === 'Escape') { setOpen(false); document.querySelector('.menu-toggle')?.focus() } }}>
        {navItems.map(([label, to]) => <NavLink key={to} to={to}>{label}</NavLink>)}
        <a className="portal-button" href="/portal/login">Portal Login</a>
      </nav>
    </header>
    <main id="main-content">{children}</main>
    <footer className="public-footer"><div className="footer-brand"><Brand /><p>{schoolInfo.motto}</p></div><div><h2>Visit us</h2><p>{schoolInfo.address}</p></div><div><h2>Get in touch</h2><p>{schoolInfo.phone}<br />{schoolInfo.email}</p><a className="footer-portal" href="/portal/login">Portal Login</a></div></footer>
  </div>
}

function PageHero({ eyebrow, title, text, image = featuredPhotos[0], number = '01' }) { return <section className="page-hero editorial-hero"><div className="editorial-hero-copy"><p className="eyebrow"><span className="eyebrow-rule" />{eyebrow}</p><h1>{title}</h1><p>{text}</p></div><div className="editorial-hero-image"><img src={image.src} alt={image.alt} loading="eager" fetchPriority="high" decoding="async"/><span>{number} / FORDRIDGE</span></div></section> }
function Section({ title, children, muted = false }) { return <section className={muted ? 'content-section muted-section' : 'content-section'}><div className="section-heading"><h2>{title}</h2></div>{children}</section> }
function Cards({ items }) { return <div className="info-grid">{items.map((item) => <article key={item.title} className="info-card"><h3>{item.title}</h3><p>{item.text}</p></article>)}</div> }

export function HomePage() { return <><PageTitle title="Home" description="Fordridge Junior and Senior School in Harare, Zimbabwe." /><section className="home-hero"><div className="home-hero-copy"><p className="eyebrow"><span className="eyebrow-rule" /> Kirkman Road · Harare, Zimbabwe</p><h1>Learn with<br /><em>purpose.</em></h1><p>Rooted in community. Growing through learning. Fordridge brings Junior and Senior learners together on a journey of knowledge, character and achievement.</p><div className="hero-actions"><Link className="primary-button" to="/admissions">Explore admissions <span>↗</span></Link><Link className="text-link" to="/about">Discover Fordridge <span>→</span></Link></div><div className="hero-signature"><span className="signature-mark">F</span><span><strong>LEARN&nbsp; · &nbsp;EXCEL&nbsp; · &nbsp;ACHIEVE</strong><small>Fordridge Junior &amp; Senior School</small></span></div></div><div className="hero-visual"><div className="hero-photo-main"><img src={featuredPhotos[0].src} alt={featuredPhotos[0].alt} fetchPriority="high" decoding="async"/><span className="photo-caption"><span className="caption-dot" /> Harare, Zimbabwe</span></div><div className="hero-photo-float"><img src={featuredPhotos[1].src} alt={featuredPhotos[1].alt} loading="lazy" decoding="async"/></div><div className="hero-seal"><img src={crest} alt="" /><span>FORDRIDGE<br/>SCHOOL</span></div><span className="hero-index">01 <i /> 03</span></div></section>
  <div className="home-proof"><span>One school community</span><i /><span>Junior &amp; Senior learning</span><i /><span>Based in Harare, Zimbabwe</span></div>
  <Section title="A school journey, side by side"><p className="intro-copy">From a learner’s first questions to the confidence to shape what comes next, Fordridge is here for every step of the journey.</p><div className="school-card-grid"><Link to="/junior-school" className="school-card junior"><div className="school-card-photo"><img src={featuredPhotos[1].src} alt="Learners engaged in a science practical"/><span>01 / THE BEGINNING</span></div><div className="school-card-copy"><span className="card-kicker">JUNIOR SCHOOL</span><h3>Curiosity starts here.</h3><p>A supportive foundation for growing minds, new ideas and confident learning habits.</p><b>Meet the Junior School <span>↗</span></b></div></Link><Link to="/senior-school" className="school-card senior"><div className="school-card-photo"><img src={featuredPhotos[2].src} alt="Learners taking part in a school team activity"/><span>02 / WHAT'S NEXT</span></div><div className="school-card-copy"><span className="card-kicker">SENIOR SCHOOL</span><h3>Ready to go further.</h3><p>Space to deepen knowledge, discover strengths and prepare for future opportunities.</p><b>Meet the Senior School <span>↗</span></b></div></Link></div></Section>
  <Section title="Why Fordridge" muted><Cards items={schoolInfo.highlights} /></Section>
  <section className="notice-strip"><p><strong>School information</strong> <span>Contact the school for current admissions guidance, term dates and community updates.</span></p><Link to="/contact">Contact the school →</Link></section>
  <section className="home-life"><div className="home-life-heading"><p className="eyebrow">A glimpse of Fordridge</p><h2>Learning is lived<br/>together.</h2><Link to="/gallery" className="text-link">View the school gallery <span>→</span></Link></div><div className="home-life-photos">{featuredPhotos.map((photo, index) => <figure className={`life-photo life-photo-${index + 1}`} key={photo.label}><img src={photo.src} alt={photo.alt}/><figcaption><span>0{index + 1}</span>{photo.label}</figcaption></figure>)}</div></section>
  <section className="contact-strip"><div><p className="eyebrow">Visit Fordridge</p><h2>Let’s start a conversation.</h2><p>{schoolInfo.address}</p><p className="contact-quick-links"><a href={`tel:${schoolInfo.phone.split(',')[0].replaceAll(' ', '')}`}>Call the school <span>↗</span></a><a href={`mailto:${schoolInfo.email}`}>Email us <span>↗</span></a></p></div><Link className="light-button" to="/contact">Contact us <span>→</span></Link></section></> }

export function AboutPage() { return <><PageTitle title="About" description="Learn about Fordridge Junior and Senior School." /><PageHero eyebrow="ABOUT FORDRIDGE" title="A school community with purpose." text="Learn. Excel. Achieve. At Fordridge, the Junior and Senior School journey is shaped by learning, shared effort and a close connection with families." image={featuredPhotos[0]} number="01"/><section className="story-feature"><div className="story-feature-image"><img src={featuredPhotos[1].src} alt={featuredPhotos[1].alt}/><span>Curiosity in action</span></div><div><p className="eyebrow">THE FORDRIDGE JOURNEY</p><h2>Room to grow.<br/><em>Reason to strive.</em></h2><p>Each learner arrives with their own questions, strengths and ambitions. Fordridge brings Junior and Senior learning together in a community that encourages steady progress, confidence and respect for others.</p><p>Our motto is a simple expression of that journey: learn with curiosity, excel through commitment, and achieve with purpose.</p><Link to="/junior-school" className="text-link">Explore the school journey <span>→</span></Link></div></section><Section title="A shared foundation" muted><p className="intro-copy">The school’s motto gives families a clear starting point for understanding what Fordridge values in learning and personal growth.</p><div className="values-editorial">{[{n:'01',title:'Learn',text:'Stay curious, ask questions and build strong foundations for continued learning.'},{n:'02',title:'Excel',text:'Bring care and commitment to the work of growing, improving and supporting one another.'},{n:'03',title:'Achieve',text:'Move toward meaningful goals with confidence, responsibility and purpose.'}].map(v=><article key={v.n}><span>{v.n}</span><h3>{v.title}</h3><p>{v.text}</p></article>)}</div></Section><section className="leadership-note"><div><p className="eyebrow">SCHOOL LEADERSHIP</p><h2>Meet the people<br/>behind the journey.</h2></div><div><p>We’re happy to connect families with the right member of the Fordridge team. Contact the school office for current leadership contacts and enquiries about the Junior and Senior arms.</p><a className="text-link" href={`mailto:${schoolInfo.email}`}>Contact the school office <span>↗</span></a></div></section></> }

const activities = [{ title: 'Sport and wellbeing', text: 'Contact the school to learn about current sporting and wellbeing opportunities.' }, { title: 'Culture and creativity', text: 'Ask the school team about clubs, creative activities and events offered during the year.' }, { title: 'Leadership and service', text: 'The school can share current opportunities for learner leadership and community involvement.' }]
export function JuniorPage() { return <><PageTitle title="Junior School" description="Discover Fordridge Junior School." /><PageHero eyebrow="JUNIOR SCHOOL" title="A confident beginning." text="A place to build strong foundations, grow curiosity and develop the confidence to take the next step." image={featuredPhotos[1]} number="02"/><section className="story-feature junior-feature"><div><p className="eyebrow">THE FIRST CHAPTER</p><h2>Big questions.<br/><em>Strong foundations.</em></h2><p>Junior learning is a time for exploration, discovery and building positive habits. At Fordridge, learners are encouraged to grow their knowledge, communicate with confidence and take pride in steady progress.</p><p>Families can speak with the school about current year groups, entry guidance and the support available for each learner.</p><Link to="/admissions" className="primary-button">Ask about admissions <span>→</span></Link></div><div className="story-feature-image"><img src={featuredPhotos[0].src} alt="Fordridge learners gathered together at school"/><span>Growing together at Fordridge</span></div></section><Section title="Learning that grows with the learner" muted><p className="intro-copy">A supportive learning journey helps children build skills, confidence and independence over time.</p><div className="values-editorial">{[{n:'01',title:'Build foundations',text:'Strengthen communication, literacy, numeracy and problem-solving through purposeful learning.'},{n:'02',title:'Find confidence',text:'Encourage learners to share ideas, try new approaches and take pride in progress.'},{n:'03',title:'Grow together',text:'Develop responsibility, care and respect as part of a connected school community.'}].map(v=><article key={v.n}><span>{v.n}</span><h3>{v.title}</h3><p>{v.text}</p></article>)}</div></Section><Section title="Discover life at Fordridge"><div className="activity-editorial">{activities.map((item,i)=><article key={item.title}><span>0{i+1}</span><div><h3>{item.title}</h3><p>{item.text}</p></div></article>)}</div></Section></> }
export function SeniorPage() { return <><PageTitle title="Senior School" description="Discover Fordridge Senior School programmes." /><PageHero eyebrow="SENIOR SCHOOL" title="Ready for what’s next." text="A place to deepen knowledge, discover strengths and prepare for the opportunities ahead." image={featuredPhotos[2]} number="03"/><section className="story-feature"><div className="story-feature-image"><img src={featuredPhotos[2].src} alt={featuredPhotos[2].alt}/><span>Learning beyond the classroom</span></div><div><p className="eyebrow">THE NEXT CHAPTER</p><h2>Find your direction.<br/><em>Make it count.</em></h2><p>Senior School is a time to build on what has come before, take greater ownership of learning and begin shaping future goals.</p><p>Fordridge supports learners as they deepen their knowledge and explore their strengths. Families can contact the school for current year-group, subject and progression guidance.</p><Link to="/admissions" className="primary-button">Talk to the school <span>→</span></Link></div></section><Section title="Preparing for the next step" muted><p className="intro-copy">The school team can guide families through current learning pathways and help them understand the options available to each learner.</p><div className="values-editorial">{[{n:'01',title:'Deepen learning',text:'Build on existing knowledge and develop strong, independent learning habits.'},{n:'02',title:'Explore strengths',text:'Make room for learners to recognise their interests, abilities and ambitions.'},{n:'03',title:'Plan with care',text:'Discuss current subject choices, examination pathways and progression directly with the school.'}].map(v=><article key={v.n}><span>{v.n}</span><h3>{v.title}</h3><p>{v.text}</p></article>)}</div></Section><Section title="A wider school experience"><div className="activity-editorial">{activities.map((item,i)=><article key={item.title}><span>0{i+1}</span><div><h3>{item.title}</h3><p>{item.text}</p></div></article>)}</div></Section></> }

export function GalleryPage() {
  const [images, setImages] = useState(() => shuffleImages(galleryImages))
  const [filter, setFilter] = useState('All moments')
  const filters = ['All moments', 'Learning', 'Sport & community']
  const filteredImages = images.filter((image) => {
    const index = galleryImages.indexOf(image)
    if (filter === 'Learning') return index < 10
    if (filter === 'Sport & community') return index >= 10
    return true
  })
  return <><PageTitle title="Gallery" description="A glimpse of life at Fordridge Junior and Senior School." /><PageHero eyebrow="SCHOOL LIFE" title="Life at Fordridge." text="A collection of moments from learning, friendship and shared experiences across our school community." image={featuredPhotos[0]} number="04"/><Section title="Moments that make a school"><div className="gallery-toolbar"><p className="intro-copy">Browse classroom moments, outdoor activities and community life at Fordridge.</p><button className="gallery-shuffle" onClick={() => setImages(shuffleImages(galleryImages))}>Refresh the moments <span>↻</span></button></div><div className="gallery-filters" role="group" aria-label="Filter gallery images">{filters.map((item) => <button key={item} className={filter === item ? 'gallery-filter is-active' : 'gallery-filter'} aria-pressed={filter === item} onClick={() => setFilter(item)}>{item}</button>)}</div><div className="gallery-grid">{filteredImages.map((image, index) => <figure key={image}><img src={image} alt={`Fordridge school ${filter === 'Learning' ? 'learning' : filter === 'Sport & community' ? 'community' : 'life'}, moment ${index + 1}`} loading="lazy"/><figcaption><span>{String(index + 1).padStart(2, '0')}</span>{filter === 'Learning' ? 'Learning at Fordridge' : filter === 'Sport & community' ? 'Community at Fordridge' : 'A Fordridge moment'}</figcaption></figure>)}</div></Section><section className="gallery-invite"><div><p className="eyebrow">BECOME PART OF THE STORY</p><h2>See yourself at Fordridge?</h2><p>Talk with the school about joining the Junior or Senior School community.</p></div><Link className="light-button" to="/admissions">Ask about admissions <span>→</span></Link></section></>
}

function EnquiryForm({ kind = 'enquiry' }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', schoolSection: '', yearGroup: '', message: '' }); const [status, setStatus] = useState(''); const [sending, setSending] = useState(false)
  async function submit(e) { e.preventDefault(); setStatus(''); if (!form.name.trim() || !form.email.trim() || !form.message.trim()) return setStatus('Please complete your name, email address and message.'); if (!/^\S+@\S+\.\S+$/.test(form.email)) return setStatus('Please enter a valid email address.'); setSending(true)
    const context = [form.schoolSection && `School section: ${form.schoolSection}`, form.yearGroup && `Year group: ${form.yearGroup}`].filter(Boolean).join('\n')
    const result = await submitEnquiry(supabase, isSupabaseConfigured, { name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim() || null, message: [context, form.message.trim()].filter(Boolean).join('\n\n'), enquiry_type: kind })
    if (!result.ok) { setStatus(result.reason === 'unavailable' ? 'The enquiry service is unavailable. Please contact the school by phone or email.' : 'We could not send your message right now. Please try again later.'); setSending(false); return }
    setStatus('Thank you — your message has been received. The school team will be in touch.'); setForm({ name: '', email: '', phone: '', schoolSection: '', yearGroup: '', message: '' }); setSending(false)
  }
  return <form className="public-form" onSubmit={submit} noValidate><div className="form-intro"><p className="eyebrow">{kind === 'admissions' ? 'ADMISSIONS ENQUIRY' : 'SEND A MESSAGE'}</p><p>{kind === 'admissions' ? 'Share a few details so the school can direct your question to the right team.' : 'We’ll pass your message to the school team.'}</p></div><label>Your name <input autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label><label>Email address <input type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label><label>Phone number <input type="tel" autoComplete="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>{kind === 'admissions' && <div className="form-select-grid"><label>School section <select value={form.schoolSection} onChange={(e) => setForm({ ...form, schoolSection: e.target.value })}><option value="">Choose a section (optional)</option><option>Junior School</option><option>Senior School</option><option>Not sure yet</option></select></label><label>Year group <input value={form.yearGroup} onChange={(e) => setForm({ ...form, yearGroup: e.target.value })} placeholder="e.g. Grade or Form" /></label></div>}<label>{kind === 'admissions' ? 'How can we help?' : 'Your message'} <textarea rows="5" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} required /></label><button className="primary-button" disabled={sending}>{sending ? 'Sending…' : kind === 'admissions' ? 'Send admissions enquiry' : 'Send message'} <span>→</span></button>{status && <p className={status.startsWith('Thank') ? 'form-success' : 'form-error'} role="status">{status}</p>}{!isSupabaseConfigured && <p className="form-note">The enquiry service is unavailable. Please contact the school using the details on this page.</p>}</form>
}
export function AdmissionsPage() { return <><PageTitle title="Admissions" description="Start an admissions enquiry with Fordridge." /><PageHero eyebrow="ADMISSIONS" title="Take the first step." text="Thinking about Fordridge for your child? Start a conversation with the school and get guidance for your family’s next step." image={featuredPhotos[0]} number="05"/><Section title="A straightforward place to begin"><p className="intro-copy">The school team can guide you through current availability, entry guidance and the application process for the Junior or Senior School.</p><div className="admissions-steps"><article><span>01</span><h3>Tell us what you’re looking for</h3><p>Share the school section and year group you have in mind, if known.</p></article><article><span>02</span><h3>Speak with the school</h3><p>The team can answer your questions and explain current requirements and next steps.</p></article><article><span>03</span><h3>Continue with guidance</h3><p>Request the current application information and supporting document list from the school office.</p></article></div></Section><section className="admissions-note"><div><p className="eyebrow">CURRENT INFORMATION</p><h2>Get the latest details<br/>directly from Fordridge.</h2></div><div><p>Availability, year groups, entry requirements and application documents can change. The school office will share the current guidance for your enquiry.</p><a className="text-link" href={`tel:${schoolInfo.phone.split(',')[0].replaceAll(' ', '')}`}>Call the school <span>↗</span></a></div></section><Section title="Send an admissions enquiry"><p className="intro-copy">Add a school section or year group if you know it. These details are optional and help the team understand your question.</p><EnquiryForm kind="admissions" /></Section></> }
export function ContactPage() { const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(schoolInfo.address)}`; const embedUrl = `https://www.google.com/maps?q=${encodeURIComponent(schoolInfo.address)}&output=embed`; return <><PageTitle title="Contact" description="Contact Fordridge Junior and Senior School in Harare." /><PageHero eyebrow="CONTACT FORDRIDGE" title="We’re here to help." text="Ask a question, speak with the school team or plan a visit to Fordridge in Harare." image={featuredPhotos[0]} number="06"/><section className="contact-quick"><a href={`tel:${schoolInfo.phone.split(',')[0].replaceAll(' ', '')}`}><span>CALL THE SCHOOL</span><strong>{schoolInfo.phone.split(',')[0]}</strong><b>Speak with the office ↗</b></a><a href={`mailto:${schoolInfo.email}`}><span>EMAIL THE SCHOOL</span><strong>{schoolInfo.email}</strong><b>Send an email ↗</b></a><a href={mapUrl} target="_blank" rel="noreferrer"><span>VISIT FORDRIDGE</span><strong>8940 Kirkman Road</strong><b>Tynwald, Harare · Get directions ↗</b></a></section><Section title="Find the school"><div className="contact-location"><div><p className="eyebrow">HARARE, ZIMBABWE</p><h3>Fordridge Junior &amp; Senior School</h3><p>{schoolInfo.address}</p><a className="text-link" href={mapUrl} target="_blank" rel="noreferrer">Open directions <span>↗</span></a></div><div className="contact-map"><iframe title="Map showing Fordridge Junior and Senior School on Kirkman Road, Tynwald, Harare" src={embedUrl} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen/><a className="map-attribution" href="https://www.google.com/maps/search/?api=1&query=Fordridge+Junior+Senior+School+8940+Kirkman+Road+Tynwald+Harare" target="_blank" rel="noreferrer">View larger map ↗</a></div></div></Section><section className="contact-message"><div><p className="eyebrow">SEND A MESSAGE</p><h2>How can we help?</h2><p>Leave a note and the school team will follow up using the contact details you provide.</p></div><EnquiryForm kind="contact"/></section></> }


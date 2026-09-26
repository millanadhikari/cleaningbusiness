"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Bath,
  BedDouble,
  CalendarCheck,
  Check,
  ChevronDown,
  CircleCheck,
  Clock3,
  CookingPot,
  DoorOpen,
  House,
  KeyRound,
  MapPin,
  Menu,
  MessageCircle,
  Phone,
  ShieldCheck,
  Sparkles,
  SprayCan,
  Warehouse,
  WashingMachine,
  UserRound,
  X,
} from "lucide-react";
import { QuoteModal } from "../../components/quote-modal";
import { Button } from "../../components/ui/button";
import { ServiceMenu } from "../../components/service-menu";
import styles from "./page.module.css";

const homeNavLinks = [
  ["Home", "/"],
  ["Services", "#included"],
  ["Bond guarantee", "#bond-guarantee"],
  ["Why WeDo", "#process"],
  ["Service areas", "#service-areas"],
  ["Blog", "/blog"],
] as const;

function Action({ light = false, onClick }: { light?: boolean; onClick: () => void }) {
  return <Button type="button" onClick={onClick} className={`action ${light ? "light" : ""}`}>Get a free quote <ArrowUpRight size={18} /></Button>;
}

function Logo() {
  return <Link className="logo brand-logo-lockup" href="/#home" aria-label="WeDo Cleaning Services home"><Image src="/wedo-mark.png" width={544} height={544} alt="" /><span className="logo-wordmark"><strong>We<em>Do</em></strong><small>CLEANING SERVICES</small></span></Link>;
}

const checklist = [
  {
    title: "Kitchen & appliances",
    icon: CookingPot,
    items: [
      "Oven interior, racks, trays and door glass",
      "Stovetop, splashback and rangehood filters",
      "Benchtops, sink, taps and accessible surfaces",
      "Cupboards and drawers inside and out when empty",
    ],
  },
  {
    title: "Bathrooms & laundry",
    icon: Bath,
    items: [
      "Shower, bath, screens, basins and vanities",
      "Toilets, mirrors and chrome fittings",
      "Tiles, grout and soap residue where treatable",
      "Exhaust fans, laundry tub and floors",
    ],
  },
  {
    title: "Bedrooms & living",
    icon: BedDouble,
    items: [
      "Wardrobes, shelves and reachable surfaces",
      "Doors, handles, switches and power points",
      "Skirting boards, cornices and cobweb removal",
      "Thorough vacuuming and mopping of floors",
    ],
  },
  {
    title: "Windows & final details",
    icon: DoorOpen,
    items: [
      "Interior window glass, frames, sills and tracks",
      "One sliding glass door set included",
      "Light fittings and accessible ceiling fans",
      "Spot marks on walls where safe and suitable",
    ],
  },
];

const extras = [
  ["Carpet steam cleaning", "For carpeted bedrooms and living areas", SprayCan],
  ["Exterior windows", "Ground-floor glass that is safely reachable", DoorOpen],
  ["Large balcony or patio", "Outdoor floors, rails and glass detailing", House],
  ["Garage clean", "Sweep and tidy of an empty garage", Warehouse],
] as const;

const faqs = [
  ["Is the oven included?", "Yes. One standard oven is included in the base end-of-lease estimate. Additional ovens can be added during your quote."],
  ["Do I need carpet steam cleaning?", "It depends on your lease and the condition of the carpet. Vacuuming is included; professional steam cleaning can be added when your agreement, agent or pet clause requires it."],
  ["Does the property need to be empty?", "For the best result, arrange the clean after furniture and personal items have been removed and before the final inspection. Empty cupboards also let us clean inside them properly."],
  ["What does the re-clean promise cover?", "If your agent flags an issue within the cleaning scope agreed on your booking, contact us within the stated booking period and we’ll arrange a return visit. It does not cover damage, wear and tear, or items outside the agreed scope."],
  ["How long will the clean take?", "Timing varies with property size, access and condition. We confirm the expected window after reviewing your quote details."],
  ["Do you service my Sydney suburb?", "We cover Sydney and surrounding service areas. Send your postcode with the quote request and our team will confirm availability."],
] as const;

export function EndOfLeaseLanding() {
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const openQuote = () => { setQuoteOpen(true); setMenuOpen(false); };

  return <><main id="end-of-lease" className={styles.page} aria-hidden={quoteOpen} inert={quoteOpen}>
    <div className="announcement"><span><MapPin size={13} /> Sydney locals. A cleaner kind of care.</span><span className="announcement-right">Your space. Our specialty.</span></div>
    <div className="site-navigation"><header className="wrap header"><Logo /><nav aria-label="Main navigation">{homeNavLinks.map(([label, href], index) => label === "Services" ? <ServiceMenu key={label} /> : <Link key={href} href={href} className={index === 2 ? "active" : ""}>{label}</Link>)}</nav><div className="nav-utilities"><a href="tel:+61401356937" className="nav-phone" aria-label="Call WeDo on 0401 356 937"><span className="phone-symbol"><Phone size={19} /></span><span><small>LET’S TALK CLEAN</small><strong>0401 356 937</strong></span></a><span className="nav-divider" /><Link href="/sign-in" className="nav-login" aria-label="Staff login" title="Staff login"><UserRound size={21} /></Link></div><div className="header-action"><Action onClick={openQuote} /></div><button className="menu-toggle" aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen} aria-controls="mobile-navigation" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button></header>{menuOpen && <nav id="mobile-navigation" className="mobile-menu" aria-label="Mobile navigation">{homeNavLinks.map(([label, href]) => label === "Services" ? <ServiceMenu key={label} onNavigate={() => setMenuOpen(false)} /> : <Link key={href} href={href}>{label}<ArrowRight size={16} /></Link>)}<div className="mobile-contact"><Phone size={20} /><a href="tel:+61401356937" className="mobile-phone-link"><small>CALL OUR SYDNEY TEAM</small><strong>0401 356 937</strong></a><Link href="/sign-in" className="mobile-login"><UserRound size={18} />Login</Link></div><Action onClick={openQuote} /></nav>}</div>

    <section className={styles.hero}>
      <div className={styles.heroContent}>
        <div className={styles.eyebrow}><Sparkles /> End of lease · Bond · Move-out cleaning</div>
        <h1>Leave it spotless.<br /><em>Move on stress-free.</em></h1>
        <p className={styles.heroLead}>A thorough, inspection-ready clean for Sydney renters, landlords and property managers—built around the details agents check most.</p>
        <div className={styles.heroActions}>
          <Action onClick={openQuote} />
          <a href="tel:+61401356937"><Phone /> Speak to our Sydney team</a>
        </div>
        <div className={styles.heroProof}>
          <span><CircleCheck /> Full room-by-room checklist</span>
          <span><CircleCheck /> Upfront scope and estimate</span>
          <span><CircleCheck /> Re-clean promise on agreed scope</span>
        </div>
      </div>
      <div className={styles.heroVisual}>
        <Image src="/images/cleaning.jpg" alt="Professional cleaner preparing a kitchen for an end of lease inspection" fill sizes="(max-width: 900px) 100vw, 48vw" priority />
        <div className={styles.priceCard}><small>End of lease estimate</small><strong><span>from</span> $299</strong><p>One oven, one sliding door set and one small balcony included.</p></div>
        <div className={styles.inspectionCard}><ShieldCheck /><div><strong>Inspection-ready details</strong><span>Oven · tracks · grout · skirtings</span></div></div>
      </div>
    </section>

    <section className={styles.trustStrip} aria-label="Service benefits">
      <div><CalendarCheck /><span><strong>Easy booking</strong><small>Choose from tomorrow onwards</small></span></div>
      <div><KeyRound /><span><strong>Move-in or move-out</strong><small>One clear, detailed scope</small></span></div>
      <div><MapPin /><span><strong>Sydney-wide service</strong><small>Availability confirmed by postcode</small></span></div>
      <div><MessageCircle /><span><strong>Real local support</strong><small>Talk to our team when needed</small></span></div>
    </section>

    <section className={styles.introSection}>
      <div>
        <span className={styles.sectionKicker}>Made for the final inspection</span>
        <h2>Not a quick tidy. A proper end-of-lease clean.</h2>
      </div>
      <p>Property managers look beyond shiny benchtops. We work through the often-missed details—from oven racks and window tracks to shower screens, skirtings and cupboard interiors—so your property is ready to hand back.</p>
    </section>

    <section id="included" className={styles.includedSection}>
      <div className={styles.sectionHeading}>
        <div><span className={styles.sectionKicker}>Your cleaning checklist</span><h2>What’s included</h2></div>
        <p>Our standard scope covers the high-attention areas throughout an empty property. We’ll confirm any access or condition limitations before the job.</p>
      </div>
      <div className={styles.checkGrid}>
        {checklist.map(({ title, icon: Icon, items }, index) => <article className={styles.checkCard} key={title}>
          <div className={styles.checkCardTop}><span><Icon /></span><small>0{index + 1}</small></div>
          <h3>{title}</h3>
          <ul>{items.map(item => <li key={item}><Check />{item}</li>)}</ul>
        </article>)}
      </div>
      <p className={styles.scopeNote}><ShieldCheck /> Final inclusions depend on the property details and the scope confirmed with your booking.</p>
    </section>

    <section id="bond-guarantee" className="bond-section"><div className="wrap bond-grid"><div className="bond-copy"><div className="eyebrow">END OF LEASE CLEANING SYDNEY</div><h2>Hand back the keys.<br /><em>Leave the worry behind.</em></h2><p>Boxes packed. Removalists booked. Let us handle the final clean. Our bond cleaning service gets into the areas an everyday tidy-up can miss, so your property is ready for its next chapter.</p><p>From oven grease and shower screens to window tracks and skirting boards, we work through a detailed checklist with your agent’s requirements in mind.</p><div className="bond-points"><span><Check />Houses, apartments & townhouses</span><span><Check />Detailed move-out cleaning</span><span><Check />Kitchen, oven & bathroom focus</span><span><Check />Final walk-through & check</span></div><Action light onClick={openQuote} /></div><aside className="guarantee-card"><span className="guarantee-icon"><ShieldCheck size={56} /></span><div className="eyebrow">THE WEDO PROMISE</div><h3>Bond-back<br />guarantee*</h3><p>If your agent flags a cleaning issue covered by your agreed checklist, we’ll return to put it right at no extra cost, subject to your booking terms.</p><div className="guarantee-steps"><span><b>01</b>Share the agent’s feedback</span><span><b>02</b>We review the agreed checklist</span><span><b>03</b>We address covered cleaning issues</span></div><small>*Applies to cleaning within the agreed scope. Bond release also depends on property condition and other tenancy obligations. Exclusions and claim terms apply.</small></aside></div></section>

    <section id="process" className={styles.processSection}>
      <div className={styles.sectionHeading}>
        <div><span className={styles.sectionKicker}>Simple from quote to keys</span><h2>How it works</h2></div>
        <button onClick={openQuote}>Start my quote <ArrowRight /></button>
      </div>
      <div className={styles.steps}>
        {[
          ["01", "Build your estimate", "Tell us the property type, rooms and any optional extras."],
          ["02", "Confirm access", "We confirm date, parking, key access and the final scope."],
          ["03", "We deep clean", "Our team works through the room-by-room inspection checklist."],
          ["04", "Ready to hand back", "Review the result, lock up and prepare for your inspection."],
        ].map(([number, title, body]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{body}</p></article>)}
      </div>
    </section>

    <section id="extras" className={styles.extrasSection}>
      <div className={styles.extrasIntro}>
        <span className={styles.sectionKicker}>Tailored to your property</span>
        <h2>Add only what you need.</h2>
        <p>Some lease conditions or property layouts need extra attention. Select these in the quote so the right time and equipment can be allowed.</p>
        <button onClick={openQuote}>Customise my estimate <ArrowRight /></button>
      </div>
      <div className={styles.extraList}>
        {extras.map(([title, text, Icon]) => <div key={title}><span><Icon /></span><div><h3>{title}</h3><p>{text}</p></div><ArrowRight /></div>)}
      </div>
    </section>

    <section className={styles.prepSection}>
      <div className={styles.prepCard}>
        <span className={styles.sectionKicker}>Before we arrive</span>
        <h2>Three small steps make a big difference.</h2>
        <ol>
          <li><span>1</span><div><strong>Empty the property</strong><p>Remove belongings and clear cupboards, drawers and the oven.</p></div></li>
          <li><span>2</span><div><strong>Keep utilities connected</strong><p>Water and electricity are needed for equipment and a proper clean.</p></div></li>
          <li><span>3</span><div><strong>Share access details</strong><p>Tell us about parking, lifts, keys, pets or building restrictions.</p></div></li>
        </ol>
      </div>
      <div className={styles.prepVisual}>
        <WashingMachine />
        <h3>Moving into a new place?</h3>
        <p>The same detailed service can be booked as a move-in clean, giving you a fresh, hygienic start before the boxes arrive.</p>
        <button onClick={openQuote}>Get a move-in quote</button>
      </div>
    </section>

    <section id="service-areas" className="sydney-section wrap"><div><div className="eyebrow">OUR CITY. YOUR NEIGHBOURHOOD.</div><h2>Sydney, we’ve got<br />your clean covered.</h2><p>From city apartments to family homes and busy workplaces.<br />A local clean, with a personal touch.</p><div className="areas">{["Sydney CBD", "Inner West", "Eastern Suburbs", "North Shore", "Northern Beaches", "Parramatta", "Ryde & Macquarie", "The Hills District", "Greater Western Sydney", "Canterbury & Bankstown", "Bayside", "Sutherland Shire"].map(area => <span key={area}><MapPin size={14} />{area}</span>)}</div></div><div className="sydney-word" aria-hidden="true"><span>Made for</span>Sydney<Sparkles className="sydney-spark" size={60} /><small>33.8688° S &nbsp; 151.2093° E</small></div></section>

    <section id="faq" className={styles.faqSection}>
      <div className={styles.faqIntro}><span className={styles.sectionKicker}>Good to know</span><h2>End-of-lease cleaning FAQs</h2><p>Quick answers before you book. For property-specific questions, call our Sydney team.</p><a href="tel:+61401356937"><Phone /> 0401 356 937</a></div>
      <div className={styles.faqList}>{faqs.map(([question, answer]) => <details key={question}><summary>{question}<ChevronDown /></summary><p>{answer}</p></details>)}</div>
    </section>

    <section className={styles.finalCta}>
      <div><span><Clock3 /> Takes about 30 seconds</span><h2>Make the move.<br />We’ll handle the clean.</h2><p>Build your estimate now and choose a preferred date from tomorrow onwards.</p></div>
      <Action light onClick={openQuote} />
    </section>

    <footer className="wrap"><div className="footer-top"><Logo /><p>We do clean. You do life.</p><span><MapPin size={15} />Sydney, Australia</span></div><div className="footer-columns"><div><h3>A fresh start, every time.</h3><p>Home, end of lease and commercial cleaning.<br />Locally based. Thoughtfully done.</p></div><div><h4>OUR SERVICES</h4><Link href="/endofleaseclean">End of lease cleaning</Link><Link href="/officecleaning">Office & commercial</Link>{["Home & regular cleaning", "Deep cleaning", "Carpet & upholstery"].map(item => <button key={item} aria-disabled="true">{item}</button>)}</div><div><h4>WEDO CLEANING</h4>{["Why choose WeDo", "Bond-back guarantee", "Cleaning checklist", "Sydney service areas", "Get a free quote"].map(item => <button key={item} aria-disabled="true">{item}</button>)}</div></div><div className="footer-bottom"><span>© {new Date().getFullYear()} WeDo Cleaning Services.</span><div><button aria-disabled="true">Privacy policy</button><button aria-disabled="true">Terms of service</button></div></div></footer>
  </main><QuoteModal open={quoteOpen} onClose={() => setQuoteOpen(false)} /></>;
}

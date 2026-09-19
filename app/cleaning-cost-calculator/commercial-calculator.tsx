"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, Building2, Check, ChevronDown, Dumbbell, Factory, GraduationCap, HeartPulse, MapPin, Menu, Minus, Phone, Plus, ShieldCheck, Sparkles, Store, UserRound, Utensils, Warehouse, Wine, X } from "lucide-react";
import { ServiceMenu } from "../../components/service-menu";
import styles from "./page.module.css";

const premises = [
  { id: "office", name: "Office", note: "Reception, desks, meeting rooms, kitchenettes and restrooms", icon: Building2, low: 2.2, high: 3.5 },
  { id: "restaurant", name: "Restaurant / café", note: "Dining floor, front of house, restrooms and back-of-house floors", icon: Utensils, low: 2.8, high: 4.5 },
  { id: "gym", name: "Gym / fitness studio", note: "Equipment, mats, change rooms, showers and floors", icon: Dumbbell, low: 2, high: 3.2 },
  { id: "bar", name: "Bar / pub", note: "Bar tops, floors, tables, restrooms and glass", icon: Wine, low: 2.6, high: 4.2 },
  { id: "retail", name: "Retail store", note: "Shop floor, fitting rooms, glass and back room", icon: Store, low: 2, high: 3.2 },
  { id: "medical", name: "Medical / clinic", note: "Waiting rooms, treatment rooms and restrooms", icon: HeartPulse, low: 3, high: 4.8 },
  { id: "childcare", name: "Childcare / school", note: "Learning rooms, kitchens, bathrooms and high-touch areas", icon: GraduationCap, low: 2.2, high: 3.6 },
  { id: "warehouse", name: "Warehouse / industrial", note: "Offices, amenities and lunch rooms", icon: Factory, low: 1.2, high: 2.2 },
  { id: "strata", name: "Strata / common areas", note: "Lobbies, lifts, stairwells, corridors and bin rooms", icon: Warehouse, low: 1.4, high: 2.4 },
];

const frequencies = [
  { value: "monthly", label: "Once a month", visits: 1, discount: 0 },
  { value: "fortnightly", label: "Fortnightly", visits: 2.17, discount: 0 },
  { value: "weekly", label: "Weekly", visits: 4.3, discount: 0 },
  { value: "twice", label: "Twice a week", visits: 8.7, discount: .05 },
  { value: "three", label: "Three times a week", visits: 13, discount: .08 },
  { value: "daily", label: "Daily, Monday–Friday", visits: 21.7, discount: .12 },
] as const;

const times = [
  { value: "early", label: "Early morning · 5–8am", adjustment: -.1 },
  { value: "evening", label: "After hours · 6–10pm", adjustment: 0 },
  { value: "day", label: "During business hours", adjustment: .1 },
  { value: "overnight", label: "Overnight", adjustment: .05 },
] as const;

const addOns = [
  { id: "glass", name: "Interior windows & glass", note: "Partitions, doors and internal glass", price: 45, unit: "visit" },
  { id: "consumables", name: "Restroom consumables restock", note: "Paper, soap and sanitiser from onsite supply", price: 25, unit: "visit" },
  { id: "kitchen", name: "Kitchen deep clean", note: "Appliances, splashbacks and built-up residue", price: 180, unit: "once" },
  { id: "fridge", name: "Fridge & appliance clean", note: "Staff fridges, microwaves and dishwashers", price: 40, unit: "once" },
  { id: "initial", name: "Initial deep clean", note: "A thorough first visit before regular service", price: 350, unit: "once" },
] as const;

const formatMoney = (value: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(value);

function Logo() { return <Link className="logo brand-logo-lockup" href="/#home" aria-label="WeDo Cleaning Services home"><Image src="/wedo-mark.png" width={544} height={544} alt="" /><span className="logo-wordmark"><strong>We<em>Do</em></strong><small>CLEANING SERVICES</small></span></Link>; }

export function CommercialCalculator() {
  const [menu, setMenu] = useState(false);
  const [premiseId, setPremiseId] = useState("office");
  const [area, setArea] = useState(150);
  const [frequency, setFrequency] = useState("weekly");
  const [time, setTime] = useState("evening");
  const [selectedExtras, setSelectedExtras] = useState<string[]>([]);
  const [panes, setPanes] = useState(0);
  const [carpet, setCarpet] = useState(false);
  const [floor, setFloor] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const estimate = useMemo(() => {
    const premise = premises.find(item => item.id === premiseId)!;
    const frequencyItem = frequencies.find(item => item.value === frequency)!;
    const timeItem = times.find(item => item.value === time)!;
    const multiplier = (1 - frequencyItem.discount) * (1 + timeItem.adjustment);
    const recurringExtras = selectedExtras.filter(id => addOns.find(item => item.id === id)?.unit === "visit").reduce((sum, id) => sum + (addOns.find(item => item.id === id)?.price || 0), 0);
    const oneOff = selectedExtras.filter(id => addOns.find(item => item.id === id)?.unit === "once").reduce((sum, id) => sum + (addOns.find(item => item.id === id)?.price || 0), 0) + panes * 6 + (carpet ? area * 3.5 : 0) + (floor ? area * 2.8 : 0);
    const lowVisit = area * premise.low * multiplier + recurringExtras;
    const highVisit = area * premise.high * multiplier + recurringExtras;
    return { lowVisit, highVisit, lowMonth: lowVisit * frequencyItem.visits, highMonth: highVisit * frequencyItem.visits, oneOff };
  }, [premiseId, area, frequency, time, selectedExtras, panes, carpet, floor]);

  const toggleExtra = (id: string) => setSelectedExtras(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);

  return <main className={styles.page}>
    <div className="announcement"><span><MapPin size={13} /> Sydney locals. A cleaner kind of care.</span><span className="announcement-right">Your space. Our specialty.</span></div>
    <div className="site-navigation"><header className="wrap header"><Logo /><nav aria-label="Main navigation"><Link href="/">Home</Link><ServiceMenu /><Link href="/officecleaning">Office cleaning</Link><a href="#rates">Rate guide</a><a href="#proposal">Proposal</a></nav><div className="nav-utilities"><a href="tel:+61401356937" className="nav-phone" aria-label="Call WeDo on 0401 356 937"><span className="phone-symbol"><Phone size={19} /></span><span><small>LET’S TALK CLEAN</small><strong>0401 356 937</strong></span></a><span className="nav-divider" /><button type="button" className="nav-login" aria-label="Login" aria-disabled="true"><UserRound size={21} /></button></div><button type="button" className="menu-toggle" aria-label={menu ? "Close navigation" : "Open navigation"} aria-expanded={menu} aria-controls="calculator-mobile-navigation" onClick={() => setMenu(!menu)}>{menu ? <X /> : <Menu />}</button></header>{menu && <nav id="calculator-mobile-navigation" className="mobile-menu" aria-label="Mobile navigation"><Link href="/" onClick={() => setMenu(false)}>Home</Link><ServiceMenu onNavigate={() => setMenu(false)} /><Link href="/officecleaning" onClick={() => setMenu(false)}>Office cleaning</Link><a href="#rates" onClick={() => setMenu(false)}>Rate guide</a><a href="#proposal" onClick={() => setMenu(false)}>Proposal</a></nav>}</div>

    <section className={styles.hero}><span><Sparkles /> Commercial pricing · Sydney</span><h1>Commercial cleaning<br /><em>cost calculator.</em></h1><p>Choose your premises, floor area and preferred schedule to see an estimated cost per visit and per month—before speaking with anyone.</p><div><span><Check /> Instant estimate</span><span><Check /> Schedules from monthly to daily</span><span><Check /> GST-inclusive guide</span></div></section>

    <section className={styles.calculator}>
      <div className={styles.builder}>
        <div className={styles.stepTitle}><b>01</b><div><span>What are we cleaning?</span><small>Select the closest match for your premises</small></div></div>
        <div className={styles.premiseGrid}>{premises.map(({ id, name, note, icon: Icon }) => <button type="button" key={id} aria-pressed={premiseId === id} className={premiseId === id ? styles.selected : ""} onClick={() => setPremiseId(id)}><Icon /><span><strong>{name}</strong><small>{note}</small></span><i>{premiseId === id && <Check />}</i></button>)}</div>

        <div className={styles.twoColumns}>
          <div><div className={styles.stepTitle}><b>02</b><div><span>How big is the space?</span><small>An approximate floor area is fine</small></div></div><label className={styles.areaField}><input type="number" min="20" value={area} onChange={event => setArea(Math.max(20, Number(event.target.value)))} /><span>m²</span></label></div>
          <div><div className={styles.stepTitle}><b>03</b><div><span>How often, and when?</span><small>More frequent visits cost less per visit</small></div></div><label>Cleaning frequency<div className={styles.select}><select value={frequency} onChange={event => setFrequency(event.target.value)}>{frequencies.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}</select><ChevronDown /></div></label><label>Preferred cleaning time<div className={styles.select}><select value={time} onChange={event => setTime(event.target.value)}>{times.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}</select><ChevronDown /></div></label></div>
        </div>

        <div className={styles.stepTitle}><b>04</b><div><span>Any add-ons?</span><small>Optional services can be added now or after the walkthrough</small></div></div>
        <div className={styles.addOns}>{addOns.map(item => <button type="button" key={item.id} aria-pressed={selectedExtras.includes(item.id)} className={selectedExtras.includes(item.id) ? styles.selectedExtra : ""} onClick={() => toggleExtra(item.id)}><span className={styles.checkbox}>{selectedExtras.includes(item.id) && <Check />}</span><span><strong>{item.name}</strong><small>{item.note}</small></span><em>+{formatMoney(item.price)} {item.unit === "visit" ? "/ visit" : "one-off"}</em></button>)}
          <div className={`${styles.quantityExtra} ${panes > 0 ? styles.selectedExtra : ""}`}><span className={styles.checkbox}>{panes > 0 && <Check />}</span><span><strong>Exterior windows</strong><small>Ground-floor exterior glass, inside and out</small></span><em>+$6 / pane</em><div><button type="button" aria-label="Remove one exterior window pane" onClick={() => setPanes(Math.max(0, panes - 1))} disabled={panes === 0}><Minus /></button><b aria-live="polite">{panes}</b><button type="button" aria-label="Add one exterior window pane" onClick={() => setPanes(panes + 1)}><Plus /></button></div></div>
          <button type="button" aria-pressed={carpet} className={carpet ? styles.selectedExtra : ""} onClick={() => setCarpet(!carpet)}><span className={styles.checkbox}>{carpet && <Check />}</span><span><strong>Carpet steam clean</strong><small>Hot-water extraction across the carpeted area</small></span><em>+$3.50 / m²</em></button>
          <button type="button" aria-pressed={floor} className={floor ? styles.selectedExtra : ""} onClick={() => setFloor(!floor)}><span className={styles.checkbox}>{floor && <Check />}</span><span><strong>Hard-floor scrub & polish</strong><small>Machine scrub, seal or burnish</small></span><em>+$2.80 / m²</em></button>
        </div>
      </div>

      <aside className={styles.estimate}><div className={styles.estimateHeader}><ShieldCheck /><span><small>Your estimate</small><strong>GST included</strong></span></div><div className={styles.amount}><span><small>Per visit</small><strong>{formatMoney(estimate.lowVisit)}–{formatMoney(estimate.highVisit)}</strong></span><span><small>Per month</small><strong>{formatMoney(estimate.lowMonth)}–{formatMoney(estimate.highMonth)}</strong></span></div><div className={styles.oneOff}><span>One-off extras</span><strong>{formatMoney(estimate.oneOff)}</strong></div><p>This is a guide based on typical premises. We confirm a fixed price after a quick walkthrough.</p><a href="#proposal">Request my written proposal <ArrowRight /></a><ul><li><Check />Early morning saves 10%</li><li><Check />12-month agreement can save 15%</li><li><Check />More visits reduce the per-visit rate</li></ul></aside>
    </section>

    <section className={styles.savings}><div><span>Save on regular cleaning</span><h2>A schedule can work harder for your budget.</h2></div><div>{[["15%", "12-month agreement", "Save against month-to-month pricing."], ["10%", "Early morning", "Our best rate between 5am and 8am."], ["5%", "Bundled services", "Ask about bundled windows, carpets or floors."]].map(([value, title, text]) => <article key={title}><strong>{value}</strong><h3>{title}</h3><p>{text}</p></article>)}</div></section>

    <section id="rates" className={styles.rates}><div className={styles.sectionHeading}><span>Rate guide</span><h2>Typical Sydney commercial cleaning rates</h2><p>Indicative price per square metre, per visit. Final pricing depends on layout, foot traffic, access and scope.</p></div><div className={styles.rateGrid}>{premises.map(({ name, icon: Icon, low, high }) => <article key={name}><Icon /><h3>{name}</h3><strong>${low.toFixed(2)}–${high.toFixed(2)}<small>/m² per visit</small></strong></article>)}</div></section>

    <section id="proposal" className={styles.proposal}><div className={styles.proposalIntro}><span>Regular service</span><h2>Request your written cleaning proposal.</h2><p>Share your preferred schedule and workplace details. We’ll arrange a walkthrough before confirming the fixed price.</p><div><Check /> Tailored checklist</div><div><Check /> Clear per-visit and monthly pricing</div><div><Check /> Flexible schedule options</div></div><form onSubmit={event => { event.preventDefault(); setSubmitted(true); }}><div className={styles.formGrid}><label>Business name *<input name="businessName" required autoComplete="organization" placeholder="e.g. Harbour View Café" /></label><label>Your name *<input name="contactName" required autoComplete="name" placeholder="e.g. Sam Taylor" /></label><label>Phone *<input name="phone" required type="tel" autoComplete="tel" placeholder="e.g. 0412 345 678" /></label><label>Work email *<input name="email" required type="email" autoComplete="email" placeholder="you@business.com.au" /></label><label>Type of premises *<select name="premise" value={premiseId} onChange={event => setPremiseId(event.target.value)}>{premises.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Floor area<input name="area" type="number" min="20" value={area} onChange={event => setArea(Math.max(20, Number(event.target.value)))} /></label><label>How often *<select name="frequency" value={frequency} onChange={event => setFrequency(event.target.value)}>{frequencies.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label>Preferred time<select name="preferredTime" value={time} onChange={event => setTime(event.target.value)}>{times.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label className={styles.full}>Anything we should know?<textarea name="notes" placeholder="Access, security, parking, facilities or special requirements…" /></label></div><label className={styles.terms}><input name="terms" type="checkbox" required /> I agree to the Terms & Conditions.</label><button type="submit">Preview my proposal request <ArrowRight /></button><p className={styles.formStatus} aria-live="polite">{submitted ? "Thanks — your details are ready. Live submissions will be enabled when the backend is connected." : "Static preview for now. No information will be sent or stored."}</p></form></section>

    <section className={styles.faq}><div><span>Good to know</span><h2>Commercial cleaning questions</h2></div><div>{[["How accurate is the estimate?", "It is a pricing band based on typical premises. A busy venue and a quiet office of the same size require different effort, so a walkthrough confirms the fixed price."], ["Do I need a contract?", "Month-to-month service can be discussed. Longer agreements may qualify for the savings shown above."], ["Can cleaning happen outside trading hours?", "Yes. Choose early morning, after-hours, daytime or overnight in the calculator to see how timing affects the estimate."], ["What is included in a regular clean?", "Typical scopes cover floors, accessible surfaces, touch points, bins, kitchens, restrooms and spot cleaning of internal glass. Specialist work is quoted separately."], ["Why does premises type affect the rate?", "Hygiene standards, foot traffic, facilities, equipment and the level of detail vary significantly between an office, clinic, restaurant and warehouse."]].map(([question, answer]) => <details key={question}><summary>{question}<Plus /></summary><p>{answer}</p></details>)}</div></section>

    <footer className="wrap"><div className="footer-top"><Logo /><p>We do clean. You do business.</p><span><MapPin size={15} />Sydney, Australia</span></div><div className="footer-columns"><div><h3>A fresh workplace, every visit.</h3><p>Office, end of lease and home cleaning.<br />Locally based. Thoughtfully done.</p></div><div><h4>OUR SERVICES</h4><Link href="/officecleaning">Office & commercial</Link><Link href="/endofleaseclean">End of lease cleaning</Link></div><div><h4>WEDO CLEANING</h4><Link href="/#service-areas">Sydney service areas</Link><a href="#proposal">Request a proposal</a></div></div><div className="footer-bottom"><span>© {new Date().getFullYear()} WeDo Cleaning Services.</span></div></footer>
  </main>;
}

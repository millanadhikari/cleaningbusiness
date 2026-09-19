"use client";

import { useEffect, useMemo, useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import {
  ArrowLeft,
  ArrowRight,
  Bath,
  BedDouble,
  Blinds,
  CalendarDays,
  Check,
  ChevronDown,
  CookingPot,
  DoorOpen,
  Fan,
  Fence,
  House,
  MapPin,
  Minus,
  Plus,
  Refrigerator,
  Sparkles,
  SprayCan,
  Warehouse,
  WashingMachine,
  X,
} from "lucide-react";
import styles from "./quote-modal.module.css";

type QuoteModalProps = { open: boolean; onClose: () => void; defaultService?: string };
type Extra = { id: string; name: string; note: string; price: number; icon: typeof Sparkles };

const extraGroups: { label: string; items: Extra[] }[] = [
  { label: "Carpet & upholstery", items: [
    { id: "carpet", name: "Carpet steam", note: "Professional carpet steam cleaning", price: 45, icon: SprayCan },
    { id: "upholstery", name: "Upholstery refresh", note: "Sofa or armchair fabric refresh", price: 55, icon: House },
  ]},
  { label: "Kitchen & appliances", items: [
    { id: "microwave", name: "Microwave interior", note: "Inside racks, turntable and door glass", price: 25, icon: CookingPot },
    { id: "fridge", name: "Fridge interior", note: "Must be empty and switched off", price: 40, icon: Refrigerator },
  ]},
  { label: "Glass & windows", items: [
    { id: "windows", name: "Windows outside", note: "Ground-floor exterior glass we can reach", price: 35, icon: DoorOpen },
    { id: "blinds", name: "Window blinds", note: "Venetian or roller blind detail clean", price: 18, icon: Blinds },
  ]},
  { label: "Walls & outdoor", items: [
    { id: "walls", name: "Spot clean interior walls", note: "Marks and scuffs on accessible walls", price: 35, icon: Fan },
    { id: "patio", name: "Large balcony / deck / patio", note: "Sweep, mop and wipe outdoor surfaces", price: 45, icon: Fence },
    { id: "garage", name: "Garage", note: "Sweep and tidy an empty garage", price: 35, icon: Warehouse },
  ]},
];

const featured: Extra[] = [
  { id: "oven", name: "Oven", note: "Interior, racks, trays, glass and filters", price: 35, icon: CookingPot },
  { id: "doors", name: "Sliding glass doors", note: "Interior glass, edges, glass door tracks", price: 25, icon: DoorOpen },
  { id: "balcony", name: "Small balcony / deck / patio", note: "Under 10m²: sweep, mop, rails and glass", price: 30, icon: Fence },
];

function Quantity({ value, setValue, min = 0 }: { value: number; setValue: (n: number) => void; min?: number }) {
  return <div className={styles.quantity}>
    <button type="button" onClick={() => setValue(Math.max(min, value - 1))} disabled={value <= min} aria-label="Decrease quantity"><Minus /></button>
    <span>{value}</span>
    <button type="button" onClick={() => setValue(value + 1)} aria-label="Increase quantity"><Plus /></button>
  </div>;
}

export function QuoteModal({ open, onClose, defaultService = "End of Lease Cleaning" }: QuoteModalProps) {
  const [step, setStep] = useState(1);
  const [service, setService] = useState(defaultService);
  const [property, setProperty] = useState("Single storey");
  const [bedrooms, setBedrooms] = useState(1);
  const [bathrooms, setBathrooms] = useState(1);
  const [extras, setExtras] = useState<Record<string, number>>({ oven: 1, doors: 1, balcony: 1 });
  const [date, setDate] = useState(() => format(addDays(new Date(), 1), "yyyy-MM-dd"));
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [complete, setComplete] = useState(false);

  const upcomingDates = useMemo(() => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    return Array.from({ length: 14 }, (_, index) => {
      const value = addDays(today, index + 1);
      return { value: format(value, "yyyy-MM-dd"), weekday: format(value, "EEE"), day: format(value, "d"), month: format(value, "MMM") };
    });
  }, []);
  const tomorrow = upcomingDates[0]?.value;
  const formattedDate = date ? format(parseISO(date), "EEE d MMM yyyy") : "Choose a date";

  const price = useMemo(() => {
    const includedExtrasTotal = featured.reduce((total, item) => total + Math.max(0, (extras[item.id] ?? 1) - 1) * item.price, 0);
    const optionalExtrasTotal = extraGroups.flatMap(group => group.items)
      .reduce((total, item) => total + (extras[item.id] || 0) * item.price, 0);
    const extrasTotal = includedExtrasTotal + optionalExtrasTotal;
    return 299 + Math.max(0, bedrooms - 1) * 55 + Math.max(0, bathrooms - 1) * 45 + extrasTotal;
  }, [bedrooms, bathrooms, extras]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", closeOnEscape);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", closeOnEscape); };
  }, [open, onClose]);

  if (!open) return null;

  const selectedExtras = [...featured, ...extraGroups.flatMap(group => group.items)]
    .filter(item => (extras[item.id] || 0) > 0)
    .map(item => `${item.name}${(extras[item.id] || 0) > 1 ? ` × ${extras[item.id]}` : ""}`);
  const setExtra = (id: string, value: number) => setExtras(current => ({ ...current, [id]: value }));

  return <div className={styles.backdrop} onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="quote-title">
      <header className={styles.header}>
        <div><span className={styles.spark}><Sparkles /></span><div><strong id="quote-title">Your instant estimate</strong><small>Tailored to your space</small></div></div>
        <div className={styles.headerActions}><span className={styles.time}><span />Takes about 30 seconds</span><button type="button" autoFocus onClick={onClose} aria-label="Close quote"><X /></button></div>
      </header>

      {!complete ? <>
        <div className={styles.progress} aria-label={`Step ${step} of 3`}>
          {["Rooms", "Extras", "Book"].map((label, index) => { const number = index + 1; const done = number < step; const active = number === step; return <div className={`${styles.progressStep} ${active ? styles.active : ""} ${done ? styles.done : ""}`} key={label}>
            <span>{done ? <Check /> : number}</span><strong>{label}</strong><small>{active ? `Step ${number} of 3` : done ? "Complete" : ""}</small>
          </div>; })}
        </div>

        <div className={styles.content}>
          {step === 1 && <div className={styles.stepPanel}>
            <div className={styles.intro}><span>01</span><div><h2>Let’s start with your space</h2><p>A few quick details gives us a more accurate estimate.</p></div></div>
            <div className={styles.sectionLabel}>What do you need?</div>
            <label className={styles.field}><span>Service <small>Choose one</small></span><div className={styles.selectWrap}><select value={service} onChange={event => setService(event.target.value)}><option>End of Lease Cleaning</option><option>Home Cleaning</option><option>Commercial Cleaning</option></select><ChevronDown /></div></label>
            <div className={styles.sectionLabel}>Your place</div>
            <label className={styles.field}><span>Property type <small>Choose one</small></span><div className={styles.selectWrap}><select value={property} onChange={event => setProperty(event.target.value)}><option>Single storey</option><option>Double storey</option><option>Apartment</option><option>Townhouse</option></select><ChevronDown /></div></label>
            <div className={styles.roomGrid}>
              <div className={styles.room}><span className={styles.roomIcon}><BedDouble /></span><div><strong>Bedrooms</strong><small>Sleeping rooms</small></div><Quantity value={bedrooms} setValue={setBedrooms} min={1} /></div>
              <div className={styles.room}><span className={styles.roomIcon}><Bath /></span><div><strong>Bathrooms</strong><small>Including ensuites</small></div><Quantity value={bathrooms} setValue={setBathrooms} min={1} /></div>
            </div>
          </div>}

          {step === 2 && <div className={styles.stepPanel}>
            <div className={styles.intro}><span>02</span><div><h2>Add the finishing touches</h2><p>Choose only what your property needs. You can leave everything else at zero.</p></div></div>
            <div className={styles.special}>
              <div className={styles.specialTop}><span>Limited offer</span><strong>End of Lease Special</strong><p>Make your move simpler with our most-requested finishing touches.</p></div>
              <div className={styles.included}><strong>One of each is included</strong><span><Check />Included in $299</span></div>
              {featured.map(item => <ExtraRow key={item.id} item={item} value={extras[item.id] ?? 1} setValue={value => setExtra(item.id, value)} featured />)}
            </div>
            <div className={styles.guarantee}><span><Check /></span><div><strong>Already in your end of lease clean</strong><p>Wardrobes · Dishwasher interior · Laundry room · Standard interior glass</p></div></div>
            {extraGroups.map(group => <div className={styles.extraGroup} key={group.label}><div className={styles.groupTitle}><span>{group.label}</span><small>Optional</small></div>{group.items.map(item => <ExtraRow key={item.id} item={item} value={extras[item.id] || 0} setValue={value => setExtra(item.id, value)} />)}</div>)}
            <details className={styles.pest}><summary>Pest control and other requests <Plus /></summary><p>Tell us what you need in the additional notes at the next step and we’ll confirm availability.</p></details>
          </div>}

          {step === 3 && <div className={styles.stepPanel}>
            <div className={styles.intro}><span>03</span><div><h2>Nearly there—let’s book it</h2><p>We’ll use these details to confirm your quote and preferred date.</p></div></div>
            <p className={styles.required}>* Required</p>
            <div className={styles.formGrid}>
              <label className={`${styles.field} ${styles.full}`}><span>Your name *</span><input autoFocus required value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Sam" /></label>
              <label className={styles.field}><span>Phone number *</span><input type="tel" required value={phone} onChange={event => setPhone(event.target.value)} placeholder="e.g. 0412 345 678" /></label>
              <label className={styles.field}><span>Email <small>(optional)</small></span><input type="email" placeholder="you@example.com" /></label>
              <label className={`${styles.field} ${styles.address}`}><span>Street address <small>(optional)</small></span><input placeholder="12 Example Street" /></label>
              <button type="button" className={styles.location}><MapPin />Use my location</button>
              <label className={styles.field}><span>Suburb <small>(optional)</small></span><input placeholder="e.g. Abbotsbury" /></label>
              <label className={styles.field}><span>Postcode <small>(optional)</small></span><input inputMode="numeric" placeholder="e.g. 2150" /></label>
            </div>
            <div className={styles.dateLabel}><span><CalendarDays />Pick a date</span><small>From tomorrow onwards</small></div>
            <div className={styles.dates} aria-label="Available dates for the next two weeks">{upcomingDates.map(item => <button type="button" className={date === item.value ? styles.selectedDate : ""} onClick={() => setDate(item.value)} key={item.value} aria-label={format(parseISO(item.value), "EEEE d MMMM yyyy")}><small>{item.weekday}</small><strong>{item.day}</strong><span>{item.month}</span></button>)}</div>
            <label className={styles.calendarPicker}><span><CalendarDays /><span><strong>Need a later date?</strong><small>Select any future date from the calendar</small></span></span><input type="date" min={tomorrow} value={date} onChange={event => event.target.value && setDate(event.target.value)} aria-label="Choose a future date" /></label>
            <label className={styles.field}><span>Additional notes <small>(optional)</small></span><textarea placeholder="Pets, parking, preferred time, access details, or anything else we should know…" /></label>
            <label className={styles.terms}><input type="checkbox" checked={agreed} onChange={event => setAgreed(event.target.checked)} /><span>I have read and agree to the <u>Terms & Conditions</u>.</span></label>
          </div>}

          <aside className={styles.summary}>
            <div className={styles.summaryHeading}><span className={styles.summaryIcon}><WashingMachine /></span><div><strong>Booking summary</strong><small>Updates as you build your quote</small></div></div>
            <dl><div><dt>Service</dt><dd>{service}</dd></div><div><dt>Property</dt><dd>{property}</dd></div><div><dt>Bedrooms</dt><dd>{bedrooms}</dd></div><div><dt>Bathrooms</dt><dd>{bathrooms}</dd></div><div><dt>Extras</dt><dd>{selectedExtras.length ? selectedExtras.join(", ") : "None selected"}</dd></div>{step === 3 && <div><dt>Preferred date</dt><dd>{formattedDate}</dd></div>}</dl>
            <div className={styles.estimate}><span><small>Your estimate</small><em>GST included</em></span><strong><small>from</small>${price}</strong></div>
            <p>Final price is confirmed after we review your details.</p>
          </aside>
        </div>

        <footer className={styles.footer}>
          {step > 1 ? <button type="button" className={styles.back} onClick={() => setStep(step - 1)}><ArrowLeft />Back</button> : <span />}
          <button type="button" className={styles.continue} disabled={step === 3 && (!agreed || !name.trim() || !phone.trim())} onClick={() => step < 3 ? setStep(step + 1) : setComplete(true)}>{step === 3 ? "Confirm quote" : "Continue"}<ArrowRight /></button>
        </footer>
      </> : <div className={styles.success}>
        <span><Check /></span><div className={styles.eyebrow}>Quote request ready</div><h2>Thanks—your fresh start<br />is one step closer.</h2><p>Your estimate is <strong>from ${price}</strong>. This is a static preview for now; once the backend is connected, the request will be sent to the WeDo team here.</p><button type="button" onClick={onClose}>Done</button>
      </div>}
    </section>
  </div>;
}

function ExtraRow({ item, value, setValue, featured = false }: { item: Extra; value: number; setValue: (n: number) => void; featured?: boolean }) {
  const Icon = item.icon;
  return <div className={`${styles.extraRow} ${value > 0 ? styles.chosen : ""}`}>
    <span className={styles.extraIcon}><Icon /></span><div><strong>{item.name}</strong>{featured && <em>1 included</em>}<small>{item.note}{featured ? ` · +$${item.price} for each additional` : item.price > 0 ? ` · +$${item.price} each` : ""}</small></div><Quantity value={value} setValue={setValue} min={featured ? 1 : 0} />
  </div>;
}

"use client";

import Link from "next/link";
import { Building2, ChevronDown, House, KeyRound } from "lucide-react";
import { useState } from "react";

const services = [
  { label: "Home cleaning", note: "Regular and one-off home cleans", href: "/#services", icon: House },
  { label: "End of lease cleaning", note: "Bond, vacate and move-out cleans", href: "/endofleaseclean", icon: KeyRound },
  { label: "Commercial cleaning", note: "Offices and shared workplaces", href: "/officecleaning", icon: Building2 },
];

export function ServiceMenu({ onNavigate }: { onNavigate?: () => void }) {
  const [open, setOpen] = useState(false);
  const selectService = () => { setOpen(false); onNavigate?.(); };

  return <div className={`services-menu ${open ? "is-open" : ""}`}>
    <button type="button" className="services-trigger" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(value => !value)}>Services <ChevronDown size={15} /></button>
    <div className="services-dropdown" role="menu">
      <span className="services-dropdown-label">Cleaning services</span>
      {services.map(({ label, note, href, icon: Icon }) => <Link href={href} key={label} onClick={selectService} role="menuitem">
        <span className="services-dropdown-icon"><Icon size={18} /></span>
        <span><strong>{label}</strong><small>{note}</small></span>
      </Link>)}
    </div>
  </div>;
}

"use client";

import { ArrowUpRight, Menu, Phone, UserRound, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { QuoteModal } from "@/components/quote-modal";
import styles from "@/app/blog/blog.module.css";

export function BlogHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  return (
    <>
      <div className={styles.announcement}>
        <span>Sydney locals. A cleaner kind of care.</span>
        <span>Your space. Our specialty.</span>
      </div>
      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label="WeDo Cleaning Services home">
          <img src="/wedo-mark.png" alt="" width="64" height="64" />
          <span><strong>We<em>Do</em></strong><small>CLEANING SERVICES</small></span>
        </Link>
        <nav aria-label="Main navigation" className={menuOpen ? styles.navOpen : undefined}>
          <Link href="/">Home</Link>
          <Link href="/#services">Services</Link>
          <Link href="/endofleaseclean">End of lease</Link>
          <Link href="/officecleaning">Commercial</Link>
          <Link href="/blog" className={styles.active}>Blog</Link>
        </nav>
        <div className={styles.utilities}>
          <a href="tel:+61401356937" aria-label="Call WeDo on 0401 356 937"><Phone /><span><small>LET’S TALK CLEAN</small><strong>0401 356 937</strong></span></a>
          <Link href="/sign-in" aria-label="Staff login"><UserRound /></Link>
          <button type="button" className={styles.quoteButton} onClick={() => setQuoteOpen(true)}>Get a free quote <ArrowUpRight /></button>
          <button type="button" className={styles.menuButton} onClick={() => setMenuOpen((value) => !value)} aria-label={menuOpen ? "Close menu" : "Open menu"}>{menuOpen ? <X /> : <Menu />}</button>
        </div>
      </header>
      <QuoteModal open={quoteOpen} onClose={() => setQuoteOpen(false)} />
    </>
  );
}

export function BlogFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <div>
          <Link href="/" className={styles.brand} aria-label="WeDo Cleaning Services home">
            <img src="/wedo-mark.png" alt="" width="64" height="64" />
            <span><strong>We<em>Do</em></strong><small>CLEANING SERVICES</small></span>
          </Link>
          <p>We do clean. You do life.<br />Thoughtful cleaning across Sydney.</p>
        </div>
        <div><h3>Our services</h3><Link href="/endofleaseclean">End of lease cleaning</Link><Link href="/officecleaning">Office & commercial</Link><Link href="/#services">Home cleaning</Link></div>
        <div><h3>Explore</h3><Link href="/blog">Cleaning advice</Link><Link href="/">About WeDo</Link><a href="tel:+61401356937">0401 356 937</a></div>
      </div>
      <div className={styles.footerBottom}>© {new Date().getFullYear()} WeDo Cleaning Services · Sydney, Australia</div>
    </footer>
  );
}

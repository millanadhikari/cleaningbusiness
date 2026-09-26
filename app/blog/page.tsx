import type { Metadata } from "next";
import { fetchQuery } from "convex/nextjs";
import { ArrowRight, CalendarDays, Sparkles } from "lucide-react";
import Link from "next/link";
import { BlogFooter, BlogHeader } from "@/components/blog/blog-chrome";
import { api } from "@/convex/_generated/api";
import { publicConvexOptions } from "@/lib/convex-server";
import styles from "./blog.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cleaning Tips & Guides for Sydney | WeDo Cleaning Blog",
  description: "Practical cleaning guides, end of lease checklists and workplace cleaning advice from the WeDo Cleaning team in Sydney.",
  alternates: { canonical: "/blog" },
  openGraph: {
    title: "Cleaning Tips & Guides | WeDo Cleaning Sydney",
    description: "Helpful advice for cleaner homes, smoother moves and welcoming Sydney workplaces.",
    type: "website",
    url: "/blog",
  },
};

function formatDate(value?: number) {
  return value ? new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "long", year: "numeric" }).format(value) : "";
}

export default async function BlogIndexPage() {
  const posts = await fetchQuery(api.blogs.listPublished, {}, publicConvexOptions());
  const [featured, ...remaining] = posts;
  return (
    <div className={styles.page}>
      <BlogHeader />
      <main>
        <section className={styles.hero}>
          <div className={styles.heroGlow} />
          <div className={styles.heroInner}>
            <div className={styles.eyebrow}><Sparkles /> CLEANING KNOW-HOW, MADE SIMPLE</div>
            <h1>Fresh advice for<br /><em>every kind of space.</em></h1>
            <p>Practical guides for Sydney homes, workplaces and moving days—written to help you plan with confidence.</p>
          </div>
        </section>
        <section className={styles.contentWrap}>
          {featured ? (
            <Link href={`/blog/${featured.slug}`} className={styles.featuredCard}>
              <div className={styles.featuredImage}>{featured.coverImageUrl ? <img src={featured.coverImageUrl} alt={featured.coverImageAlt} /> : <span><Sparkles /></span>}</div>
              <div className={styles.featuredCopy}>
                <span className={styles.category}>Featured · {featured.category}</span>
                <h2>{featured.title}</h2>
                <p>{featured.excerpt}</p>
                <div className={styles.meta}><CalendarDays /> {formatDate(featured.publishedAt)}</div>
                <span className={styles.readLink}>Read the guide <ArrowRight /></span>
              </div>
            </Link>
          ) : (
            <div className={styles.empty}><Sparkles /><h2>Fresh advice is on the way.</h2><p>Our first cleaning guides will be published here soon.</p></div>
          )}
          {remaining.length ? (
            <div className={styles.sectionHeading}><div><span>THE LATEST FROM WEDO</span><h2>Helpful reads for a cleaner day.</h2></div><p>Clear answers, useful checklists and practical ideas from our Sydney cleaning team.</p></div>
          ) : null}
          <div className={styles.grid}>
            {remaining.map((post) => (
              <article key={post._id} className={styles.card}>
                <Link href={`/blog/${post.slug}`} className={styles.cardImage}>{post.coverImageUrl ? <img src={post.coverImageUrl} alt={post.coverImageAlt} /> : <span><Sparkles /></span>}</Link>
                <div className={styles.cardBody}>
                  <span className={styles.category}>{post.category}</span>
                  <h2><Link href={`/blog/${post.slug}`}>{post.title}</Link></h2>
                  <p>{post.excerpt}</p>
                  <div className={styles.cardFooter}><span>{formatDate(post.publishedAt)}</span><Link href={`/blog/${post.slug}`} aria-label={`Read ${post.title}`}><ArrowRight /></Link></div>
                </div>
              </article>
            ))}
          </div>
        </section>
        <section className={styles.cta}><div><span>NEED A HAND WITH THE CLEAN?</span><h2>Less to do. More time for you.</h2><p>Tell us about your space and we’ll help shape the right clean.</p></div><Link href="/#quote" className={styles.ctaLink}>Get a free quote <ArrowRight /></Link></section>
      </main>
      <BlogFooter />
    </div>
  );
}

import type { Metadata } from "next";
import { fetchQuery } from "convex/nextjs";
import { ArrowLeft, CalendarDays, Clock3 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BlogFooter, BlogHeader } from "@/components/blog/blog-chrome";
import { api } from "@/convex/_generated/api";
import { publicConvexOptions } from "@/lib/convex-server";
import styles from "../blog.module.css";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

async function getPost(slug: string) {
  return fetchQuery(api.blogs.getPublishedBySlug, { slug }, publicConvexOptions());
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return { title: "Article not found | WeDo Cleaning" };
  return {
    title: post.seoTitle,
    description: post.seoDescription,
    keywords: post.keywords,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      title: post.seoTitle,
      description: post.seoDescription,
      type: "article",
      url: `/blog/${post.slug}`,
      publishedTime: post.publishedAt ? new Date(post.publishedAt).toISOString() : undefined,
      images: post.coverImageUrl ? [{ url: post.coverImageUrl, alt: post.coverImageAlt }] : undefined,
    },
  };
}

function renderContent(content: string) {
  return content.split(/\n\s*\n/).map((block, index) => {
    const text = block.trim();
    if (text.startsWith("## ")) return <h2 key={index}>{text.slice(3)}</h2>;
    return <p key={index}>{text}</p>;
  });
}

export default async function BlogArticlePage({ params }: Props) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();
  const readingMinutes = Math.max(2, Math.ceil(post.content.split(/\s+/).length / 220));
  const published = post.publishedAt ? new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "long", year: "numeric" }).format(post.publishedAt) : "";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.seoDescription,
    image: post.coverImageUrl,
    datePublished: post.publishedAt ? new Date(post.publishedAt).toISOString() : undefined,
    dateModified: new Date(post.updatedAt).toISOString(),
    author: { "@type": "Organization", name: post.authorName },
    publisher: { "@type": "Organization", name: "WeDo Cleaning Services", url: "https://wedocleaning.com.au" },
    mainEntityOfPage: `https://wedocleaning.com.au/blog/${post.slug}`,
  };
  return (
    <div className={styles.page}>
      <BlogHeader />
      <main>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
        <article className={styles.article}>
          <Link href="/blog" className={styles.backLink}><ArrowLeft /> Back to all articles</Link>
          <header className={styles.articleHeader}>
            <span className={styles.category}>{post.category}</span>
            <h1>{post.title}</h1>
            <p>{post.excerpt}</p>
            <div className={styles.articleMeta}><span><CalendarDays />{published}</span><span><Clock3 />{readingMinutes} min read</span><span>By {post.authorName}</span></div>
          </header>
          {post.coverImageUrl ? <figure className={styles.articleImage}><img src={post.coverImageUrl} alt={post.coverImageAlt} /></figure> : null}
          <div className={styles.articleBody}>{renderContent(post.content)}</div>
          <aside className={styles.articleCta}><span>READY FOR A FRESHER SPACE?</span><h2>Leave the clean to WeDo.</h2><p>Get a tailored cleaning estimate for your Sydney home, move or workplace.</p><Link href="/">Request a quote <ArrowLeft className={styles.flipArrow} /></Link></aside>
        </article>
      </main>
      <BlogFooter />
    </div>
  );
}

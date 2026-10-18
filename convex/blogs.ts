import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireRole } from "./lib/auth";

const blogStatus = v.union(v.literal("DRAFT"), v.literal("PUBLISHED"));
const blogFields = {
  title: v.string(),
  slug: v.string(),
  excerpt: v.string(),
  content: v.string(),
  category: v.string(),
  authorName: v.string(),
  coverImageStorageId: v.optional(v.id("_storage")),
  coverImageAlt: v.string(),
  seoTitle: v.string(),
  seoDescription: v.string(),
  keywords: v.array(v.string()),
  status: blogStatus,
  publishedAt: v.optional(v.number()),
};

function cleanRequired(value: string, label: string, maxLength: number) {
  const cleaned = value.trim().replace(/\r\n/g, "\n");
  if (!cleaned) throw new Error(`${label} is required.`);
  if (cleaned.length > maxLength) throw new Error(`${label} is too long.`);
  return cleaned;
}

function normalizeSlug(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug || slug.length > 100) throw new Error("Enter a valid blog slug.");
  return slug;
}

function cleanKeywords(values: string[]) {
  return Array.from(
    new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean)),
  ).slice(0, 12);
}

async function assertUniqueSlug(
  ctx: Pick<QueryCtx, "db">,
  slug: string,
  currentId?: Id<"blogs">,
) {
  const existing = await ctx.db
    .query("blogs")
    .withIndex("by_slug", (index) => index.eq("slug", slug))
    .unique();
  if (existing && existing._id !== currentId) {
    throw new Error("A blog post already uses this slug.");
  }
}

async function assertImage(
  ctx: Pick<MutationCtx, "db">,
  storageId: Id<"_storage"> | undefined,
) {
  if (!storageId) return;
  const image = await ctx.db.system.get(storageId);
  if (!image) throw new Error("Uploaded image was not found.");
  if (image.size > 8 * 1024 * 1024) throw new Error("Image must be under 8 MB.");
  if (image.contentType && !image.contentType.startsWith("image/")) {
    throw new Error("The uploaded file must be an image.");
  }
}

async function withImageUrl<
  T extends {
    coverImageStorageId?: Id<"_storage">;
    coverImageUrl?: string;
  },
>(
  ctx: Pick<QueryCtx, "storage">,
  blog: T,
) {
  const uploadedUrl = blog.coverImageStorageId
    ? await ctx.storage.getUrl(blog.coverImageStorageId)
    : null;
  return { ...blog, coverImageUrl: uploadedUrl ?? blog.coverImageUrl };
}

export const listPublished = query({
  args: {},
  handler: async (ctx) => {
    const blogs = await ctx.db
      .query("blogs")
      .withIndex("by_status_and_published_at", (index) =>
        index.eq("status", "PUBLISHED").lte("publishedAt", Date.now()),
      )
      .order("desc")
      .collect();
    return Promise.all(blogs.map((blog) => withImageUrl(ctx, blog)));
  },
});

export const getPublishedBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const blog = await ctx.db
      .query("blogs")
      .withIndex("by_slug", (index) => index.eq("slug", slug))
      .unique();
    if (
      !blog ||
      blog.status !== "PUBLISHED" ||
      !blog.publishedAt ||
      blog.publishedAt > Date.now()
    ) {
      return null;
    }
    return withImageUrl(ctx, blog);
  },
});

export const listAdmin = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, ["SUPER_ADMIN", "ADMIN"]);
    const blogs = await ctx.db.query("blogs").withIndex("by_updated_at").order("desc").collect();
    return Promise.all(blogs.map((blog) => withImageUrl(ctx, blog)));
  },
});

export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireRole(ctx, ["SUPER_ADMIN", "ADMIN"]);
    return ctx.storage.generateUploadUrl();
  },
});

export const create = mutation({
  args: blogFields,
  returns: v.id("blogs"),
  handler: async (ctx, args) => {
    await requireRole(ctx, ["SUPER_ADMIN", "ADMIN"]);
    const slug = normalizeSlug(args.slug);
    await assertUniqueSlug(ctx, slug);
    await assertImage(ctx, args.coverImageStorageId);
    const now = Date.now();
    return ctx.db.insert("blogs", {
      ...args,
      title: cleanRequired(args.title, "Title", 140),
      slug,
      excerpt: cleanRequired(args.excerpt, "Excerpt", 320),
      content: cleanRequired(args.content, "Article content", 50_000),
      category: cleanRequired(args.category, "Category", 60),
      authorName: cleanRequired(args.authorName, "Author", 100),
      coverImageAlt: cleanRequired(args.coverImageAlt, "Image alt text", 180),
      seoTitle: cleanRequired(args.seoTitle, "SEO title", 70),
      seoDescription: cleanRequired(args.seoDescription, "SEO description", 170),
      keywords: cleanKeywords(args.keywords),
      publishedAt:
        args.status === "PUBLISHED" ? args.publishedAt ?? now : undefined,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: { blogId: v.id("blogs"), ...blogFields },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireRole(ctx, ["SUPER_ADMIN", "ADMIN"]);
    const existing = await ctx.db.get(args.blogId);
    if (!existing) throw new Error("Blog post not found.");
    const slug = normalizeSlug(args.slug);
    await assertUniqueSlug(ctx, slug, existing._id);
    await assertImage(ctx, args.coverImageStorageId);
    const { blogId, ...fields } = args;
    await ctx.db.patch(blogId, {
      ...fields,
      title: cleanRequired(args.title, "Title", 140),
      slug,
      excerpt: cleanRequired(args.excerpt, "Excerpt", 320),
      content: cleanRequired(args.content, "Article content", 50_000),
      category: cleanRequired(args.category, "Category", 60),
      authorName: cleanRequired(args.authorName, "Author", 100),
      coverImageAlt: cleanRequired(args.coverImageAlt, "Image alt text", 180),
      seoTitle: cleanRequired(args.seoTitle, "SEO title", 70),
      seoDescription: cleanRequired(args.seoDescription, "SEO description", 170),
      keywords: cleanKeywords(args.keywords),
      publishedAt:
        args.status === "PUBLISHED"
          ? args.publishedAt ?? existing.publishedAt ?? Date.now()
          : undefined,
      updatedAt: Date.now(),
    });
    if (
      existing.coverImageStorageId &&
      existing.coverImageStorageId !== args.coverImageStorageId
    ) {
      await ctx.storage.delete(existing.coverImageStorageId);
    }
    return null;
  },
});

export const setStatus = mutation({
  args: { blogId: v.id("blogs"), status: blogStatus },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireRole(ctx, ["SUPER_ADMIN", "ADMIN"]);
    const blog = await ctx.db.get(args.blogId);
    if (!blog) throw new Error("Blog post not found.");
    await ctx.db.patch(blog._id, {
      status: args.status,
      publishedAt:
        args.status === "PUBLISHED" ? blog.publishedAt ?? Date.now() : undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const seedStarterBlogs = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    if (await ctx.db.query("blogs").first()) return 0;
    const now = Date.now();
    const posts = [
      {
        title: "The Complete End of Lease Cleaning Checklist for Sydney Renters",
        slug: "end-of-lease-cleaning-checklist-sydney",
        excerpt: "A practical room-by-room checklist to help Sydney renters prepare for their final inspection and avoid last-minute cleaning stress.",
        category: "End of lease",
        coverImageUrl: "/images/cleaning.jpg",
        coverImageAlt: "Professional cleaner detailing a kitchen for an end of lease clean",
        seoTitle: "End of Lease Cleaning Checklist Sydney | WeDo",
        seoDescription: "Use this detailed Sydney end of lease cleaning checklist to prepare every room for inspection and plan a smoother move.",
        keywords: ["end of lease cleaning Sydney", "bond cleaning checklist", "moving cleaning tips"],
        content: `Moving day has enough moving parts without discovering a missed cupboard or dusty window track at the final inspection. A clear end of lease cleaning plan helps you work methodically, communicate the agreed scope with your cleaner and leave the property ready for its next chapter.

## Before cleaning begins

Remove personal belongings, empty cupboards and dispose of rubbish before detailed cleaning starts. Keep electricity and water connected so appliances, lights and wet areas can be cleaned properly. If your property manager supplied a checklist, share it early so any special requirements can be included in the quote.

## Kitchen and appliances

Start with the areas that usually take the longest. Degrease the stovetop and rangehood, clean splashbacks, wipe benches and detail the sink and taps. Empty cupboards and drawers should be cleaned inside and out. If oven cleaning is included, pay attention to racks, trays, glass and accessible filters. Fridges and dishwashers should only be included when their condition and access have been agreed beforehand.

## Bathrooms and laundry

Clean shower screens, baths, basins, mirrors, toilets and vanities. Soap residue and accessible grout often need focused attention. Wipe fittings, clean exhaust fan covers where safely reachable and finish hard floors without leaving residue. In the laundry, include the sink, taps, cabinetry and floor.

## Bedrooms and living areas

Dust reachable shelves, wardrobes, skirting boards, doors, handles and switches. Vacuum carpets carefully around edges and mop hard floors with a suitable product. Check for cobwebs and dust on accessible light fittings, fans and ledges.

## Windows and final details

Interior glass, sills and tracks can make a visible difference at inspection. Confirm whether exterior windows, blinds, balconies or carpet steam cleaning are part of the agreed service because they are often priced separately.

Complete a final walk-through using the property manager’s checklist. Good end of lease cleaning is not about rushing through every surface; it is about agreeing on the scope, allowing enough time and checking the details that matter before handing back the keys.`,
      },
      {
        title: "How Often Should You Book a House Cleaner?",
        slug: "how-often-book-house-cleaner-sydney",
        excerpt: "Weekly, fortnightly or monthly? Use your household size, schedule and cleaning priorities to choose a routine that genuinely helps.",
        category: "Home cleaning",
        coverImageUrl: "/images/home.jpg",
        coverImageAlt: "Bright and tidy Sydney living room after professional house cleaning",
        seoTitle: "How Often to Book House Cleaning in Sydney | WeDo",
        seoDescription: "Compare weekly, fortnightly and monthly house cleaning schedules and choose the right routine for your Sydney home.",
        keywords: ["house cleaning Sydney", "weekly cleaner", "fortnightly cleaning"],
        content: `There is no single cleaning schedule that suits every home. The right frequency depends on how many people use the space, whether you have pets or children, how much time you have between visits and which tasks you want a professional cleaner to handle.

## Weekly cleaning

Weekly cleaning works well for busy family homes, shared households, pet owners and anyone who wants the home to stay consistently maintained. Frequent visits prevent kitchen grease, bathroom residue and floor dirt from building up. They also make it easier to rotate detailed tasks without each appointment becoming a major reset.

## Fortnightly cleaning

Fortnightly service is a popular middle ground for smaller households and people who can manage light tidying between visits. It keeps bathrooms, kitchens and floors on a dependable cycle while remaining flexible for changing schedules. A clear priority list helps ensure the highest-use areas receive attention first.

## Monthly cleaning

Monthly cleaning can suit low-traffic homes or households that already complete regular upkeep. These appointments are often more effective when treated as a deeper reset rather than an ordinary maintenance clean. Discuss built-up areas, appliance interiors or detailed dusting before the visit so enough time can be allowed.

## One-off deep cleaning

A one-off clean is useful before guests arrive, after renovations, during seasonal changes or when everyday tasks have accumulated. Because every home starts in a different condition, describe your rooms and priorities accurately when requesting a quote.

The best schedule is one you can maintain comfortably. Begin with the areas that create the most stress, agree on a realistic scope and adjust the frequency after a few visits. A thoughtful plan should give you more usable time—not another complicated routine to manage.`,
      },
      {
        title: "A Practical Office Cleaning Checklist for Sydney Workplaces",
        slug: "office-cleaning-checklist-sydney",
        excerpt: "Create a cleaner, more welcoming workplace with a practical checklist for desks, kitchens, bathrooms and shared areas.",
        category: "Commercial cleaning",
        coverImageUrl: "/images/office.jpg",
        coverImageAlt: "Clean modern Sydney office with organised desks and shared workspace",
        seoTitle: "Office Cleaning Checklist for Sydney Businesses | WeDo",
        seoDescription: "A practical office cleaning checklist covering workstations, kitchens, bathrooms and shared areas for Sydney workplaces.",
        keywords: ["office cleaning Sydney", "commercial cleaning checklist", "workplace cleaning"],
        content: `A well-maintained workplace supports a professional first impression and makes shared spaces more comfortable for staff and visitors. The most useful office cleaning checklist reflects how the workplace is actually used rather than applying the same routine to every room.

## Reception and shared areas

Start with the spaces clients and staff see first. Dust reachable surfaces, clean glass entry doors, wipe handles and switches, straighten furniture and vacuum or mop floors. Reception desks should be cleaned around equipment and documents without disturbing important items.

## Workstations and meeting rooms

Agree in advance whether cleaners should work around personal items or whether desks will be cleared. Wipe accessible desk surfaces, meeting tables and shared touchpoints. Empty bins, vacuum traffic areas and clean internal glass where included. Electronics require suitable products and careful handling.

## Kitchen and break areas

Shared kitchens can change quickly during a working day. Clean benches, sinks, taps and splashbacks; wipe appliance exteriors; empty bins and mop floors. Fridge interiors, dishwashers and microwaves may need a separate rotation or agreed periodic detail clean.

## Bathrooms

Clean and disinfect toilets, basins, taps and high-touch points. Refill consumables when stock and responsibilities have been agreed. Mirrors, partitions and floors should be left clean and dry, with maintenance issues reported promptly.

## Choosing a schedule

Cleaning frequency depends on staff numbers, operating hours, visitor traffic and the facilities on site. A small office may need a few scheduled visits each week, while a busy workplace can require daily attention. After-hours access, alarms, parking and key procedures should all be documented.

A reliable commercial cleaning plan defines priorities, frequency and communication from the beginning. Review the checklist as the workplace changes so the service continues to fit the people using it.`,
      },
    ];
    for (let index = 0; index < posts.length; index += 1) {
      await ctx.db.insert("blogs", {
        ...posts[index],
        authorName: "WeDo Cleaning Team",
        status: "PUBLISHED",
        publishedAt: now - index * 86_400_000,
        createdAt: now,
        updatedAt: now,
      });
    }
    return posts.length;
  },
});

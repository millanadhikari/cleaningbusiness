"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import {
  ArrowUpRight,
  FileImage,
  FileText,
  LoaderCircle,
  Pencil,
  Plus,
  Search,
  X,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  AdminEmpty,
  AdminListHeader,
  AdminListPage,
  AdminLoading,
} from "./admin-list-layout";

type BlogStatus = "DRAFT" | "PUBLISHED";
type BlogRow = {
  _id: Id<"blogs">;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  category: string;
  authorName: string;
  coverImageStorageId?: Id<"_storage">;
  coverImageUrl?: string;
  coverImageAlt: string;
  seoTitle: string;
  seoDescription: string;
  keywords: string[];
  status: BlogStatus;
  publishedAt?: number;
  updatedAt: number;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function BlogEditor({
  blog,
  onClose,
  onSaved,
}: {
  blog?: BlogRow;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const createBlog = useMutation(api.blogs.create);
  const updateBlog = useMutation(api.blogs.update);
  const generateUploadUrl = useMutation(api.blogs.generateUploadUrl);
  const [title, setTitle] = useState(blog?.title ?? "");
  const [slug, setSlug] = useState(blog?.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(Boolean(blog));
  const [image, setImage] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const form = new FormData(event.currentTarget);
      let coverImageStorageId = blog?.coverImageStorageId;
      if (image) {
        const uploadUrl = await generateUploadUrl({});
        const response = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": image.type },
          body: image,
        });
        if (!response.ok) throw new Error("The image upload failed.");
        const uploaded = (await response.json()) as {
          storageId: Id<"_storage">;
        };
        coverImageStorageId = uploaded.storageId;
      }
      const publishedValue = String(form.get("publishedAt") ?? "");
      const fields = {
        title,
        slug,
        excerpt: String(form.get("excerpt") ?? ""),
        content: String(form.get("content") ?? ""),
        category: String(form.get("category") ?? ""),
        authorName: String(form.get("authorName") ?? ""),
        coverImageStorageId,
        coverImageAlt: String(form.get("coverImageAlt") ?? ""),
        seoTitle: String(form.get("seoTitle") ?? ""),
        seoDescription: String(form.get("seoDescription") ?? ""),
        keywords: String(form.get("keywords") ?? "")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        status: String(form.get("status")) as BlogStatus,
        publishedAt: publishedValue
          ? new Date(publishedValue).getTime()
          : undefined,
      };
      if (blog) await updateBlog({ blogId: blog._id, ...fields });
      else await createBlog(fields);
      onSaved(blog ? "Blog post updated." : "Blog post created.");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to save blog post.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-[24px] border border-emerald-100 bg-white p-5 shadow-sm sm:p-7">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
            {blog ? "Edit article" : "New article"}
          </p>
          <h3 className="mt-1 text-xl font-semibold text-slate-950">
            {blog ? blog.title : "Create a blog post"}
          </h3>
        </div>
        <Button variant="outline" size="icon" onClick={onClose} aria-label="Close editor">
          <X />
        </Button>
      </div>
      {error ? (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}
      <form onSubmit={submit} className="grid gap-5 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="blog-title">Title</Label>
          <Input
            id="blog-title"
            value={title}
            maxLength={140}
            required
            onChange={(event) => {
              const value = event.target.value;
              setTitle(value);
              if (!slugEdited) setSlug(slugify(value));
            }}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="blog-slug">URL slug</Label>
          <Input
            id="blog-slug"
            value={slug}
            maxLength={100}
            required
            onChange={(event) => {
              setSlugEdited(true);
              setSlug(slugify(event.target.value));
            }}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="blog-category">Category</Label>
          <Input id="blog-category" name="category" defaultValue={blog?.category} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="blog-author">Author</Label>
          <Input id="blog-author" name="authorName" defaultValue={blog?.authorName ?? "WeDo Cleaning Team"} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="blog-status">Status</Label>
          <NativeSelect id="blog-status" name="status" defaultValue={blog?.status ?? "DRAFT"} className="w-full">
            <option value="DRAFT">Draft</option>
            <option value="PUBLISHED">Published</option>
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="blog-published">Publish date</Label>
          <Input
            id="blog-published"
            name="publishedAt"
            type="datetime-local"
            defaultValue={blog?.publishedAt ? new Date(blog.publishedAt - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : ""}
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="blog-excerpt">Excerpt</Label>
          <Textarea id="blog-excerpt" name="excerpt" rows={3} maxLength={320} defaultValue={blog?.excerpt} required />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="blog-content">Article content</Label>
          <Textarea
            id="blog-content"
            name="content"
            rows={18}
            defaultValue={blog?.content}
            placeholder={"Write paragraphs normally. Start a heading with ## Heading title."}
            required
          />
          <p className="text-xs text-slate-500">Use blank lines between paragraphs and <code>##</code> for section headings.</p>
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="blog-image">Featured image</Label>
          <label className="flex cursor-pointer items-center gap-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 transition hover:border-emerald-400 hover:bg-emerald-50/40">
            <span className="grid size-12 place-items-center rounded-xl bg-white text-emerald-700 shadow-sm"><FileImage /></span>
            <span className="min-w-0">
              <strong className="block truncate text-sm text-slate-900">{image?.name ?? (blog?.coverImageUrl ? "Replace current image" : "Choose an image")}</strong>
              <small className="text-slate-500">JPG, PNG or WebP · maximum 8 MB</small>
            </span>
            <input
              id="blog-image"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                if (file && file.size > 8 * 1024 * 1024) {
                  setError("Image must be under 8 MB.");
                  return;
                }
                setImage(file);
              }}
            />
          </label>
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="blog-alt">Image alt text</Label>
          <Input id="blog-alt" name="coverImageAlt" defaultValue={blog?.coverImageAlt} maxLength={180} required />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="blog-seo-title">SEO title</Label>
          <Input id="blog-seo-title" name="seoTitle" defaultValue={blog?.seoTitle} maxLength={70} required />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="blog-seo-description">SEO description</Label>
          <Textarea id="blog-seo-description" name="seoDescription" rows={3} maxLength={170} defaultValue={blog?.seoDescription} required />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="blog-keywords">SEO keywords</Label>
          <Input id="blog-keywords" name="keywords" defaultValue={blog?.keywords.join(", ")} placeholder="house cleaning Sydney, cleaning tips" />
        </div>
        <div className="flex justify-end gap-3 md:col-span-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>
            {saving ? <LoaderCircle className="animate-spin" /> : null}
            {saving ? "Saving…" : blog ? "Save changes" : "Create post"}
          </Button>
        </div>
      </form>
    </section>
  );
}

export function BlogManager() {
  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();
  const blogs = useQuery(
    api.blogs.listAdmin,
    isAuthenticated ? {} : "skip",
  );
  const setStatus = useMutation(api.blogs.setStatus);
  const [editing, setEditing] = useState<BlogRow | "new" | null>(null);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<Id<"blogs"> | null>(null);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (blogs ?? []).filter((blog) =>
      !term || [blog.title, blog.category, blog.slug].some((value) => value.toLowerCase().includes(term)),
    );
  }, [blogs, search]);

  if (isAuthLoading || !blogs) return <AdminLoading label="Loading blog posts…" />;
  if (editing) {
    return (
      <BlogEditor
        blog={editing === "new" ? undefined : editing}
        onClose={() => setEditing(null)}
        onSaved={(text) => {
          setMessage(text);
          setEditing(null);
        }}
      />
    );
  }

  return (
    <AdminListPage>
      <AdminListHeader
        icon={FileText}
        label="Content library"
        title="Blog"
        description="Create useful cleaning guides, publish SEO content and keep article details up to date."
        count={blogs.length}
        action={<Button onClick={() => setEditing("new")}><Plus />New blog post</Button>}
      />
      {message ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</div> : null}
      <label className="flex h-12 max-w-xl items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 text-slate-500 shadow-sm">
        <Search className="size-4" />
        <input className="w-full bg-transparent text-sm text-slate-900 outline-none" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search blog posts" />
      </label>
      {filtered.length === 0 ? (
        <AdminEmpty title="No blog posts found" description="Create your first professional cleaning guide to start building the public blog." />
      ) : (
        <div className="grid gap-4">
          {filtered.map((blog) => (
            <article key={blog._id} className="grid gap-4 rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-[160px_1fr_auto] sm:items-center">
              <div className="h-28 overflow-hidden rounded-2xl bg-emerald-50">
                {blog.coverImageUrl ? <img src={blog.coverImageUrl} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-emerald-700"><FileImage /></div>}
              </div>
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge className={blog.status === "PUBLISHED" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>{blog.status === "PUBLISHED" ? "Published" : "Draft"}</Badge>
                  <span className="text-xs font-medium text-slate-500">{blog.category}</span>
                </div>
                <h3 className="text-lg font-semibold text-slate-950">{blog.title}</h3>
                <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500">{blog.excerpt}</p>
                <p className="mt-2 text-xs text-slate-400">/blog/{blog.slug}</p>
              </div>
              <div className="flex flex-wrap gap-2 sm:flex-col">
                <Button variant="outline" size="sm" onClick={() => setEditing(blog as BlogRow)}><Pencil />Edit</Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={updatingId === blog._id}
                  onClick={async () => {
                    setUpdatingId(blog._id);
                    try {
                      await setStatus({ blogId: blog._id, status: blog.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED" });
                    } finally {
                      setUpdatingId(null);
                    }
                  }}
                >
                  {updatingId === blog._id ? <LoaderCircle className="animate-spin" /> : null}
                  {blog.status === "PUBLISHED" ? "Unpublish" : "Publish"}
                </Button>
                {blog.status === "PUBLISHED" ? <Button variant="ghost" size="sm" asChild><Link href={`/blog/${blog.slug}`} target="_blank">View <ArrowUpRight /></Link></Button> : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </AdminListPage>
  );
}

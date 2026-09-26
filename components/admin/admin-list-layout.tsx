"use client";

import {
  ChevronLeft,
  ChevronRight,
  Search,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import styles from "./admin-list-layout.module.css";

export const LIST_PAGE_SIZE = 8;

export function AdminListPage({ children }: { children: ReactNode }) {
  return <div className={styles.page}>{children}</div>;
}

export function AdminListHeader({
  icon: Icon,
  title,
  description,
  count,
  label,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  count?: number;
  label: string;
  action?: ReactNode;
}) {
  return (
    <header className={styles.header}>
      <div>
        <div className={styles.eyebrow}>
          <Icon />
          {label}
        </div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div className={styles.headerAside}>
        {count !== undefined ? (
          <span className={styles.count}>
            <strong>{count}</strong> total
          </span>
        ) : null}
        {action}
      </div>
    </header>
  );
}

export function AdminListToolbar({
  search,
  onSearch,
  placeholder,
  children,
}: {
  search: string;
  onSearch: (value: string) => void;
  placeholder: string;
  children?: ReactNode;
}) {
  return (
    <div className={styles.toolbar}>
      <label className={styles.search}>
        <Search />
        <input
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
        />
      </label>
      {children ? <div className={styles.filters}>{children}</div> : null}
    </div>
  );
}

export function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className={styles.filter}>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </label>
  );
}

export function AdminTableCard({ children }: { children: ReactNode }) {
  return <section className={styles.tableCard}>{children}</section>;
}

export function AdminEmpty({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className={styles.empty}>
      <span>
        <Sparkles />
      </span>
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

export function AdminListPagination({
  page,
  total,
  pageSize = LIST_PAGE_SIZE,
  onPage,
}: {
  page: number;
  total: number;
  pageSize?: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const start = total ? (page - 1) * pageSize + 1 : 0;
  const end = Math.min(page * pageSize, total);
  return (
    <footer className={styles.pagination}>
      <span>
        Showing {start}–{end} of {total}
      </span>
      <div>
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft />
        </button>
        <span>
          Page <strong>{page}</strong> of {pages}
        </span>
        <button
          type="button"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight />
        </button>
      </div>
    </footer>
  );
}

export function AdminLoading({ label }: { label: string }) {
  return (
    <div className={styles.loading}>
      <span />
      <p>{label}</p>
    </div>
  );
}

export function PersonCell({
  name,
  detail,
}: {
  name: string;
  detail?: string;
}) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return (
    <div className={styles.person}>
      <span>{initials || "?"}</span>
      <div>
        <strong>{name}</strong>
        {detail ? <small>{detail}</small> : null}
      </div>
    </div>
  );
}

export function RowAction({ children }: { children: ReactNode }) {
  return <span className={styles.rowAction}>{children}</span>;
}

'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Bell,
  Boxes,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChartNoAxesCombined,
  ClipboardList,
  FileText,
  Gauge,
  HeartHandshake,
  Eye,
  Image,
  LogOut,
  Menu,
  MessageSquare,
  Package,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Star,
  Users,
  Video,
  Clock3,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth, usePermissions } from '@/components/providers/AuthProvider';
import { Brand } from '@/components/layout/Brand';
import { AdminStatusBadge } from '@/components/admin';
import { Modal, useToast } from '@/components/ui';
import { api, ApiError } from '@/lib/api/client';
import { sanitizeAdminNext } from '@/lib/auth/adminNavigation';
import type { AdminSearchResult, Permission } from '@/lib/api/types';

const adminNavigation: Array<{
  group: string;
  label: string;
  href: string;
  icon: typeof Gauge;
  requiredPermission: Permission;
  built: boolean;
}> = [
  {
    group: 'Overview',
    label: 'Dashboard',
    href: '/admin',
    icon: Gauge,
    requiredPermission: 'analytics:read',
    built: true,
  },
  {
    group: 'Orders',
    label: 'Orders',
    href: '/admin/orders',
    icon: ShoppingBag,
    requiredPermission: 'orders:read',
    built: true,
  },
  {
    group: 'Orders',
    label: 'Print Queue',
    href: '/admin/print-queue',
    icon: ClipboardList,
    requiredPermission: 'orders:read',
    built: true,
  },
  {
    group: 'Orders',
    label: 'Artwork Review',
    href: '/admin/artwork',
    icon: Image,
    requiredPermission: 'artwork:review',
    built: true,
  },
  {
    group: 'Products',
    label: 'Products',
    href: '/admin/products',
    icon: Package,
    requiredPermission: 'products:read',
    built: true,
  },
  {
    group: 'Products',
    label: 'Categories',
    href: '/admin/categories',
    icon: Boxes,
    requiredPermission: 'products:write',
    built: true,
  },
  {
    group: 'Content',
    label: 'About Media',
    href: '/admin/about-media',
    icon: Video,
    requiredPermission: 'media:manage',
    built: true,
  },
  {
    group: 'People',
    label: 'Customers',
    href: '/admin/customers',
    icon: Users,
    requiredPermission: 'customers:read',
    built: true,
  },
  {
    group: 'People',
    label: 'Messages',
    href: '/admin/messages',
    icon: MessageSquare,
    requiredPermission: 'messages:manage',
    built: true,
  },
  {
    group: 'People',
    label: 'Reviews',
    href: '/admin/reviews',
    icon: Star,
    requiredPermission: 'reviews:moderate',
    built: true,
  },
  {
    group: 'Insights',
    label: 'Analytics',
    href: '/admin/analytics',
    icon: ChartNoAxesCombined,
    requiredPermission: 'analytics:read',
    built: false,
  },
  {
    group: 'Content',
    label: 'FAQs',
    href: '/admin/faqs',
    icon: FileText,
    requiredPermission: 'settings:write',
    built: true,
  },
  {
    group: 'Team',
    label: 'Staff',
    href: '/admin/staff',
    icon: HeartHandshake,
    requiredPermission: 'staff:manage',
    built: true,
  },
  {
    group: 'Team',
    label: 'Audit Log',
    href: '/admin/audit',
    icon: ShieldCheck,
    requiredPermission: 'audit:read',
    built: false,
  },
  {
    group: 'Settings',
    label: 'Settings',
    href: '/admin/settings',
    icon: Settings,
    requiredPermission: 'settings:write',
    built: true,
  },
];

interface SearchItem {
  group: 'orders' | 'products' | 'customers' | 'messages';
  label: string;
  detail: string;
  href: string;
  built: boolean;
}

function getSearchItems(data: AdminSearchResult | undefined): SearchItem[] {
  if (!data) return [];
  return [
    ...(Array.isArray(data.orders)
      ? data.orders.map((item) => ({
          group: 'orders' as const,
          label: item.orderNumber,
          detail: `${item.customerName} · ${item.status.replaceAll('_', ' ')}`,
          href: `/admin/orders?q=${encodeURIComponent(item.orderNumber)}`,
          built: true,
        }))
      : []),
    ...(Array.isArray(data.products)
      ? data.products.map((item) => ({
          group: 'products' as const,
          label: item.title,
          detail: `${item.sku} · ${item.status}`,
          href: `/admin/products/${encodeURIComponent(item.id)}`,
          built: true,
        }))
      : []),
    ...(Array.isArray(data.customers)
      ? data.customers.map((item) => ({
          group: 'customers' as const,
          label: item.name,
          detail: item.email,
          href: `/admin/customers?q=${encodeURIComponent(item.email)}`,
          built: true,
        }))
      : []),
    ...(Array.isArray(data.messages)
      ? data.messages.map((item) => ({
          group: 'messages' as const,
          label: item.subject,
          detail: `${item.name} · ${item.status}`,
          href: `/admin/messages/${encodeURIComponent(item.id)}`,
          built: false,
        }))
      : []),
  ];
}

function routeTitle(pathname: string) {
  if (pathname === '/admin' || pathname === '/admin/dashboard')
    return 'Dashboard';
  if (pathname.startsWith('/admin/products')) return 'Products';
  if (pathname.startsWith('/admin/categories')) return 'Categories';
  return (
    adminNavigation.find((item) => item.href === pathname)?.label ?? 'Dashboard'
  );
}

function AdminAccessGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { user, isLoading } = useAuth();
  const redirectStarted = useRef(false);
  const [timedOut, setTimedOut] = useState(false);
  const [redirectLoop, setRedirectLoop] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) {
      if (redirectStarted.current) return;
      redirectStarted.current = true;
      const now = Date.now();
      const previous = Number(
        sessionStorage.getItem('dainty-admin-redirect-attempt') ?? '0',
      );
      if (previous && now - previous < 3_000) {
        const loopTimer = window.setTimeout(() => setRedirectLoop(true), 0);
        return () => window.clearTimeout(loopTimer);
      }
      sessionStorage.setItem('dainty-admin-redirect-attempt', String(now));
      const next = `${pathname}${window.location.search}`;
      router.replace(
        `/admin/login?next=${encodeURIComponent(sanitizeAdminNext(next))}`,
      );
    }

    if (!isLoading && user) {
      redirectStarted.current = false;
      sessionStorage.removeItem('dainty-admin-redirect-attempt');
      const resetTimer = window.setTimeout(() => {
        setRedirectLoop(false);
        setTimedOut(false);
      }, 0);
      return () => window.clearTimeout(resetTimer);
    }
    return undefined;
  }, [isLoading, pathname, router, user]);

  useEffect(() => {
    if (isLoading || !user) {
      const timeout = window.setTimeout(() => setTimedOut(true), 10_000);
      return () => window.clearTimeout(timeout);
    }
    const resetTimer = window.setTimeout(() => setTimedOut(false), 0);
    return () => window.clearTimeout(resetTimer);
  }, [isLoading, user]);

  if (redirectLoop) {
    return (
      <AdminAuthRecovery
        queryClient={queryClient}
        message="Session expired, please sign in again."
      />
    );
  }
  if (timedOut) {
    return (
      <AdminAuthRecovery
        queryClient={queryClient}
        message="We could not confirm your session. Try again or sign in again."
      />
    );
  }
  if (isLoading || !user) {
    return (
      <main
        className="admin-guard-loading"
        data-route-focus
        tabIndex={-1}
        role="status"
      >
        Checking access…
      </main>
    );
  }
  if (user.role === 'customer') {
    return (
      <main className="admin-access-denied" data-route-focus tabIndex={-1}>
        <ShieldCheck size={30} aria-hidden="true" />
        <h1>You do not have access to this area</h1>
        <p>
          This signed-in account does not have permission to manage the admin
          area.
        </p>
        <Link className="button button--secondary" href="/">
          Return to storefront
        </Link>
      </main>
    );
  }
  return children;
}

function AdminPortalGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isLoading } = useAuth();
  const redirectStarted = useRef(false);
  const [timedOut, setTimedOut] = useState(false);
  const [redirectLoop, setRedirectLoop] = useState(false);

  useEffect(() => {
    if (!isLoading && user && user.role !== 'customer') {
      const next = new URLSearchParams(window.location.search).get('next');
      const safeNext = sanitizeAdminNext(next);
      if (!redirectStarted.current) {
        redirectStarted.current = true;
        const now = Date.now();
        const previous = Number(
          sessionStorage.getItem('dainty-admin-portal-redirect-attempt') ?? '0',
        );
        if (previous && now - previous < 3_000) {
          const loopTimer = window.setTimeout(() => setRedirectLoop(true), 0);
          return () => window.clearTimeout(loopTimer);
        }
        sessionStorage.setItem(
          'dainty-admin-portal-redirect-attempt',
          String(now),
        );
        router.replace(safeNext);
      }
      return;
    }

    if (!isLoading && !user) {
      sessionStorage.removeItem('dainty-admin-portal-redirect-attempt');
      redirectStarted.current = false;
      const resetTimer = window.setTimeout(() => {
        setRedirectLoop(false);
        setTimedOut(false);
      }, 0);
      return () => window.clearTimeout(resetTimer);
    }
    return undefined;
  }, [isLoading, router, user]);

  useEffect(() => {
    if (isLoading || (user && user.role !== 'customer')) {
      const timeout = window.setTimeout(() => setTimedOut(true), 10_000);
      return () => window.clearTimeout(timeout);
    }
    const resetTimer = window.setTimeout(() => setTimedOut(false), 0);
    return () => window.clearTimeout(resetTimer);
  }, [isLoading, user]);

  if (redirectLoop) {
    return (
      <AdminAuthRecovery
        queryClient={queryClient}
        message="Session expired, please sign in again."
      />
    );
  }
  if (timedOut) {
    return (
      <AdminAuthRecovery
        queryClient={queryClient}
        message="We could not confirm your session. Try again or sign in again."
      />
    );
  }
  if (isLoading)
    return (
      <main className="admin-guard-loading" role="status">
        Checking access…
      </main>
    );
  if (user?.role === 'customer') {
    return (
      <main className="admin-access-denied" data-route-focus tabIndex={-1}>
        <ShieldCheck size={30} aria-hidden="true" />
        <h1>You do not have access to this area</h1>
        <p>Staff sign-in is available only to authorized staff accounts.</p>
      </main>
    );
  }
  if (user)
    return (
      <main className="admin-guard-loading" role="status">
        Opening admin…
      </main>
    );
  return children;
}

function AdminAuthRecovery({
  queryClient,
  message,
}: {
  queryClient: ReturnType<typeof useQueryClient>;
  message: string;
}) {
  return (
    <main className="admin-guard-loading admin-auth-recovery" role="alert">
      <h1>{message}</h1>
      <div className="button-row">
        <button
          className="button button--secondary"
          type="button"
          onClick={() => {
            void queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
          }}
        >
          Retry session check
        </button>
        <Link
          className="button button--primary"
          href="/admin/login?next=%2Fadmin"
        >
          Sign in again
        </Link>
      </div>
    </main>
  );
}

function AdminSidebar({
  onNavigate,
  mobile = false,
  expanded = false,
  onExpand,
}: {
  onNavigate?: () => void;
  mobile?: boolean;
  expanded?: boolean;
  onExpand?: () => void;
}) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { can } = usePermissions();
  const toast = useToast();
  const router = useRouter();
  const visibleItems = adminNavigation.filter(
    (item) => item.built && can(item.requiredPermission),
  );
  const groups = [...new Set(visibleItems.map((item) => item.group))];

  async function signOut() {
    try {
      await logout();
      router.replace('/admin/login');
    } catch {
      toast(
        'Sign out could not be confirmed. Check your connection and try again.',
        'error',
      );
    }
  }

  return (
    <aside
      className={`admin-sidebar${mobile ? ' admin-sidebar--mobile' : ''}${expanded ? ' admin-sidebar--expanded' : ''}`}
    >
      <div className="admin-sidebar__brand">
        <Brand />
        <span>Dainty Bloom Admin</span>
        {onExpand ? (
          <button
            className="admin-sidebar-expand"
            type="button"
            aria-label={
              expanded ? 'Collapse admin navigation' : 'Expand admin navigation'
            }
            aria-expanded={expanded}
            title={expanded ? 'Collapse navigation' : 'Expand navigation'}
            onClick={onExpand}
          >
            {expanded ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
          </button>
        ) : null}
      </div>
      <nav aria-label="Admin navigation" className="admin-sidebar__nav">
        {groups.map((group) => (
          <div className="admin-nav-group" key={group}>
            {groups.length > 1 ? <p>{group}</p> : null}
            {visibleItems
              .filter((item) => item.group === group)
              .map((item) => {
                const Icon = item.icon;
                const active =
                  pathname === item.href ||
                  (item.href === '/admin' && pathname === '/admin/dashboard') ||
                  ((item.href === '/admin/products' ||
                    item.href === '/admin/categories') &&
                    pathname.startsWith(`${item.href}/`));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`admin-nav-link${active ? ' is-active' : ''}`}
                    aria-current={active ? 'page' : undefined}
                    title={item.label}
                    onClick={onNavigate}
                  >
                    <Icon size={18} aria-hidden="true" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
          </div>
        ))}
      </nav>
      <div className="admin-sidebar__account">
        <span className="admin-user-avatar" aria-hidden="true">
          {(user?.name ?? 'A').slice(0, 1).toUpperCase()}
        </span>
        <span className="admin-user-details">
          <strong>{user?.name}</strong>
          <AdminStatusBadge status={user?.role ?? 'staff'} />
        </span>
        <button
          type="button"
          aria-label="Sign out"
          title="Sign out"
          onClick={() => void signOut()}
        >
          <LogOut size={16} aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}

function AdminGlobalSearch({
  inputRef,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [active, setActive] = useState(-1);
  const search = useQuery({
    queryKey: ['admin-search', debounced],
    queryFn: () => api.adminSearch(debounced),
    enabled: debounced.length >= 2,
    retry: false,
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebounced(query.trim());
      setActive(-1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const items = useMemo(() => getSearchItems(search.data), [search.data]);
  const grouped = useMemo(
    () =>
      (['orders', 'products', 'customers', 'messages'] as const)
        .map((group) => ({
          group,
          items: items.filter((item) => item.group === group),
        }))
        .filter((group) => group.items.length > 0),
    [items],
  );

  function goTo(item: SearchItem) {
    if (!item.built) return;
    setQuery('');
    router.push(item.href);
  }

  return (
    <div className="admin-global-search">
      <label className="visually-hidden" htmlFor="admin-command-input">
        Search admin
      </label>
      <div className="admin-command__input">
        <Search size={19} aria-hidden="true" />
        <input
          ref={inputRef}
          id="admin-command-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search orders, products, customers, messages"
          autoComplete="off"
          role="combobox"
          aria-controls="admin-command-results"
          aria-expanded={query.trim().length >= 2}
          aria-autocomplete="list"
          aria-activedescendant={
            active >= 0 ? `admin-command-option-${active}` : undefined
          }
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' && items.length) {
              event.preventDefault();
              setActive((index) => (index + 1) % items.length);
            } else if (event.key === 'ArrowUp' && items.length) {
              event.preventDefault();
              setActive((index) => (index <= 0 ? items.length - 1 : index - 1));
            } else if (event.key === 'Enter' && active >= 0) {
              event.preventDefault();
              const item = items[active];
              if (item) goTo(item);
            }
          }}
        />
      </div>
      {query.trim().length > 0 ? (
        <div
          id="admin-command-results"
          className="admin-command__results"
          role="listbox"
          aria-label="Admin search results"
          aria-live="polite"
        >
          {query.trim().length < 2 ? (
            <p>Type at least two characters to search.</p>
          ) : null}
          {query.trim().length >= 2 &&
          (search.isFetching || debounced !== query.trim()) ? (
            <p role="status">Searching…</p>
          ) : null}
          {debounced.length >= 2 &&
          debounced === query.trim() &&
          search.isError ? (
            <p role="alert">
              {search.error instanceof ApiError
                ? search.error.message
                : 'Search is unavailable right now.'}
            </p>
          ) : null}
          {debounced.length >= 2 &&
          debounced === query.trim() &&
          search.isSuccess &&
          items.length === 0 ? (
            <p>No matching records.</p>
          ) : null}
          {debounced === query.trim() && search.isSuccess
            ? grouped.map(({ group, items: groupItems }) => (
                <section key={group} role="group" aria-label={group}>
                  <h3>{group}</h3>
                  {groupItems.map((item) => {
                    const index = items.indexOf(item);
                    return (
                      <button
                        key={`${group}-${item.label}-${index}`}
                        id={`admin-command-option-${index}`}
                        className={`admin-command-result${active === index ? ' is-active' : ''}`}
                        type="button"
                        role="option"
                        aria-selected={active === index}
                        disabled={!item.built}
                        title={
                          !item.built ? 'Coming soon' : `Open ${item.label}`
                        }
                        aria-label={`${item.label}. ${item.detail}${item.built ? '' : '. Coming soon'}`}
                        onMouseEnter={() => setActive(index)}
                        onClick={() => goTo(item)}
                      >
                        <span>
                          <strong>{item.label}</strong>
                          <small>{item.detail}</small>
                        </span>
                        {!item.built ? <em>Coming soon</em> : null}
                      </button>
                    );
                  })}
                </section>
              ))
            : null}
        </div>
      ) : null}
    </div>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const toast = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [tabletExpanded, setTabletExpanded] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const notifications = useQuery({
    queryKey: ['admin-notifications'],
    queryFn: api.adminNotifications,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    retry: false,
    enabled: pathname !== '/admin/login' && Boolean(user),
  });
  const notificationItems = Array.isArray(notifications.data?.items)
    ? notifications.data.items
    : [];
  const notificationCount = notifications.data?.counts
    ? Object.values(notifications.data.counts).reduce(
        (total, count) => total + (typeof count === 'number' ? count : 0),
        0,
      )
    : 0;
  const pageTitle = routeTitle(pathname);
  useEffect(() => {
    function onShortcut(event: KeyboardEvent) {
      const target = event.target;
      const typing =
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchInputRef.current?.focus();
      } else if (
        event.key === '/' &&
        !typing &&
        !event.ctrlKey &&
        !event.metaKey
      ) {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    document.addEventListener('keydown', onShortcut);
    return () => document.removeEventListener('keydown', onShortcut);
  }, []);

  useEffect(() => {
    if (!notificationsOpen) return;
    function dismissOutside(event: PointerEvent) {
      if (!notificationsRef.current?.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    }
    function dismissOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setNotificationsOpen(false);
    }
    document.addEventListener('pointerdown', dismissOutside);
    document.addEventListener('keydown', dismissOnEscape);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside);
      document.removeEventListener('keydown', dismissOnEscape);
    };
  }, [notificationsOpen]);

  async function signOut() {
    try {
      await logout();
      router.replace('/admin/login');
    } catch {
      toast(
        'Sign out could not be confirmed. Check your connection and try again.',
        'error',
      );
    }
  }

  if (pathname === '/admin/login') {
    return <AdminPortalGate>{children}</AdminPortalGate>;
  }

  return (
    <AdminAccessGuard>
      <div
        className={`admin-app${tabletExpanded ? ' is-sidebar-expanded' : ''}`}
      >
        {tabletExpanded ? (
          <button
            type="button"
            className="admin-tablet-backdrop"
            aria-label="Close expanded navigation"
            onClick={() => setTabletExpanded(false)}
          />
        ) : null}
        <div className="admin-desktop-sidebar">
          <AdminSidebar
            expanded={tabletExpanded}
            onExpand={() => setTabletExpanded((expanded) => !expanded)}
            onNavigate={() => setTabletExpanded(false)}
          />
        </div>
        <div className="admin-main">
          <header className="admin-topbar">
            <button
              className="admin-mobile-menu"
              type="button"
              aria-label="Open admin navigation"
              title="Open navigation"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
            >
              <Menu size={20} aria-hidden="true" />
            </button>
            <div className="admin-topbar__heading">
              <h1>{pageTitle}</h1>
              <nav aria-label="Breadcrumb" className="admin-breadcrumb">
                <Link href="/admin">Admin</Link>
                <span aria-hidden="true">/</span>
                <span aria-current="page">{pageTitle}</span>
              </nav>
            </div>
            <div className="admin-topbar__actions">
              <AdminGlobalSearch inputRef={searchInputRef} />
              <div className="admin-popover-wrap" ref={notificationsRef}>
                <button
                  className="admin-topbar-icon"
                  type="button"
                  aria-label={`Notifications${notificationCount ? `, ${notificationCount} total` : ''}`}
                  aria-expanded={notificationsOpen}
                  title="Notifications"
                  onClick={() => setNotificationsOpen((open) => !open)}
                >
                  <Bell size={20} aria-hidden="true" />
                  {notificationCount > 0 ? (
                    <span className="admin-notification-count">
                      {notificationCount}
                    </span>
                  ) : null}
                </button>
                {notificationsOpen ? (
                  <div
                    className="admin-popover admin-notifications"
                    role="region"
                    aria-label="Notifications"
                  >
                    <h2>Notifications</h2>
                    {notifications.isPending ? (
                      <p role="status">Loading notifications…</p>
                    ) : null}
                    {notifications.isError ? (
                      <p role="alert">Notifications are unavailable.</p>
                    ) : null}
                    {notifications.isSuccess &&
                    notificationItems.length === 0 ? (
                      <p>No notifications to show.</p>
                    ) : null}
                    {notificationItems.map((item) => (
                      <div className="admin-notification-row" key={item.type}>
                        <span>
                          <strong>{item.label}</strong>
                          <small>{item.count} items</small>
                        </span>
                        <span
                          className={`admin-notification-state${item.count > 0 ? ' is-pending' : ' is-complete'}`}
                          role="img"
                          aria-label={item.count > 0 ? 'Pending' : 'Complete'}
                          title={item.count > 0 ? 'Pending' : 'Complete'}
                        >
                          {item.count > 0 ? (
                            <Clock3 size={18} aria-hidden="true" />
                          ) : (
                            <CheckCircle2 size={18} aria-hidden="true" />
                          )}
                        </span>
                        <Link
                          className="admin-notification-view"
                          href={item.route}
                          aria-label={`View ${item.label}`}
                          title={`View ${item.label}`}
                          onClick={() => setNotificationsOpen(false)}
                        >
                          <Eye size={18} aria-hidden="true" />
                        </Link>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="admin-popover-wrap admin-profile-wrap">
                <button
                  className="admin-profile-trigger"
                  type="button"
                  aria-expanded={profileOpen}
                  title="Profile menu"
                  onClick={() => setProfileOpen((open) => !open)}
                >
                  <span className="admin-user-avatar">
                    {(user?.name ?? 'A').slice(0, 1).toUpperCase()}
                  </span>
                  <span>{user?.name}</span>
                </button>
                {profileOpen ? (
                  <div className="admin-popover admin-profile-menu" role="menu">
                    <strong>{user?.name}</strong>
                    <AdminStatusBadge status={user?.role ?? 'staff'} />
                    <Link href="/" type="button" role="menuitem">
                      View storefront
                    </Link>
                    <button role="menuitem" onClick={() => void signOut()}>
                      Sign out
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </header>
          <main
            className="admin-content"
            id="admin-main-content"
            data-route-focus
            tabIndex={-1}
          >
            {children}
          </main>
        </div>
        <Modal
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          title="Admin navigation"
        >
          <AdminSidebar mobile onNavigate={() => setMenuOpen(false)} />
        </Modal>
      </div>
    </AdminAccessGuard>
  );
}

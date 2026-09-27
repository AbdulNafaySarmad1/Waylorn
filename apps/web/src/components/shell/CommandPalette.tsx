'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { AssetSummary } from '@waylorn/contracts';
import { ASSET_KIND_LABEL, orgPath } from '@waylorn/domain';
import { bff } from '@/lib/bff';
import { allNavItems } from '@/lib/navigation';
import { useSession } from '@/lib/session-context';
import styles from './CommandPalette.module.css';

interface Option {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  readonly href: string;
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

/**
 * Keyboard-first navigation: Ctrl/⌘+K opens a combobox over areas and assets (asset search
 * is server-side). `g` followed by a letter jumps directly to an area.
 */
export function CommandPalette() {
  const { orgSlug, orgId } = useSession();
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  const [assets, setAssets] = useState<readonly AssetSummary[]>([]);
  const [active, setActive] = useState(0);
  const listId = useId();
  const nav = useMemo(() => allNavItems(), []);

  const open = useCallback(() => {
    setQuery('');
    setAssets([]);
    setActive(0);
    dialog.current?.showModal();
  }, []);

  useEffect(() => {
    let pendingG = 0;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        open();
        return;
      }
      if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'g') {
        pendingG = Date.now();
        return;
      }
      if (Date.now() - pendingG < 1200) {
        const item = nav.find((n) => n.shortcut === e.key);
        pendingG = 0;
        if (item) router.push(orgPath(orgSlug, ...item.segment.split('/')));
      }
    };
    const onOpen = () => open();
    window.addEventListener('keydown', onKey);
    window.addEventListener('waylorn:palette', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('waylorn:palette', onOpen);
    };
  }, [nav, open, orgSlug, router]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const controller = new AbortController();
    const t = setTimeout(() => {
      void bff()
        .GET('/orgs/{orgId}/assets', { params: { path: { orgId }, query: { q, limit: 8 } }, signal: controller.signal })
        .then(({ data }) => {
          if (data) setAssets(data.items);
        })
        .catch(() => undefined);
    }, 200);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [query, orgId]);

  const options: Option[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const areas = nav
      .filter((n) => !q || `${n.label} ${n.group} ${n.keywords ?? ''}`.toLowerCase().includes(q))
      .map((n) => ({
        id: `nav-${n.segment}`,
        label: n.label,
        hint: `${n.group}${n.shortcut ? ` · g ${n.shortcut}` : ''}`,
        href: orgPath(orgSlug, ...n.segment.split('/')),
      }));
    const found = q.length >= 2
      ? assets.map((a) => ({
          id: `asset-${a.id}`,
          label: `${a.tag} — ${a.name}`,
          hint: `${ASSET_KIND_LABEL[a.kind]} · ${a.context.site.code}`,
          href: orgPath(orgSlug, 'assets', a.id),
        }))
      : [];
    return [...found, ...areas].slice(0, 30);
  }, [assets, nav, orgSlug, query]);

  const go = (o: Option | undefined) => {
    if (!o) return;
    dialog.current?.close();
    router.push(o.href);
  };

  const activeOption = options[Math.min(active, options.length - 1)];
  return (
    <dialog ref={dialog} className={styles.dialog} aria-label="Go to">
      <input
        className={styles.input}
        role="combobox"
        aria-expanded="true"
        aria-controls={listId}
        aria-activedescendant={activeOption?.id}
        aria-autocomplete="list"
        aria-label="Search areas and assets"
        placeholder="Type an area, asset tag, name or serial"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, options.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            go(activeOption);
          }
        }}
      />
      <div id={listId} role="listbox" className={styles.list} aria-label="Results">
        {options.map((o, i) => (
          // eslint-disable-next-line jsx-a11y/click-events-have-key-events -- keyboard handled by the combobox input
          <div
            key={o.id}
            id={o.id}
            role="option"
            tabIndex={-1}
            aria-selected={i === active}
            className={styles.option}
            onMouseEnter={() => setActive(i)}
            onClick={() => go(o)}
          >
            <span>{o.label}</span>
            <span className={styles.hint}>{o.hint}</span>
          </div>
        ))}
        {options.length === 0 ? <div className={styles.option}>No matches</div> : null}
      </div>
      <div className={styles.footer}>
        <span>
          <kbd>↑</kbd> <kbd>↓</kbd> select
        </span>
        <span>
          <kbd>Enter</kbd> open
        </span>
        <span>
          <kbd>Esc</kbd> close
        </span>
      </div>
    </dialog>
  );
}

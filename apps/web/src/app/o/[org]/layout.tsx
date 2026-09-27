import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { CommandPalette } from '@/components/shell/CommandPalette';
import { ContextBar } from '@/components/shell/ContextBar';
import { SideNav } from '@/components/shell/Nav';
import { SessionNotices } from '@/components/shell/SessionNotices';
import styles from '@/components/shell/Shell.module.css';
import { Banner } from '@/components/ui/States';
import { parseTheme, THEME_COOKIE } from '@/lib/cookies';
import { SessionProvider } from '@/lib/session-context';
import { RenderTimeProvider } from '@/lib/use-now';
import { requestTime } from '@/server/time';
import { orgContext } from '@/server/api';

export const dynamic = 'force-dynamic';

export default async function OrgLayout({ children, params }: { children: ReactNode; params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const ctx = await orgContext(slug);
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <RenderTimeProvider value={requestTime()}>
    <SessionProvider value={{ ...ctx.publicSession, orgId: ctx.org.id, orgSlug: ctx.org.slug, orgName: ctx.org.name }}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className={styles.shell}>
        <div className={styles.banners}>
          {ctx.fixtureData ? (
            <Banner tone="fixture">
              <strong>Development fixture data.</strong> The connected backend is <code>tools/dev-fixtures</code>. Nothing on this
              screen reflects real equipment.
            </Banner>
          ) : null}
          <SessionNotices />
        </div>
        <ContextBar
          organizations={ctx.principal.organizations}
          identityProvider={ctx.principal.identityProvider.displayName}
          roles={ctx.org.roles}
          theme={theme}
        />
        <SideNav orgSlug={ctx.org.slug} />
        <main id="main" className={styles.main} tabIndex={-1}>
          {children}
        </main>
      </div>
      <CommandPalette />
    </SessionProvider>
    </RenderTimeProvider>
  );
}

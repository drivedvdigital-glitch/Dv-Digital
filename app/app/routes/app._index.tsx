import { useState } from 'react';
import { Link, useLoaderData, useLocation, useNavigation, useSubmit } from 'react-router';
import type { ActionFunctionArgs } from 'react-router';
import { redirect } from 'react-router';

import { db } from '../lib/db.server.ts';

export async function loader() {
  const pages = await db.page.findMany({
    orderBy: { updatedAt: 'desc' },
    include: { deployments: { include: { store: true } } },
  });
  return { pages };
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const intent = form.get('intent');

  if (intent === 'create') {
    const page = await db.page.create({
      data: {
        title: 'Nova página',
        handle: `pagina-${Date.now().toString(36)}`,
        doc: JSON.stringify({
          version: 1,
          root: [{ id: 'html', type: 'html', props: { html: '<h1>Nova página</h1>' } }],
        }),
      },
    });
    const search = new URL(request.url).search;
    return redirect(`/app/pages/${page.id}${search}`);
  }

  if (intent === 'duplicate') {
    const source = await db.page.findUniqueOrThrow({ where: { id: String(form.get('id')) } });
    // Duplicating is the real creation gesture here: pages are named per
    // market (250-CO-…, 08-MX-…) and varied from an existing one.
    await db.page.create({
      data: {
        title: `${source.title} (cópia)`,
        handle: `${source.handle}-copia-${Date.now().toString(36)}`,
        doc: source.doc,
      },
    });
    return null;
  }

  if (intent === 'delete') {
    await db.page.delete({ where: { id: String(form.get('id')) } });
    return null;
  }
  return null;
}

export default function PagesList() {
  const { pages } = useLoaderData<typeof loader>();
  const search = useLocation().search;
  const submit = useSubmit();
  const busy = useNavigation().state !== 'idle';

  // Deleting asks for a second click on the same row instead of a dialog:
  // `confirm()` can be silently blocked inside the admin's iframe, and a
  // swallowed dialog would make the button simply do nothing.
  const [confirming, setConfirming] = useState<string | null>(null);

  const act = (intent: string, id?: string) => {
    const fd = new FormData();
    fd.set('intent', intent);
    if (id) fd.set('id', id);
    submit(fd, { method: 'post' });
    setConfirming(null);
  };

  return (
    <s-page heading="Páginas">
      <s-button slot="primary-action" variant="primary" disabled={busy || undefined} onClick={() => act('create')}>
        Criar página
      </s-button>

      <s-section padding="none">
        {pages.length === 0 ? (
          <s-box padding="large">
            <s-paragraph tone="subdued">
              Nenhuma página ainda. Clique em <strong>Criar página</strong> para começar.
            </s-paragraph>
          </s-box>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header>Título</s-table-header>
              <s-table-header>Handle</s-table-header>
              <s-table-header>Publicada em</s-table-header>
              <s-table-header>Atualizada</s-table-header>
              <s-table-header />
            </s-table-header-row>
            <s-table-body>
              {pages.map((page) => (
                <s-table-row key={page.id}>
                  <s-table-cell>
                    <Link to={`/app/pages/${page.id}${search}`} style={titleLink}>
                      {page.title}
                    </Link>
                  </s-table-cell>
                  <s-table-cell>
                    <s-text tone="subdued">/{page.handle}</s-text>
                  </s-table-cell>
                  <s-table-cell>
                    {page.deployments.length === 0 ? (
                      <s-badge>rascunho</s-badge>
                    ) : (
                      page.deployments.map((d) => (
                        <s-badge key={d.id} tone="success">
                          {d.store.label}
                        </s-badge>
                      ))
                    )}
                  </s-table-cell>
                  <s-table-cell>
                    <s-text tone="subdued">
                      {new Date(page.updatedAt).toLocaleString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </s-text>
                  </s-table-cell>
                  <s-table-cell>
                    {confirming === page.id ? (
                      <>
                        <s-button
                          variant="tertiary"
                          tone="critical"
                          disabled={busy || undefined}
                          onClick={() => act('delete', page.id)}
                        >
                          Confirmar exclusão
                        </s-button>
                        <s-button variant="tertiary" onClick={() => setConfirming(null)}>
                          Cancelar
                        </s-button>
                      </>
                    ) : (
                      <>
                        <s-button
                          variant="tertiary"
                          disabled={busy || undefined}
                          onClick={() => act('duplicate', page.id)}
                        >
                          Duplicar
                        </s-button>
                        <s-button
                          variant="tertiary"
                          tone="critical"
                          disabled={busy || undefined}
                          onClick={() => setConfirming(page.id)}
                        >
                          Excluir
                        </s-button>
                      </>
                    )}
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}

// react-router's Link renders a plain <a>; match it to Polaris link styling so
// it does not read as a foreign element in the middle of the table.
const titleLink: React.CSSProperties = {
  color: '#005bd3',
  textDecoration: 'none',
  fontWeight: 450,
};

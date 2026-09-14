import { Form, Link, useLoaderData, useLocation } from 'react-router';
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

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Páginas</h1>
        <Form method="post" style={{ marginLeft: 'auto' }}>
          <button name="intent" value="create" style={primaryButton}>
            Criar página
          </button>
        </Form>
      </div>

      {pages.length === 0 ? (
        <p style={{ color: '#5d6b64' }}>
          Nenhuma página ainda. Clique em <strong>Criar página</strong> para começar.
        </p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: '#5d6b64', fontSize: 12 }}>
              <th style={th}>Título</th>
              <th style={th}>Handle</th>
              <th style={th}>Publicada em</th>
              <th style={th}>Atualizada</th>
              <th style={th} />
            </tr>
          </thead>
          <tbody>
            {pages.map((page) => (
              <tr key={page.id} style={{ borderTop: '1px solid #eee' }}>
                <td style={td}>
                  <Link to={`/app/pages/${page.id}${search}`} style={{ color: '#17201c', fontWeight: 600 }}>
                    {page.title}
                  </Link>
                </td>
                <td style={{ ...td, color: '#5d6b64' }}>/{page.handle}</td>
                <td style={td}>
                  {page.deployments.length === 0 ? (
                    <span style={{ color: '#8c8c8c' }}>rascunho</span>
                  ) : (
                    page.deployments.map((d) => (
                      <span key={d.id} style={chip}>
                        {d.store.label}
                      </span>
                    ))
                  )}
                </td>
                <td style={{ ...td, color: '#5d6b64' }}>
                  {new Date(page.updatedAt).toLocaleString('pt-BR')}
                </td>
                <td style={{ ...td, textAlign: 'right' }}>
                  <Form method="post" style={{ display: 'inline' }}>
                    <input type="hidden" name="id" value={page.id} />
                    <button name="intent" value="duplicate" style={linkButton}>
                      Duplicar
                    </button>
                  </Form>
                  <Form method="post" style={{ display: 'inline' }}>
                    <input type="hidden" name="id" value={page.id} />
                    <button name="intent" value="delete" style={{ ...linkButton, color: '#b42318' }}>
                      Excluir
                    </button>
                  </Form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

const th: React.CSSProperties = { padding: '8px 10px', fontWeight: 500 };
const td: React.CSSProperties = { padding: '12px 10px', verticalAlign: 'middle' };
const primaryButton: React.CSSProperties = {
  background: '#0BE05C',
  color: '#06301b',
  border: 0,
  borderRadius: 8,
  padding: '9px 16px',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
};
const linkButton: React.CSSProperties = {
  background: 'none',
  border: 0,
  color: '#5d6b64',
  fontSize: 13,
  cursor: 'pointer',
  padding: '4px 8px',
};
const chip: React.CSSProperties = {
  display: 'inline-block',
  background: '#eafaf0',
  color: '#0a6b38',
  borderRadius: 999,
  padding: '2px 9px',
  fontSize: 12,
  marginRight: 4,
};

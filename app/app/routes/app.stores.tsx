import { Form, useActionData, useLoaderData } from 'react-router';
import type { ActionFunctionArgs } from 'react-router';

import { db } from '../lib/db.server.ts';
import { clientFor } from '../lib/shopify.server.ts';

export async function loader() {
  return { stores: await db.store.findMany({ orderBy: { createdAt: 'asc' } }) };
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const intent = String(form.get('intent'));

  if (intent === 'delete') {
    await db.store.delete({ where: { id: String(form.get('id')) } });
    return null;
  }

  const domain = String(form.get('domain') ?? '').trim().replace(/^https?:\/\//, '');
  const row = {
    domain,
    label: String(form.get('label') ?? '').trim() || domain,
    clientId: String(form.get('clientId') ?? '').trim(),
    clientSecret: String(form.get('clientSecret') ?? '').trim(),
    isProduction: form.get('isProduction') === 'on',
  };

  // Never store credentials that do not work. Proving them here means a failure
  // surfaces while the person is looking at the form, not later at publish time.
  try {
    const name = await clientFor({ ...row, id: '', createdAt: new Date() }).shopName();
    const store = await db.store.upsert({
      where: { domain: row.domain },
      create: row,
      update: row,
    });
    return { ok: true, message: `Conectado a "${name}" (${store.label}).` };
  } catch (error) {
    return {
      ok: false,
      message: `Não consegui conectar: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export default function Stores() {
  const { stores } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();

  return (
    <>
      <h1 style={{ fontSize: 22, marginTop: 0 }}>Lojas</h1>
      <p style={{ color: '#5d6b64', fontSize: 14, maxWidth: 620 }}>
        Cada loja tem credenciais próprias. É isso que permite escrever uma página uma vez e
        publicar em todas — valida na loja de teste, manda para as de produção.
      </p>

      {result ? <div style={result.ok ? bannerOk : bannerBad}>{result.message}</div> : null}

      {stores.length > 0 ? (
        <table style={{ borderCollapse: 'collapse', marginBottom: 26, fontSize: 14 }}>
          <tbody>
            {stores.map((store) => (
              <tr key={store.id} style={{ borderTop: '1px solid #eee' }}>
                <td style={{ padding: '10px 14px 10px 0', fontWeight: 600 }}>{store.label}</td>
                <td style={{ padding: '10px 14px 10px 0', color: '#5d6b64' }}>{store.domain}</td>
                <td style={{ padding: '10px 14px 10px 0' }}>
                  {store.isProduction ? (
                    <span style={prodChip}>produção</span>
                  ) : (
                    <span style={testChip}>teste</span>
                  )}
                </td>
                <td>
                  <Form method="post">
                    <input type="hidden" name="id" value={store.id} />
                    <button name="intent" value="delete" style={linkButton}>
                      Remover
                    </button>
                  </Form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      <Form method="post" style={{ maxWidth: 440, display: 'grid', gap: 10 }}>
        <h2 style={{ fontSize: 16, margin: '0 0 2px' }}>Adicionar loja</h2>
        <input name="domain" placeholder="minha-loja.myshopify.com" required style={input} />
        <input name="label" placeholder="Apelido (ex.: Colômbia)" style={input} />
        <input name="clientId" placeholder="Client ID" required style={input} />
        <input name="clientSecret" placeholder="Client secret (shpss_…)" required style={input} />
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
          <input type="checkbox" name="isProduction" />
          É loja de produção
        </label>
        <button name="intent" value="save" style={primaryButton}>
          Testar e salvar
        </button>
      </Form>
    </>
  );
}

const input: React.CSSProperties = {
  border: '1px solid #ddd',
  borderRadius: 8,
  padding: '9px 11px',
  fontSize: 14,
};
const primaryButton: React.CSSProperties = {
  background: '#0BE05C',
  color: '#06301b',
  border: 0,
  borderRadius: 8,
  padding: '10px 18px',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  justifySelf: 'start',
};
const linkButton: React.CSSProperties = {
  background: 'none',
  border: 0,
  color: '#5d6b64',
  fontSize: 13,
  cursor: 'pointer',
};
const prodChip: React.CSSProperties = {
  background: '#fdecea',
  color: '#b42318',
  borderRadius: 999,
  padding: '2px 9px',
  fontSize: 12,
};
const testChip: React.CSSProperties = {
  background: '#eef2f0',
  color: '#5d6b64',
  borderRadius: 999,
  padding: '2px 9px',
  fontSize: 12,
};
const bannerOk: React.CSSProperties = {
  background: '#eafaf0',
  border: '1px solid #b6ecd0',
  color: '#0a6b38',
  borderRadius: 10,
  padding: '10px 14px',
  marginBottom: 14,
  fontSize: 14,
};
const bannerBad: React.CSSProperties = {
  background: '#fdecea',
  border: '1px solid #f5c2bd',
  color: '#b42318',
  borderRadius: 10,
  padding: '10px 14px',
  marginBottom: 14,
  fontSize: 14,
};

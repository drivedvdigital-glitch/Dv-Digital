/**
 * Code editor for the HTML block, on CodeMirror 6.
 *
 * Why not a <textarea>: a pasted landing page is 60 KB, and the browser lays
 * out the whole text of a textarea on every key — that alone was most of the
 * typing lag, with or without React. CodeMirror draws only the lines on
 * screen, and brings line numbers, HTML colours, bracket matching and Ctrl+F.
 *
 * Loaded on demand (dynamic import), so the editor's first paint does not pay
 * for it; until it arrives — or if it fails to load — a plain textarea stands
 * in, with the same callbacks.
 *
 * The editor owns its text. `value` is read when it mounts and again only
 * when `version` changes (a change from outside: undo, "Medir imagens", the
 * other editor closing), so a value that lags behind the typing can never
 * overwrite what the person just typed.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';

type Props = {
  value: string;
  version: number;
  onChange: (value: string) => void;
  onBlur?: () => void;
  onSave?: () => void;
  onEscape?: () => void;
  autoFocus?: boolean;
  label: string;
  style?: CSSProperties;
  testId?: string;
};

type View = { destroy(): void; focus(): void; state: { doc: { toString(): string; length: number } }; dispatch(spec: unknown): void };

export function CodeEditor({ value, version, onChange, onBlur, onSave, onEscape, autoFocus, label, style, testId }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<View | null>(null);
  const callbacks = useRef({ onChange, onBlur, onSave, onEscape });
  callbacks.current = { onChange, onBlur, onSave, onEscape };
  const initial = useRef(value);
  const [estado, setEstado] = useState<'carregando' | 'pronto' | 'falhou'>('carregando');

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const [{ EditorView, basicSetup }, { html }, { keymap }, { EditorState, Prec }] = await Promise.all([
          import('codemirror'),
          import('@codemirror/lang-html'),
          import('@codemirror/view'),
          import('@codemirror/state'),
        ]);
        if (dead || !host.current) return;
        const theme = EditorView.theme({
          '&': { height: '100%', fontSize: '12.5px', backgroundColor: 'var(--dv-sfc)' },
          '&.cm-focused': { outline: 'none' },
          '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', lineHeight: '1.55' },
          '.cm-gutters': { backgroundColor: 'var(--dv-sfc-2, #f7f7f7)', color: 'var(--dv-ink-3, #8a8a8a)', borderRight: '1px solid var(--dv-edge)' },
          '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'rgba(0,0,0,.035)' },
        });
        const v = new EditorView({
          parent: host.current,
          state: EditorState.create({
            doc: initial.current,
            extensions: [
              basicSetup,
              html(),
              EditorView.lineWrapping,
              theme,
              EditorView.contentAttributes.of({ 'aria-label': label, spellcheck: 'false', autocapitalize: 'off', autocorrect: 'off' }),
              Prec.highest(
                keymap.of([
                  // Not handled here: the editor's own Ctrl+S (on window) still runs, after the text is handed over.
                  { key: 'Mod-s', run: () => (callbacks.current.onSave?.(), false) },
                  { key: 'Escape', run: () => (callbacks.current.onEscape ? (callbacks.current.onEscape(), true) : false) },
                ]),
              ),
              EditorView.updateListener.of((update) => {
                if (update.docChanged) callbacks.current.onChange(update.state.doc.toString());
              }),
              EditorView.domEventHandlers({
                blur: () => {
                  callbacks.current.onBlur?.();
                  return false;
                },
              }),
            ],
          }),
        }) as unknown as View;
        view.current = v;
        setEstado('pronto');
        if (autoFocus) v.focus();
      } catch {
        if (!dead) setEstado('falhou');
      }
    })();
    return () => {
      dead = true;
      view.current?.destroy();
      view.current = null;
    };
    // Mount once; later values arrive through `version`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A change from outside replaces the text (the editor's own undo history
  // stays, so Ctrl+Z inside the field still steps back through it).
  const lastVersion = useRef(version);
  useEffect(() => {
    if (version === lastVersion.current) return;
    lastVersion.current = version;
    initial.current = value;
    const v = view.current;
    if (!v) return;
    const current = v.state.doc.toString();
    if (current !== value) v.dispatch({ changes: { from: 0, to: current.length, insert: value } });
  }, [version, value]);

  const frame: CSSProperties = {
    border: '1px solid var(--dv-edge-input)',
    borderRadius: 8,
    overflow: 'hidden',
    background: 'var(--dv-sfc)',
    ...style,
  };

  if (estado === 'falhou') {
    return (
      <textarea
        key={version}
        data-code-editor={testId}
        aria-label={label}
        spellCheck={false}
        defaultValue={value}
        autoFocus={autoFocus || undefined}
        style={{ ...frame, width: '100%', padding: '8px 10px', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12.5, lineHeight: 1.55, color: 'var(--dv-ink)' }}
        onChange={(e) => callbacks.current.onChange(e.target.value)}
        onBlur={() => callbacks.current.onBlur?.()}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') callbacks.current.onSave?.();
          if (e.key === 'Escape' && callbacks.current.onEscape) {
            e.preventDefault();
            callbacks.current.onEscape();
          }
        }}
      />
    );
  }

  return (
    <div ref={host} data-code-editor={testId} data-code-ready={estado === 'pronto' || undefined} style={frame}>
      {estado === 'carregando' ? (
        <div style={{ padding: 12, fontSize: 12.5, color: 'var(--dv-ink-2)' }}>Carregando o editor de código…</div>
      ) : null}
    </div>
  );
}

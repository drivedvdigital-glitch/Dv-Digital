import { useEffect, useState } from 'react';

/**
 * A timestamp in the viewer's own time zone, without a hydration mismatch:
 * the server (UTC) and the first client render both show the plain date;
 * the local time arrives right after mount.
 */
export function LocalDateTime({ iso }: { iso: string }) {
  const [text, setText] = useState(() => iso.slice(0, 10));
  useEffect(() => {
    setText(
      new Date(iso).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    );
  }, [iso]);
  return <time dateTime={iso}>{text}</time>;
}

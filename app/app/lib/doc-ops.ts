/**
 * Pure operations over the block document tree.
 *
 * The editor's canvas, tree panel and inspector all mutate the document
 * through these functions and nothing else. They are pure — every operation
 * returns a new tree — which is what will make undo/redo a list of documents
 * instead of a project.
 *
 * Kept free of React and of server imports on purpose: this file is the
 * client-side mirror of the compiler's schema, and it must stay importable
 * from both worlds.
 */

export interface DocNode {
  id: string;
  type: string;
  props?: Record<string, unknown>;
  style?: Record<string, unknown>;
  children?: DocNode[];
}

export interface DocTree {
  version: number;
  tokens?: Record<string, string>;
  root: DocNode[];
}

/** Block types that hold children. Everything else is a leaf. */
export const CONTAINER_TYPES = new Set(['section', 'stack', 'repeater']);

/** Short pt-BR labels for the tree panel. */
export const BLOCK_LABELS: Record<string, string> = {
  section: 'Seção',
  stack: 'Pilha',
  heading: 'Título',
  text: 'Texto',
  image: 'Imagem',
  button: 'Botão',
  divider: 'Divisor',
  accordion: 'Sanfona',
  repeater: 'Repetidor',
  countdown: 'Contagem',
  html: 'HTML',
};

let counter = 0;
/** Ids only need to be unique within one document; short beats universal. */
export function freshId(type: string): string {
  counter += 1;
  return `${type.slice(0, 2)}${Date.now().toString(36)}${counter.toString(36)}`;
}

export function findNode(nodes: DocNode[], id: string): DocNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const hit = node.children ? findNode(node.children, id) : null;
    if (hit) return hit;
  }
  return null;
}

/** The chain of nodes from root to `id`, inclusive. Empty when absent. */
export function pathTo(nodes: DocNode[], id: string): DocNode[] {
  for (const node of nodes) {
    if (node.id === id) return [node];
    if (node.children) {
      const rest = pathTo(node.children, id);
      if (rest.length > 0) return [node, ...rest];
    }
  }
  return [];
}

/** Applies `patch` to the node's props, returning a new tree. */
export function updateProps(
  nodes: DocNode[],
  id: string,
  patch: Record<string, unknown>,
): DocNode[] {
  return nodes.map((node) => {
    if (node.id === id) return { ...node, props: { ...node.props, ...patch } };
    if (!node.children) return node;
    return { ...node, children: updateProps(node.children, id, patch) };
  });
}

export function removeNode(nodes: DocNode[], id: string): DocNode[] {
  return nodes
    .filter((node) => node.id !== id)
    .map((node) =>
      node.children ? { ...node, children: removeNode(node.children, id) } : node,
    );
}

/** Deep copy with fresh ids throughout — duplicating must not clone identity. */
function reidentify(node: DocNode): DocNode {
  return {
    ...node,
    id: freshId(node.type),
    props: node.props ? { ...node.props } : undefined,
    children: node.children?.map(reidentify),
  };
}

/** Inserts a copy of `id` right after the original, at the same depth. */
export function duplicateNode(nodes: DocNode[], id: string): DocNode[] {
  const index = nodes.findIndex((node) => node.id === id);
  if (index >= 0) {
    const copy = reidentify(nodes[index]);
    return [...nodes.slice(0, index + 1), copy, ...nodes.slice(index + 1)];
  }
  return nodes.map((node) =>
    node.children ? { ...node, children: duplicateNode(node.children, id) } : node,
  );
}

/** Moves a node one position among its siblings. Clamped at the edges. */
export function moveNode(nodes: DocNode[], id: string, delta: -1 | 1): DocNode[] {
  const index = nodes.findIndex((node) => node.id === id);
  if (index >= 0) {
    const target = index + delta;
    if (target < 0 || target >= nodes.length) return nodes;
    const next = [...nodes];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  }
  return nodes.map((node) =>
    node.children ? { ...node, children: moveNode(node.children, id, delta) } : node,
  );
}

/**
 * Inserts a new node relative to the selection:
 *
 *   - selection is a container → appended as its last child;
 *   - selection is a leaf → appended right after it, same parent;
 *   - no selection → appended at the end of the root.
 *
 * That is the rule "new things appear where you are looking", stated in code.
 */
export function insertNode(
  nodes: DocNode[],
  selectedId: string | null,
  node: DocNode,
): DocNode[] {
  if (!selectedId) return [...nodes, node];

  const insertInto = (list: DocNode[]): { list: DocNode[]; done: boolean } => {
    const index = list.findIndex((item) => item.id === selectedId);
    if (index >= 0) {
      const target = list[index];
      if (CONTAINER_TYPES.has(target.type)) {
        const updated = { ...target, children: [...(target.children ?? []), node] };
        return { list: list.map((item, i) => (i === index ? updated : item)), done: true };
      }
      return {
        list: [...list.slice(0, index + 1), node, ...list.slice(index + 1)],
        done: true,
      };
    }
    let done = false;
    const next = list.map((item) => {
      if (done || !item.children) return item;
      const result = insertInto(item.children);
      if (result.done) done = true;
      return result.done ? { ...item, children: result.list } : item;
    });
    return { list: next, done };
  };

  const result = insertInto(nodes);
  return result.done ? result.list : [...nodes, node];
}

/** Factory for each insertable block, with honest starter content. */
export function newBlock(type: string): DocNode {
  const id = freshId(type);
  switch (type) {
    case 'section':
      return {
        id,
        type,
        children: [
          {
            id: freshId('stack'),
            type: 'stack',
            style: { base: { direction: 'column', gap: 12, padding: { top: 24, bottom: 24 } } },
            children: [],
          },
        ],
      };
    case 'heading':
      return { id, type, props: { level: 2, text: 'Novo título' } };
    case 'text':
      return { id, type, props: { text: 'Novo parágrafo.' } };
    case 'image':
      return { id, type, props: { src: '', alt: '', width: 800, height: 600 } };
    case 'button':
      return { id, type, props: { label: 'Quero agora', href: '' } };
    case 'divider':
      return { id, type };
    case 'html':
      return { id, type, props: { html: '<p>Seu HTML aqui.</p>' } };
    default:
      return { id, type, props: {} };
  }
}

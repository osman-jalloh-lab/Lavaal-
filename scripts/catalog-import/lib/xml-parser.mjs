function decode(value = '') {
  return value.replace(/&(?:amp|lt|gt|quot|apos);|&#(?:x[0-9a-fA-F]+|\d+);/g, entity => {
    if (entity === '&amp;') return '&'; if (entity === '&lt;') return '<'; if (entity === '&gt;') return '>';
    if (entity === '&quot;') return '"'; if (entity === '&apos;') return "'";
    const body = entity.slice(2, -1); return String.fromCodePoint(body[0].toLowerCase() === 'x' ? parseInt(body.slice(1), 16) : parseInt(body, 10));
  });
}

function attributes(source) {
  const out = {}; const pattern = /([^\s=]+)\s*=\s*("[^"]*"|'[^']*')/g; let match;
  while ((match = pattern.exec(source))) out[match[1]] = decode(match[2].slice(1, -1));
  return out;
}

export function parseXml(xml) {
  const root = { name: '#document', attrs: {}, children: [], text: '' }; const stack = [root];
  const token = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[^]*?\?>|<([^>]+)>|([^<]+)/g; let match;
  while ((match = token.exec(xml))) {
    if (match[1] !== undefined) { stack.at(-1).text += match[1]; continue; }
    if (match[3] !== undefined) { stack.at(-1).text += decode(match[3]); continue; }
    if (!match[2] || match[2].startsWith('!') || match[2].startsWith('?')) continue;
    const tag = match[2].trim();
    if (tag.startsWith('/')) { if (stack.length === 1 || stack.at(-1).name !== tag.slice(1).trim()) throw new Error('Malformed XML nesting.'); stack.pop(); continue; }
    const selfClosing = /\/$/.test(tag); const content = tag.replace(/\/$/, '').trim(); const firstSpace = content.search(/\s/);
    const name = firstSpace === -1 ? content : content.slice(0, firstSpace); const node = { name, attrs: attributes(firstSpace === -1 ? '' : content.slice(firstSpace + 1)), children: [], text: '' };
    stack.at(-1).children.push(node); if (!selfClosing) stack.push(node);
  }
  if (stack.length !== 1) throw new Error('Malformed XML: unclosed tag.');
  return root;
}

export function descendants(node, name) {
  const found = []; const visit = current => { for (const child of current.children ?? []) { if (child.name === name) found.push(child); visit(child); } }; visit(node); return found;
}
export function first(node, name) { return descendants(node, name)[0] ?? null; }
export function text(node) { return node ? node.text.trim() : null; }
export function attribute(node, ...names) { for (const name of names) if (node?.attrs?.[name] !== undefined && node.attrs[name] !== '') return node.attrs[name]; return null; }

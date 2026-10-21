import { createRequire } from 'node:module';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.join(project, 'client', 'src');
const attrs = new Set(['title', 'description', 'placeholder', 'aria-label', 'aria-description', 'alt', 'label', 'eyebrow', 'helperText', 'emptyText', 'loadingText']);
const messages = new Set(['toast', 'alert', 'confirm', 'notify', 'setError', 'setMessage']);
const exceptions = new Set([
  'Orbit', // Product name.
  'mdi:telegram', // Iconify identifier.
  'Settings', // SidebarLink receives the canonical navigation key, then translates it.
  'Checking admin access…', // Admin-only route in App.jsx deliberately uses English.
  // Canonical status/action values and local state sentinels; their displayed labels use translations.
  'unavailable', 'planUnavailable', 'loadUnavailable', 'contribute', 'saved', 'completed', 'start', 'automatic', 'enabled',
]);
const human = (value) => {
  const text = value.replace(/\s+/g, ' ').trim();
  return /[A-Za-z]{2}/.test(text) && !exceptions.has(text) && !/^(?:https?:|mailto:|tel:|\/|#|[A-Z0-9_]+$|[\w.-]+:[\w.-]+$)/.test(text);
};
const sourceFiles = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  if (['admin', 'i18n', 'test'].includes(entry.name) || /^Admin/.test(entry.name)) return [];
  const file = path.join(directory, entry.name);
  return entry.isDirectory() ? sourceFiles(file) : /\.[jt]sx?$/.test(entry.name) && !/\.test\./.test(entry.name) ? [file] : [];
});
const staticString = (node) => node?.type === 'StringLiteral' ? node.value : null;

export function auditUiStrings() {
  const findings = [];
  for (const file of sourceFiles(root)) {
    const ast = parser.parse(readFileSync(file, 'utf8'), { sourceType: 'module', plugins: ['jsx'] });
    const report = (node, kind, value) => {
      if (human(value)) findings.push(`${path.relative(root, file)}:${node.loc.start.line} ${kind}: ${value}`);
    };
    traverse(ast, {
      JSXText(p) { report(p.node, 'text', p.node.value); },
      JSXAttribute(p) {
        if (attrs.has(p.node.name.name) && staticString(p.node.value) !== null) report(p.node, 'attribute', p.node.value.value);
        if (attrs.has(p.node.name.name) && p.node.value?.type === 'JSXExpressionContainer' && p.node.value.expression.type === 'TemplateLiteral') {
          report(p.node, 'attribute template', p.node.value.expression.quasis.map((part) => part.value.cooked).join('…'));
        }
      },
      TemplateLiteral(p) {
        if (p.findParent((ancestor) => ancestor.isCallExpression() && (['t', '_t', 'tr'].includes(ancestor.node.callee.name) || ['t', 'exists'].includes(ancestor.node.callee.property?.name)))) return;
        const container = p.findParent((ancestor) => ancestor.isJSXExpressionContainer());
        if (!container || !container.parentPath.isJSXElement()) return;
        const value = p.node.quasis.map((part) => part.value.cooked).join('…');
        report(p.node, 'rendered template', value);
      },
      StringLiteral(p) {
        if (!human(p.node.value)) return;
        if (p.findParent((ancestor) => ancestor.isCallExpression() && ['t', '_t', 'tr'].includes(ancestor.node.callee.name))) return;
        const call = p.findParent((ancestor) => ancestor.isCallExpression() && messages.has(ancestor.node.callee.name || ancestor.node.callee.property?.name));
        if (call) {
          // Only the first message argument is displayed; later arguments commonly hold severity or protocol values.
          const first = call.get('arguments')[0];
          if (first && (p === first || p.findParent((ancestor) => ancestor === first))) report(p.node, 'message', p.node.value);
          return;
        }
        const container = p.findParent((ancestor) => ancestor.isJSXExpressionContainer());
        if (!container || !container.parentPath.isJSXElement()) return;
        // Conditional text directly rendered in JSX. Ignore nested lookup/configuration literals.
        let cursor = p.parentPath;
        while (cursor && cursor !== container) {
          if (!cursor.isConditionalExpression() && !cursor.isLogicalExpression() && !cursor.isParenthesizedExpression()) return;
          cursor = cursor.parentPath;
        }
        if (cursor === container) report(p.node, 'conditional', p.node.value);
      },
    });
  }
  return findings.sort();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const findings = auditUiStrings();
  if (findings.length) {
    console.error(findings.join('\n'));
    process.exitCode = 1;
  } else console.log('No untranslated static UI strings found.');
}

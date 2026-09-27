// Prepends a provenance banner so nobody edits generated output by hand.
import { readFileSync, writeFileSync } from 'node:fs';
const file = new URL('../src/generated/control-plane.ts', import.meta.url);
const banner =
  '// GENERATED FILE. Do not edit.\n' +
  '// Source: contracts/openapi/control-plane.v0.yaml (draft, ADR 0007).\n' +
  '// Regenerate: pnpm contracts:generate\n';
const body = readFileSync(file, 'utf8').replace(/^\/\/ GENERATED FILE[\s\S]*?\n(?=\S)(?!\/\/)/, '');
writeFileSync(file, body.startsWith('// GENERATED FILE') ? body : banner + body);

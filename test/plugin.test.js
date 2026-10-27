import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEntryConfig, entryIdFor } from '../lib/mcp-provision.js';
import { DEFAULT_ENDPOINT, DEFAULT_ENTRY_PREFIX, LAWSTAR_TOOLS, REQUEST_TIMEOUT_MS } from '../lib/constants.js';

test('constants: 法律之星覆盖 7 个工具', () => {
  assert.equal(LAWSTAR_TOOLS.length, 7);
  assert.ok(LAWSTAR_TOOLS.includes('law_semantic_search'));
  assert.ok(LAWSTAR_TOOLS.includes('law_semantic_clause'));
  assert.ok(LAWSTAR_TOOLS.includes('law_statute_list'));
  assert.ok(LAWSTAR_TOOLS.includes('law_article_recognition'));
  assert.ok(LAWSTAR_TOOLS.includes('law_hallucination_check'));
  assert.ok(LAWSTAR_TOOLS.includes('law_law_reference'));
  assert.ok(LAWSTAR_TOOLS.includes('law_point_balance'));
});

test('constants: 默认端点与超时', () => {
  assert.equal(DEFAULT_ENDPOINT, 'https://api.law-star.com/mcp/point');
  assert.ok(REQUEST_TIMEOUT_MS > 0);
});

test('mcp-provision: entryIdFor 固定单条目 mcp-lawstar', () => {
  assert.equal(entryIdFor({}), DEFAULT_ENTRY_PREFIX);
  assert.equal(entryIdFor({ mcpEntryPrefix: 'custom' }), 'custom');
});

test('mcp-provision: 0.2.x mcp-client streamable-http config', () => {
  const config = buildEntryConfig(
    { endpoint: DEFAULT_ENDPOINT, serverName: 'lawstar' },
    { endpoint: DEFAULT_ENDPOINT, serverName: 'lawstar', apiKey: 'test-key' },
  );
  assert.equal(config.transport, 'streamable-http');
  assert.equal(config.serverName, 'lawstar');
  assert.equal(config.url, DEFAULT_ENDPOINT);
  assert.equal(config.headers.Authorization, 'Bearer test-key');
});

test('常量与受管条目 id 无真实污点（不含命令注入分隔符）', () => {
  for (const entry of [DEFAULT_ENDPOINT, DEFAULT_ENTRY_PREFIX, ...LAWSTAR_TOOLS]) {
    assert.ok(!/[\r\n`$|<>;&]/.test(entry), `不应包含 shell 元字符: ${entry}`);
  }
});
/**
 * 法律之星 MCP API Key 凭证存储：基于 DSH 存储域（ctx.storageDomain）的持久化 KV。
 * 落盘位置：~/.dsh/storages/（目录权限 0700），API Key 不会进入对话历史或日志明文。
 * 独立存储域，与其他插件互不干扰。
 */
import { z } from 'zod';
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain';
import { DEFAULT_GRANT_KEY } from './constants.js';

/** 存储记录 schema（zod，供 storage-domain 校验与持久化） */
export const credentialRecordSchema = z.object({
  /** MCP 网关端点 */
  endpoint: z.string(),
  /** 静态 API Key（鉴权用，切勿写入日志/对话历史） */
  apiKey: z.string(),
  /** 服务器 serverName */
  serverName: z.string(),
  /** 连接建立时间 */
  connectedAt: z.number(),
  /** 最近更新时间 */
  updatedAt: z.number(),
});

/** 定义 lawstar-mcp 存储域（单表 credentials） */
export function defineCredentialDomain() {
  return defineDomain({
    name: 'lawstar_mcp',
    version: 1,
    tables: {
      credentials: domainTable(credentialRecordSchema),
    },
  });
}

/** 由用户输入构造一条凭证记录 */
export function buildCredential({ endpoint, apiKey, serverName }) {
  const now = Date.now();
  return {
    endpoint,
    apiKey,
    serverName,
    connectedAt: now,
    updatedAt: now,
  };
}

/**
 * CredentialStore：封装单表的 get/put/delete。
 * @param {import('@deepseek-ai/dsh-storage-domain').Domain} domain storage-domain open 后的域句柄
 */
export class CredentialStore {
  constructor(domain) {
    this.domain = domain;
    this.table = domain.tables.get('credentials');
    if (!this.table) throw new Error(`lawstar-dsh-mcp: domain table 'credentials' not found`);
  }

  keyFor(account = DEFAULT_GRANT_KEY) {
    return `cred:${account}`;
  }

  /** @returns {Promise<object|undefined>} */
  async get(account = DEFAULT_GRANT_KEY) {
    return this.table.get(this.keyFor(account));
  }

  async put(cred, account = DEFAULT_GRANT_KEY) {
    cred.updatedAt = Date.now();
    await this.table.put(this.keyFor(account), cred);
    return cred;
  }

  async delete(account = DEFAULT_GRANT_KEY) {
    return this.table.delete(this.keyFor(account));
  }
}
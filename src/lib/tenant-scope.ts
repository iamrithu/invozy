import { Prisma } from '@prisma/client';
import { currentCompanyId, isViewOnly, ViewOnlyError } from './tenant';

// The tenancy boundary of the data layer: a Prisma query extension that makes
// every query through the scoped client (`prisma` in src/lib/prisma.ts) act
// for exactly one company — the one src/lib/tenant.ts says is in scope.
//
//   reads / updates / deletes  → the tenant filter is ANDed into `where`
//   creates (incl. nested)     → companyId is set, never taken from input
//   nested connect / set       → may only reach the tenant's own rows
//   foreign keys in input      → must point at the tenant's own rows
//   raw SQL                    → must mention "companyId" (or say why not)
//
// With no company in scope every query throws (TenantMissingError) — there
// is no "all companies" fallback. Platform-wide code uses `rootPrisma`.

type Scope =
  /** Not tenant data, but used by sign-in code through this client — login
   * throttling only. */
  | { kind: 'global' }
  /** Platform data the scoped client must never touch (audit log, sign-in
   * tokens) — only rootPrisma reads or writes it. */
  | { kind: 'platform' }
  /** The Company table: only the tenant's own row is visible. */
  | { kind: 'company' }
  /** Has its own companyId column. */
  | { kind: 'direct' }
  /** No companyId of its own — scoped through a required parent relation. */
  | { kind: 'via'; relation: string };

const direct: Scope = { kind: 'direct' };
const via = (relation: string): Scope => ({ kind: 'via', relation });

/** Every model must be listed — adding a model to schema.prisma without
 * deciding how it's scoped is a type error here. */
export const MODEL_SCOPES: Record<Prisma.ModelName, Scope> = {
  Company: { kind: 'company' },
  User: direct,
  Product: direct,
  Customer: direct,
  Invoice: direct,
  Payment: direct,
  StockMovement: direct,
  Supplier: direct,
  Purchase: direct,
  CreditNote: direct,
  Refund: direct,
  ActivityLog: direct,
  AppSetting: direct,
  ProductPriceTier: via('product'),
  CustomerPrice: via('customer'),
  Scheme: via('product'),
  InvoiceItem: via('invoice'),
  PurchaseItem: via('purchase'),
  PurchaseAttachment: via('purchase'),
  CreditNoteItem: via('creditNote'),
  NotificationRead: via('user'),
  SubscriptionPayment: direct,
  LoginAttempt: { kind: 'global' },
  PasswordResetToken: { kind: 'platform' },
  EmailVerificationToken: { kind: 'platform' },
  PlatformAuditLog: { kind: 'platform' },
};

export class CrossTenantError extends Error {
  constructor(what: string) {
    super(`That ${what} isn't part of this company.`);
    this.name = 'CrossTenantError';
  }
}

// ── Schema metadata (from the generated client's DMMF) ─────────────────────

type Relation = { field: string; target: string; fk: string | null; isList: boolean };

const relationsByModel = new Map<string, Relation[]>();
for (const model of Prisma.dmmf.datamodel.models) {
  relationsByModel.set(
    model.name,
    model.fields
      .filter((f) => f.kind === 'object')
      .map((f) => ({
        field: f.name,
        target: f.type as string,
        fk: f.relationFromFields && f.relationFromFields.length === 1 ? f.relationFromFields[0] : null,
        isList: f.isList,
      }))
  );
}
const relationsOf = (model: string) => relationsByModel.get(model) ?? [];
const scopeOf = (model: string): Scope => MODEL_SCOPES[model as Prisma.ModelName] ?? { kind: 'global' };
const isTenantModel = (model: string) => scopeOf(model).kind !== 'global' && scopeOf(model).kind !== 'platform';

function parentOf(model: string, relation: string): string {
  const rel = relationsOf(model).find((r) => r.field === relation);
  if (!rel) throw new Error(`tenant-scope: ${model}.${relation} is not a relation`);
  return rel.target;
}

/** The `where` fragment that limits `model` to company `c`. */
export function tenantFilter(model: string, c: string): Record<string, unknown> | null {
  const scope = scopeOf(model);
  switch (scope.kind) {
    case 'global':
    case 'platform':
      return null;
    case 'company':
      return { id: c };
    case 'direct':
      return { companyId: c };
    case 'via':
      return { [scope.relation]: tenantFilter(parentOf(model, scope.relation), c) };
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

type Obj = Record<string, any>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && !Prisma.Decimal.isDecimal(v);
const toArr = <T>(v: T | T[] | undefined | null): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
const mapOneOrMany = (v: any, fn: (x: any) => any) => (Array.isArray(v) ? v.map(fn) : fn(v));

function andWhere(where: Obj | undefined, filter: Obj | null): Obj | undefined {
  if (!filter) return where;
  const base = where ?? {};
  return { ...base, AND: [...toArr(base.AND), filter] };
}

// ── Ids known to belong to a company ───────────────────────────────────────
// Rows never move between companies, so once a row has been seen through the
// scoped client (created or read under company c) it is c's for good. Keyed
// by model AND id, so a row of one model can never vouch for an equal id in
// another model. Lets
// the foreign-key check below skip a query for ids the request just loaded or
// created — including rows created earlier in the same transaction, which a
// check from outside that transaction couldn't see.

const known = new Map<string, string>();
const KNOWN_MAX = 50_000;

function remember(model: string, id: unknown, c: string) {
  if (typeof id !== 'string') return;
  const key = `${model}:${id}`;
  if (known.size >= KNOWN_MAX) {
    let drop = KNOWN_MAX / 5;
    for (const key of known.keys()) {
      known.delete(key);
      if (--drop <= 0) break;
    }
  }
  known.set(key, c);
}

function rememberResult(model: string, result: unknown, c: string) {
  if (!isTenantModel(model) || scopeOf(model).kind === 'company') return;
  if (Array.isArray(result)) {
    if (result.length > 2_000) return;
    for (const row of result) if (isObj(row)) remember(model, row.id, c);
  } else if (isObj(result)) {
    remember(model, result.id, c);
  }
}

// ── Write preparation ──────────────────────────────────────────────────────

type Ctx = { c: string; fks: Map<string, Set<string>> };

function noteFk(ctx: Ctx, target: string, id: string) {
  let ids = ctx.fks.get(target);
  if (!ids) ctx.fks.set(target, (ids = new Set()));
  ids.add(id);
}

/** Records every scalar foreign key in `data` that points at tenant data. */
function collectFks(model: string, data: Obj, ctx: Ctx) {
  for (const rel of relationsOf(model)) {
    if (!rel.fk || rel.target === 'Company' || !isTenantModel(rel.target) || !(rel.fk in data)) continue;
    let v = data[rel.fk];
    if (isObj(v) && 'set' in v) v = v.set;
    if (typeof v === 'string') noteFk(ctx, rel.target, v);
  }
}

/** Whether a create input uses relation objects (Prisma's "checked" input)
 * rather than scalar foreign keys — the two can't be mixed, so companyId has
 * to be supplied the same way. */
function isCheckedInput(model: string, data: Obj): boolean {
  return relationsOf(model).some((r) => r.fk && r.target !== 'Company' && isObj(data[r.field]));
}

function prepCreate(model: string, input: Obj, ctx: Ctx): Obj {
  const scope = scopeOf(model);
  if (scope.kind === 'company') throw new Error('Companies are created at signup or from /admin.');
  const data: Obj = { ...input };
  if (scope.kind === 'direct') {
    if (data.companyId !== undefined && data.companyId !== ctx.c) throw new CrossTenantError('record');
    if (isObj(data.company)) throw new CrossTenantError('record');
    if (isCheckedInput(model, data)) {
      delete data.companyId;
      data.company = { connect: { id: ctx.c } };
    } else {
      data.companyId = ctx.c;
    }
  }
  walkRelations(model, data, ctx);
  collectFks(model, data, ctx);
  return data;
}

/** createMany rows are always plain scalars. */
function prepCreateManyRow(model: string, input: Obj, ctx: Ctx): Obj {
  const scope = scopeOf(model);
  if (scope.kind === 'company') throw new Error('Companies are created at signup or from /admin.');
  const data: Obj = { ...input };
  if (scope.kind === 'direct') {
    if (data.companyId !== undefined && data.companyId !== ctx.c) throw new CrossTenantError('record');
    data.companyId = ctx.c;
  }
  collectFks(model, data, ctx);
  return data;
}

function prepUpdate(model: string, input: Obj, ctx: Ctx): Obj {
  const data: Obj = { ...input };
  if ('companyId' in data) {
    const v = isObj(data.companyId) ? data.companyId.set : data.companyId;
    if (v !== ctx.c) throw new CrossTenantError('record');
  }
  if ('company' in data && scopeOf(model).kind === 'direct') throw new CrossTenantError('record');
  walkRelations(model, data, ctx);
  collectFks(model, data, ctx);
  return data;
}

/** Applies the rules to every nested write under `data`'s relation fields. */
function walkRelations(model: string, data: Obj, ctx: Ctx) {
  for (const rel of relationsOf(model)) {
    const op = data[rel.field];
    if (!isObj(op)) continue;
    const t = rel.target;
    const filter = tenantFilter(t, ctx.c);
    const next: Obj = { ...op };

    if (op.create) next.create = mapOneOrMany(op.create, (x: Obj) => prepCreate(t, x, ctx));
    if (op.createMany) next.createMany = { ...op.createMany, data: toArr(op.createMany.data).map((x: Obj) => prepCreateManyRow(t, x, ctx)) };
    if (op.connectOrCreate)
      next.connectOrCreate = mapOneOrMany(op.connectOrCreate, (x: Obj) => ({ ...x, where: andWhere(x.where, filter), create: prepCreate(t, x.create, ctx) }));
    if (op.connect) next.connect = mapOneOrMany(op.connect, (x: Obj) => andWhere(x, filter));
    if (op.set) next.set = mapOneOrMany(op.set, (x: Obj) => andWhere(x, filter));
    if (op.upsert)
      next.upsert = mapOneOrMany(op.upsert, (x: Obj) => ({
        ...x,
        ...(x.where ? { where: andWhere(x.where, filter) } : {}),
        create: prepCreate(t, x.create, ctx),
        update: prepUpdate(t, x.update, ctx),
      }));
    if (op.update) {
      if (rel.isList) next.update = mapOneOrMany(op.update, (x: Obj) => ({ ...x, data: prepUpdate(t, x.data, ctx) }));
      else {
        const keys = Object.keys(op.update);
        const wrapped = keys.includes('data') && keys.every((k) => k === 'data' || k === 'where');
        next.update = wrapped ? { ...op.update, data: prepUpdate(t, op.update.data, ctx) } : prepUpdate(t, op.update, ctx);
      }
    }
    if (op.updateMany) next.updateMany = mapOneOrMany(op.updateMany, (x: Obj) => ({ ...x, data: prepUpdate(t, x.data, ctx) }));
    data[rel.field] = next;
  }
}

// ── Foreign-key ownership check ────────────────────────────────────────────

type Delegate = { findMany(args: Obj): Promise<Obj[]> };
type RootClient = Record<string, unknown>;

function ownerSelect(model: string): Obj {
  const scope = scopeOf(model);
  if (scope.kind === 'direct') return { id: true, companyId: true };
  if (scope.kind === 'via') return { id: true, [scope.relation]: { select: ownerSelect(parentOf(model, scope.relation)) } };
  return { id: true };
}

function ownerOf(model: string, row: Obj): string | null {
  const scope = scopeOf(model);
  if (scope.kind === 'direct') return row.companyId ?? null;
  if (scope.kind === 'company') return row.id ?? null;
  if (scope.kind === 'via') return row[scope.relation] ? ownerOf(parentOf(model, scope.relation), row[scope.relation]) : null;
  return null;
}

const delegateName = (model: string) => model.charAt(0).toLowerCase() + model.slice(1);

async function verifyFks(ctx: Ctx, root: RootClient) {
  for (const [target, ids] of ctx.fks) {
    const unknown: string[] = [];
    for (const id of ids) {
      const owner = known.get(`${target}:${id}`);
      if (owner === undefined) unknown.push(id);
      else if (owner !== ctx.c) throw new CrossTenantError(target);
    }
    if (!unknown.length) continue;
    const rows = await (root[delegateName(target)] as Delegate).findMany({ where: { id: { in: unknown } }, select: ownerSelect(target) });
    for (const row of rows) {
      const owner = ownerOf(target, row);
      if (owner !== ctx.c) throw new CrossTenantError(target);
      remember(target, row.id, owner);
    }
    // An id not found at all is left to the database's own foreign key —
    // another company's committed row is always found, and so refused above.
  }
}

// ── Raw SQL guard ──────────────────────────────────────────────────────────

function sqlText(args: unknown): string {
  const parts = (v: unknown): string => {
    if (typeof v === 'string') return v;
    if (isObj(v) && Array.isArray(v.strings)) return v.strings.join('?');
    if (isObj(v) && typeof v.sql === 'string') return v.sql;
    if (Array.isArray(v)) return v.map(parts).join(' ');
    return '';
  };
  return parts(args);
}

/** Raw SQL can't be rewritten, so it must at least say how it's scoped: a
 * `"companyId"` condition, or a `tenant-scoped` comment explaining why it
 * doesn't need one (e.g. it's keyed by the company's own id). */
export function assertTenantSql(args: unknown) {
  const text = sqlText(args);
  if (!/"companyId"|tenant-scoped/.test(text)) {
    throw new Error(`Raw SQL through the tenant-scoped client must filter on "companyId": ${text.replace(/\s+/g, ' ').slice(0, 160)}`);
  }
}

// ── The extension ──────────────────────────────────────────────────────────

const WRITES = new Set(['create', 'createMany', 'createManyAndReturn', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany']);

/** Raw SQL that changes data or takes row locks — refused while view-only. */
function isWriteSql(args: unknown): boolean {
  const text = sqlText(args);
  return /^\s*(insert|update|delete|merge|truncate|alter|create|drop)\b/i.test(text) || /\bfor\s+update\b/i.test(text) || /\bwith\b[\s\S]*\b(insert|update|delete)\b/i.test(text);
}

const READ_OR_FILTER = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
]);

export function tenantScope(root: RootClient) {
  return Prisma.defineExtension({
    name: 'tenant-scope',
    query: {
      async $allOperations({ model, operation, args, query }) {
        if (!model) {
          // $queryRaw / $executeRaw (+Unsafe). Needs a company in scope too.
          await currentCompanyId();
          assertTenantSql(args);
          if ((operation === '$executeRaw' || operation === '$executeRawUnsafe' || isWriteSql(args)) && (await isViewOnly())) throw new ViewOnlyError();
          return query(args);
        }
        if (scopeOf(model).kind === 'platform') {
          throw new Error(`${model} is platform data — use rootPrisma (it is never read or written through the company-scoped client).`);
        }
        if (!isTenantModel(model)) return query(args);
        if (WRITES.has(operation) && (await isViewOnly())) throw new ViewOnlyError();

        const c = await currentCompanyId();
        const scope = scopeOf(model);
        const filter = tenantFilter(model, c);
        const ctx: Ctx = { c, fks: new Map() };
        const a: Obj = { ...(args as Obj) };

        if (scope.kind === 'company' && (operation === 'delete' || operation === 'deleteMany')) {
          throw new Error('A company is closed from /admin, not deleted by its own users.');
        }

        if (READ_OR_FILTER.has(operation)) a.where = andWhere(a.where, filter);
        switch (operation) {
          case 'create':
            a.data = prepCreate(model, a.data, ctx);
            break;
          case 'createMany':
          case 'createManyAndReturn':
            a.data = toArr(a.data).map((row: Obj) => prepCreateManyRow(model, row, ctx));
            break;
          case 'update':
          case 'updateMany':
            a.data = prepUpdate(model, a.data, ctx);
            break;
          case 'upsert':
            a.where = andWhere(a.where, filter);
            a.create = prepCreate(model, a.create, ctx);
            a.update = prepUpdate(model, a.update, ctx);
            break;
        }

        if (ctx.fks.size) await verifyFks(ctx, root);
        const result = await query(a as typeof args);
        rememberResult(model, result, c);
        return result;
      },
    },
  });
}

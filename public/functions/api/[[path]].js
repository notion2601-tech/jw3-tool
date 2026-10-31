// 单文件 Pages Function：functions/api/[[path]].js
// 处理 /api/accounts、/api/characters、/api/dungeons、/api/event-types、
// /api/income-records、/api/event-records、/api/summary、/api/trend、
// /api/export、/api/me、/api/health。

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'same-origin',
};

class ApiError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function ok(data, status = 200) {
  return new Response(JSON.stringify({ ok: true, data }), {
    status,
    headers: JSON_HEADERS,
  });
}

function fail(message, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: JSON_HEADERS,
  });
}

function handleError(error) {
  if (error instanceof ApiError) return fail(error.message, error.status);
  console.error('[jx3-workbench]', error);
  const message = String(error?.message || error);
  if (/UNIQUE constraint failed/i.test(message)) return fail('名称已存在，请换一个名称。', 409);
  if (/no such table/i.test(message)) return fail('数据库尚未初始化，请先执行 db/init.sql。', 503);
  if (/DB is not defined|D1 binding/i.test(message)) return fail('D1 数据库未绑定，请在 Pages 中绑定 DB 后重新部署。', 503);
  return fail('服务器处理失败，请稍后再试。', 500);
}

function getDb(env) {
  if (!env?.DB) throw new ApiError('D1 数据库未绑定（缺少 DB）。', 503);
  return env.DB;
}

async function readJson(request) {
  const type = request.headers.get('content-type') || '';
  if (!type.toLowerCase().includes('application/json')) {
    throw new ApiError('请求格式应为 application/json。', 415);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    throw new ApiError('请求内容不是有效的 JSON。', 400);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError('请求内容必须是 JSON 对象。', 400);
  }
  return body;
}

function getId(request, body = null) {
  const raw = new URL(request.url).searchParams.get('id') ?? body?.id;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError('缺少有效的记录 ID。', 400);
  return id;
}

function text(value, field, { required = false, max = 200, fallback = '' } = {}) {
  if (value === undefined || value === null) {
    if (required) throw new ApiError(`${field}不能为空。`);
    return fallback;
  }
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new ApiError(`${field}格式不正确。`);
  }
  const result = String(value).trim();
  if (required && !result) throw new ApiError(`${field}不能为空。`);
  if (result.length > max) throw new ApiError(`${field}不能超过 ${max} 个字符。`);
  return result;
}

function integer(value, field, { required = false, min = 0, max = 999999, fallback = null } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new ApiError(`${field}不能为空。`);
    return fallback;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) throw new ApiError(`${field}必须是整数。`);
  if (n < min || n > max) throw new ApiError(`${field}应在 ${min} 到 ${max} 之间。`);
  return n;
}

function money(value, field, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new ApiError(`${field}必须是数字。`);
  if (n < 0) throw new ApiError(`${field}不能为负数。`);
  if (n > 999999999) throw new ApiError(`${field}数值过大。`);
  return Math.round(n * 100) / 100;
}

function optionalNumber(value, field, { min = 0, max = 999999999 } = {}) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new ApiError(`${field}必须是数字。`);
  if (n < min || n > max) throw new ApiError(`${field}超出允许范围。`);
  return Math.round(n * 100) / 100;
}

function flag(value, fallback = 1) {
  if (value === undefined || value === null || value === '') return fallback;
  if (value === true || value === 1 || value === '1') return 1;
  if (value === false || value === 0 || value === '0') return 0;
  throw new ApiError('启用状态只能是 0 或 1。');
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function dateText(value, field = '日期', { fallback = todayInShanghai() } = {}) {
  if (value === undefined || value === null || value === '') return fallback;
  const result = String(value).trim();
  if (!isValidDate(result)) throw new ApiError(`${field}格式应为 YYYY-MM-DD，且必须是有效日期。`);
  return result;
}

function todayInShanghai() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function addDays(date, days) {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function weekRange(date = todayInShanghai()) {
  const [y, m, d] = date.split('-').map(Number);
  const offset = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  const start = addDays(date, -offset);
  return { start, end: addDays(start, 6) };
}

function monthRange(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month || '')) throw new ApiError('月份格式应为 YYYY-MM。');
  const [y, m] = month.split('-').map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { month, start: `${month}-01`, end: `${month}-${String(days).padStart(2, '0')}`, days };
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function methodNotAllowed() {
  return fail('不支持的请求方法。', 405);
}

async function accounts(context, method) {
  const db = getDb(context.env);
  if (method === 'GET') {
    const rows = await db.prepare(`
      SELECT a.id, a.name, a.note, a.created_at, COUNT(c.id) AS character_count
      FROM accounts a
      LEFT JOIN characters c ON c.account_id = a.id
      GROUP BY a.id
      ORDER BY a.id ASC
    `).all();
    return ok(rows.results || []);
  }
  if (method === 'POST') {
    const body = await readJson(context.request);
    const name = text(body.name, '账号名称', { required: true, max: 80 });
    const note = text(body.note, '备注', { max: 500 });
    const result = await db.prepare('INSERT INTO accounts (name, note) VALUES (?, ?)').bind(name, note).run();
    const row = await db.prepare('SELECT * FROM accounts WHERE id = ?').bind(result.meta.last_row_id).first();
    return ok({ ...row, character_count: 0 }, 201);
  }
  if (method === 'PUT') {
    const body = await readJson(context.request);
    const id = getId(context.request, body);
    const existing = await db.prepare('SELECT * FROM accounts WHERE id = ?').bind(id).first();
    if (!existing) throw new ApiError('账号不存在。', 404);
    const name = body.name === undefined ? existing.name : text(body.name, '账号名称', { required: true, max: 80 });
    const note = body.note === undefined ? existing.note : text(body.note, '备注', { max: 500 });
    await db.prepare('UPDATE accounts SET name = ?, note = ? WHERE id = ?').bind(name, note, id).run();
    return ok({ ...existing, name, note });
  }
  if (method === 'DELETE') {
    const id = getId(context.request);
    const existing = await db.prepare('SELECT id FROM accounts WHERE id = ?').bind(id).first();
    if (!existing) throw new ApiError('账号不存在。', 404);
    const count = await db.prepare('SELECT COUNT(*) AS n FROM characters WHERE account_id = ?').bind(id).first();
    if (count.n > 0) throw new ApiError(`该账号下还有 ${count.n} 个角色，请先删除角色后再删除账号。`, 409);
    await db.prepare('DELETE FROM accounts WHERE id = ?').bind(id).run();
    return ok({ id });
  }
  return methodNotAllowed();
}

const CHARACTER_SELECT = `
  SELECT c.id, c.account_id, c.name, c.server, c.school, c.active, c.note, c.created_at,
         a.name AS account_name
  FROM characters c
  JOIN accounts a ON a.id = c.account_id
`;

async function accountExists(db, accountId) {
  const row = await db.prepare('SELECT id FROM accounts WHERE id = ?').bind(accountId).first();
  if (!row) throw new ApiError('所属账号不存在。', 400);
}

async function characters(context, method) {
  const db = getDb(context.env);
  if (method === 'GET') {
    const url = new URL(context.request.url);
    const accountId = url.searchParams.get('account_id');
    const active = url.searchParams.get('active');
    const where = [];
    const binds = [];
    if (accountId) {
      where.push('c.account_id = ?');
      binds.push(integer(accountId, '账号 ID', { required: true, min: 1 }));
    }
    if (active !== null && active !== '') {
      where.push('c.active = ?');
      binds.push(flag(active));
    }
    const sql = `${CHARACTER_SELECT}
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY c.active DESC, a.id ASC, c.id ASC`;
    const statement = db.prepare(sql);
    const rows = await (binds.length ? statement.bind(...binds) : statement).all();
    return ok(rows.results || []);
  }
  if (method === 'POST') {
    const body = await readJson(context.request);
    const accountId = integer(body.account_id, '所属账号', { required: true, min: 1 });
    await accountExists(db, accountId);
    const name = text(body.name, '角色名称', { required: true, max: 60 });
    const server = text(body.server, '服务器', { max: 60 });
    const school = text(body.school, '门派', { max: 40 });
    const active = flag(body.active, 1);
    const note = text(body.note, '备注', { max: 500 });
    const result = await db.prepare(`
      INSERT INTO characters (account_id, name, server, school, active, note)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(accountId, name, server, school, active, note).run();
    const row = await db.prepare(`${CHARACTER_SELECT} WHERE c.id = ?`).bind(result.meta.last_row_id).first();
    return ok(row, 201);
  }
  if (method === 'PUT') {
    const body = await readJson(context.request);
    const id = getId(context.request, body);
    const existing = await db.prepare('SELECT * FROM characters WHERE id = ?').bind(id).first();
    if (!existing) throw new ApiError('角色不存在。', 404);
    const accountId = body.account_id === undefined
      ? existing.account_id
      : integer(body.account_id, '所属账号', { required: true, min: 1 });
    await accountExists(db, accountId);
    const name = body.name === undefined ? existing.name : text(body.name, '角色名称', { required: true, max: 60 });
    const server = body.server === undefined ? existing.server : text(body.server, '服务器', { max: 60 });
    const school = body.school === undefined ? existing.school : text(body.school, '门派', { max: 40 });
    const active = body.active === undefined ? existing.active : flag(body.active);
    const note = body.note === undefined ? existing.note : text(body.note, '备注', { max: 500 });
    await db.prepare(`
      UPDATE characters SET account_id = ?, name = ?, server = ?, school = ?, active = ?, note = ?
      WHERE id = ?
    `).bind(accountId, name, server, school, active, note, id).run();
    return ok(await db.prepare(`${CHARACTER_SELECT} WHERE c.id = ?`).bind(id).first());
  }
  if (method === 'DELETE') {
    const id = getId(context.request);
    const existing = await db.prepare('SELECT id FROM characters WHERE id = ?').bind(id).first();
    if (!existing) throw new ApiError('角色不存在。', 404);
    await db.prepare('DELETE FROM characters WHERE id = ?').bind(id).run();
    return ok({ id });
  }
  return methodNotAllowed();
}

async function dungeons(context, method) {
  const db = getDb(context.env);
  if (method === 'GET') {
    const active = new URL(context.request.url).searchParams.get('active');
    let sql = 'SELECT * FROM dungeons';
    const binds = [];
    if (active !== null && active !== '') {
      sql += ' WHERE active = ?';
      binds.push(flag(active));
    }
    sql += ' ORDER BY sort_order ASC, id ASC';
    const statement = db.prepare(sql);
    const rows = await (binds.length ? statement.bind(...binds) : statement).all();
    return ok(rows.results || []);
  }
  if (method === 'POST') {
    const body = await readJson(context.request);
    const name = text(body.name, '副本名称', { required: true, max: 80 });
    const totalBosses = integer(body.total_bosses, '首领数量', { required: true, min: 0, max: 99 });
    const active = flag(body.active, 1);
    const sortOrder = integer(body.sort_order, '排序', { min: 0, max: 99999, fallback: 100 });
    const result = await db.prepare(`
      INSERT INTO dungeons (name, total_bosses, active, sort_order) VALUES (?, ?, ?, ?)
    `).bind(name, totalBosses, active, sortOrder).run();
    return ok(await db.prepare('SELECT * FROM dungeons WHERE id = ?').bind(result.meta.last_row_id).first(), 201);
  }
  if (method === 'PUT') {
    const body = await readJson(context.request);
    const id = getId(context.request, body);
    const existing = await db.prepare('SELECT * FROM dungeons WHERE id = ?').bind(id).first();
    if (!existing) throw new ApiError('副本不存在。', 404);
    const name = body.name === undefined ? existing.name : text(body.name, '副本名称', { required: true, max: 80 });
    const totalBosses = body.total_bosses === undefined
      ? existing.total_bosses
      : integer(body.total_bosses, '首领数量', { required: true, min: 0, max: 99 });
    const active = body.active === undefined ? existing.active : flag(body.active);
    const sortOrder = body.sort_order === undefined
      ? existing.sort_order
      : integer(body.sort_order, '排序', { min: 0, max: 99999, fallback: existing.sort_order });
    await db.prepare(`
      UPDATE dungeons SET name = ?, total_bosses = ?, active = ?, sort_order = ? WHERE id = ?
    `).bind(name, totalBosses, active, sortOrder, id).run();
    return ok(await db.prepare('SELECT * FROM dungeons WHERE id = ?').bind(id).first());
  }
  if (method === 'DELETE') {
    const id = getId(context.request);
    const existing = await db.prepare('SELECT id FROM dungeons WHERE id = ?').bind(id).first();
    if (!existing) throw new ApiError('副本不存在。', 404);
    await db.prepare('DELETE FROM dungeons WHERE id = ?').bind(id).run();
    return ok({ id });
  }
  return methodNotAllowed();
}

async function eventTypes(context, method) {
  const db = getDb(context.env);
  if (method === 'GET') {
    const active = new URL(context.request.url).searchParams.get('active');
    let sql = 'SELECT * FROM event_types';
    const binds = [];
    if (active !== null && active !== '') {
      sql += ' WHERE active = ?';
      binds.push(flag(active));
    }
    sql += ' ORDER BY sort_order ASC, id ASC';
    const statement = db.prepare(sql);
    const rows = await (binds.length ? statement.bind(...binds) : statement).all();
    return ok(rows.results || []);
  }
  if (method === 'PUT') {
    const body = await readJson(context.request);
    const id = getId(context.request, body);
    const existing = await db.prepare('SELECT * FROM event_types WHERE id = ?').bind(id).first();
    if (!existing) throw new ApiError('事件类型不存在。', 404);
    const active = body.active === undefined ? existing.active : flag(body.active);
    const sortOrder = body.sort_order === undefined
      ? existing.sort_order
      : integer(body.sort_order, '排序', { min: 0, max: 99999, fallback: existing.sort_order });
    await db.prepare('UPDATE event_types SET active = ?, sort_order = ? WHERE id = ?')
      .bind(active, sortOrder, id).run();
    return ok(await db.prepare('SELECT * FROM event_types WHERE id = ?').bind(id).first());
  }
  return methodNotAllowed();
}

const CATEGORIES = ['副本', '阵营', '其它'];

const INCOME_SELECT = `
  SELECT r.id, r.date, r.character_id, r.category, r.title, r.income, r.expense, r.net,
         r.note, r.dungeon_id, r.bosses_done, r.created_at,
         COALESCE(d.name, NULLIF(r.dungeon_name, ''), '') AS dungeon_name,
         d.total_bosses AS dungeon_total_bosses,
         c.name AS character_name, c.server AS character_server,
         a.name AS account_name
  FROM income_records r
  JOIN characters c ON c.id = r.character_id
  JOIN accounts a ON a.id = c.account_id
  LEFT JOIN dungeons d ON d.id = r.dungeon_id
`;

function category(value) {
  const result = text(value, '分类', { required: true, max: 10 });
  if (!CATEGORIES.includes(result)) throw new ApiError('分类只能是副本、阵营或其它。');
  return result;
}

async function ensureCharacter(db, characterId) {
  const row = await db.prepare('SELECT id FROM characters WHERE id = ?').bind(characterId).first();
  if (!row) throw new ApiError('角色不存在。', 400);
}

async function resolveDungeon(db, body, cat) {
  if (cat !== '副本') return { dungeonId: null, dungeonName: '', bossesDone: null };
  const dungeonId = integer(body.dungeon_id, '副本', { min: 1, fallback: null });
  const bossesDone = integer(body.bosses_done, 'Boss 进度', { min: 0, max: 999, fallback: null });
  if (dungeonId) {
    const dungeon = await db.prepare('SELECT id, name FROM dungeons WHERE id = ?').bind(dungeonId).first();
    if (!dungeon) throw new ApiError('所选副本不存在。', 400);
    return { dungeonId: dungeon.id, dungeonName: dungeon.name, bossesDone };
  }
  const dungeonName = text(body.dungeon_name, '副本名称', { max: 80 });
  if (!dungeonName) throw new ApiError('分类为副本时，请选择预置副本或手动填写副本名称。');
  return { dungeonId: null, dungeonName, bossesDone };
}

async function incomeRecords(context, method) {
  const db = getDb(context.env);
  if (method === 'GET') {
    const url = new URL(context.request.url);
    const where = [];
    const binds = [];
    const characterId = url.searchParams.get('character_id');
    const cat = url.searchParams.get('category');
    const start = url.searchParams.get('start');
    const end = url.searchParams.get('end');
    if (characterId) {
      where.push('r.character_id = ?');
      binds.push(integer(characterId, '角色 ID', { required: true, min: 1 }));
    }
    if (cat) {
      where.push('r.category = ?');
      binds.push(category(cat));
    }
    if (start) {
      where.push('r.date >= ?');
      binds.push(dateText(start, '开始日期'));
    }
    if (end) {
      where.push('r.date <= ?');
      binds.push(dateText(end, '结束日期'));
    }
    if (start && end && start > end) throw new ApiError('开始日期不能晚于结束日期。');
    const sql = `${INCOME_SELECT}
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY r.date DESC, r.id DESC`;
    const statement = db.prepare(sql);
    const rows = await (binds.length ? statement.bind(...binds) : statement).all();
    return ok(rows.results || []);
  }
  if (method === 'POST') {
    const body = await readJson(context.request);
    const date = dateText(body.date, '日期');
    const characterId = integer(body.character_id, '角色', { required: true, min: 1 });
    await ensureCharacter(db, characterId);
    const cat = category(body.category);
    const title = text(body.title, '名称', { required: true, max: 120 });
    const income = money(body.income, '收入', 0);
    const expense = money(body.expense, '支出', 0);
    const net = round2(income - expense);
    const note = text(body.note, '备注', { max: 500 });
    const dungeon = await resolveDungeon(db, body, cat);
    const result = await db.prepare(`
      INSERT INTO income_records
        (date, character_id, category, title, income, expense, net, note,
         dungeon_id, dungeon_name, bosses_done)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      date, characterId, cat, title, income, expense, net, note,
      dungeon.dungeonId, dungeon.dungeonName, dungeon.bossesDone,
    ).run();
    return ok(await db.prepare(`${INCOME_SELECT} WHERE r.id = ?`).bind(result.meta.last_row_id).first(), 201);
  }
  if (method === 'PUT') {
    const body = await readJson(context.request);
    const id = getId(context.request, body);
    const existing = await db.prepare('SELECT * FROM income_records WHERE id = ?').bind(id).first();
    if (!existing) throw new ApiError('收益记录不存在。', 404);
    const date = body.date === undefined ? existing.date : dateText(body.date, '日期');
    const characterId = body.character_id === undefined
      ? existing.character_id
      : integer(body.character_id, '角色', { required: true, min: 1 });
    await ensureCharacter(db, characterId);
    const cat = body.category === undefined ? existing.category : category(body.category);
    const title = body.title === undefined ? existing.title : text(body.title, '名称', { required: true, max: 120 });
    const income = body.income === undefined ? existing.income : money(body.income, '收入', 0);
    const expense = body.expense === undefined ? existing.expense : money(body.expense, '支出', 0);
    const net = round2(income - expense);
    const note = body.note === undefined ? existing.note : text(body.note, '备注', { max: 500 });
    let dungeon;
    if (cat !== '副本') {
      dungeon = { dungeonId: null, dungeonName: '', bossesDone: null };
    } else if (body.dungeon_id !== undefined || body.dungeon_name !== undefined || body.bosses_done !== undefined) {
      dungeon = await resolveDungeon(db, body, cat);
    } else {
      dungeon = { dungeonId: existing.dungeon_id, dungeonName: existing.dungeon_name, bossesDone: existing.bosses_done };
    }
    if (cat === '副本' && !dungeon.dungeonId && !dungeon.dungeonName) {
      throw new ApiError('分类为副本时，请选择预置副本或手动填写副本名称。');
    }
    await db.prepare(`
      UPDATE income_records
      SET date = ?, character_id = ?, category = ?, title = ?, income = ?, expense = ?,
          net = ?, note = ?, dungeon_id = ?, dungeon_name = ?, bosses_done = ?
      WHERE id = ?
    `).bind(
      date, characterId, cat, title, income, expense, net, note,
      dungeon.dungeonId, dungeon.dungeonName, dungeon.bossesDone, id,
    ).run();
    return ok(await db.prepare(`${INCOME_SELECT} WHERE r.id = ?`).bind(id).first());
  }
  if (method === 'DELETE') {
    const id = getId(context.request);
    const existing = await db.prepare('SELECT id FROM income_records WHERE id = ?').bind(id).first();
    if (!existing) throw new ApiError('收益记录不存在。', 404);
    await db.prepare('DELETE FROM income_records WHERE id = ?').bind(id).run();
    return ok({ id });
  }
  return methodNotAllowed();
}

const EVENT_SELECT = `
  SELECT e.id, e.date, e.character_id, e.type, e.title, e.value, e.note, e.created_at,
         c.name AS character_name, c.server AS character_server,
         a.name AS account_name
  FROM event_records e
  JOIN characters c ON c.id = e.character_id
  JOIN accounts a ON a.id = c.account_id
`;

async function ensureEventType(db, type) {
  const row = await db.prepare('SELECT name FROM event_types WHERE name = ?').bind(type).first();
  if (!row) throw new ApiError('事件类型不存在，请先在设置中初始化事件类型。', 400);
  return row;
}

function valueForType(type, value) {
  if (type === '资历') {
    const n = optionalNumber(value, '资历增量');
    if (n === null) throw new ApiError('类型为资历时，请填写数值（增量）。');
    return n;
  }
  return optionalNumber(value, '数值');
}

async function eventRecords(context, method) {
  const db = getDb(context.env);
  if (method === 'GET') {
    const url = new URL(context.request.url);
    const where = [];
    const binds = [];
    const characterId = url.searchParams.get('character_id');
    const type = url.searchParams.get('type');
    const start = url.searchParams.get('start');
    const end = url.searchParams.get('end');
    if (characterId) {
      where.push('e.character_id = ?');
      binds.push(integer(characterId, '角色 ID', { required: true, min: 1 }));
    }
    if (type) {
      where.push('e.type = ?');
      binds.push(text(type, '事件类型', { required: true, max: 40 }));
    }
    if (start) {
      where.push('e.date >= ?');
      binds.push(dateText(start, '开始日期'));
    }
    if (end) {
      where.push('e.date <= ?');
      binds.push(dateText(end, '结束日期'));
    }
    if (start && end && start > end) throw new ApiError('开始日期不能晚于结束日期。');
    const sql = `${EVENT_SELECT}
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY e.date DESC, e.id DESC`;
    const statement = db.prepare(sql);
    const rows = await (binds.length ? statement.bind(...binds) : statement).all();
    return ok(rows.results || []);
  }
  if (method === 'POST') {
    const body = await readJson(context.request);
    const date = dateText(body.date, '日期');
    const characterId = integer(body.character_id, '角色', { required: true, min: 1 });
    await ensureCharacter(db, characterId);
    const type = text(body.type, '事件类型', { required: true, max: 40 });
    await ensureEventType(db, type);
    const title = text(body.title, '标题', { required: true, max: 120 });
    const value = valueForType(type, body.value);
    const note = text(body.note, '备注', { max: 500 });
    const result = await db.prepare(`
      INSERT INTO event_records (date, character_id, type, title, value, note)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(date, characterId, type, title, value, note).run();
    return ok(await db.prepare(`${EVENT_SELECT} WHERE e.id = ?`).bind(result.meta.last_row_id).first(), 201);
  }
  if (method === 'PUT') {
    const body = await readJson(context.request);
    const id = getId(context.request, body);
    const existing = await db.prepare('SELECT * FROM event_records WHERE id = ?').bind(id).first();
    if (!existing) throw new ApiError('事件记录不存在。', 404);
    const date = body.date === undefined ? existing.date : dateText(body.date, '日期');
    const characterId = body.character_id === undefined
      ? existing.character_id
      : integer(body.character_id, '角色', { required: true, min: 1 });
    await ensureCharacter(db, characterId);
    const type = body.type === undefined ? existing.type : text(body.type, '事件类型', { required: true, max: 40 });
    await ensureEventType(db, type);
    const title = body.title === undefined ? existing.title : text(body.title, '标题', { required: true, max: 120 });
    let value;
    if (body.value === undefined && body.type === undefined) value = existing.value;
    else value = valueForType(type, body.value);
    const note = body.note === undefined ? existing.note : text(body.note, '备注', { max: 500 });
    await db.prepare(`
      UPDATE event_records
      SET date = ?, character_id = ?, type = ?, title = ?, value = ?, note = ?
      WHERE id = ?
    `).bind(date, characterId, type, title, value, note, id).run();
    return ok(await db.prepare(`${EVENT_SELECT} WHERE e.id = ?`).bind(id).first());
  }
  if (method === 'DELETE') {
    const id = getId(context.request);
    const existing = await db.prepare('SELECT id FROM event_records WHERE id = ?').bind(id).first();
    if (!existing) throw new ApiError('事件记录不存在。', 404);
    await db.prepare('DELETE FROM event_records WHERE id = ?').bind(id).run();
    return ok({ id });
  }
  return methodNotAllowed();
}

async function summary(context, method) {
  if (method !== 'GET') return methodNotAllowed();
  const db = getDb(context.env);
  const today = todayInShanghai();
  const week = weekRange(today);
  const [charactersResult, dungeonsResult, incomeResult, progressResult, eventStatsResult, lastEventResult] =
    await Promise.all([
      db.prepare(`
        SELECT c.id, c.account_id, c.name, c.server, c.school, c.note, a.name AS account_name
        FROM characters c
        JOIN accounts a ON a.id = c.account_id
        WHERE c.active = 1
        ORDER BY a.id ASC, c.id ASC
      `).all(),
      db.prepare(`
        SELECT id, name, total_bosses, sort_order FROM dungeons
        WHERE active = 1 ORDER BY sort_order ASC, id ASC
      `).all(),
      db.prepare(`
        SELECT character_id, SUM(income) AS income, SUM(expense) AS expense,
               SUM(net) AS net, COUNT(*) AS record_count
        FROM income_records WHERE date BETWEEN ? AND ? GROUP BY character_id
      `).bind(week.start, week.end).all(),
      db.prepare(`
        SELECT character_id, dungeon_id, MAX(COALESCE(bosses_done, 0)) AS bosses_done
        FROM income_records
        WHERE category = '副本' AND dungeon_id IS NOT NULL AND date BETWEEN ? AND ?
        GROUP BY character_id, dungeon_id
      `).bind(week.start, week.end).all(),
      db.prepare(`
        SELECT character_id, COUNT(*) AS event_count
        FROM event_records WHERE date BETWEEN ? AND ? GROUP BY character_id
      `).bind(week.start, week.end).all(),
      db.prepare(`
        SELECT e.character_id, e.date, e.type, e.title, e.value
        FROM event_records e
        WHERE e.id = (
          SELECT e2.id FROM event_records e2
          WHERE e2.character_id = e.character_id
          ORDER BY e2.date DESC, e2.id DESC LIMIT 1
        )
      `).all(),
    ]);
  const characters = charactersResult.results || [];
  const dungeons = dungeonsResult.results || [];
  const incomeByChar = new Map((incomeResult.results || []).map((r) => [r.character_id, r]));
  const eventStatsByChar = new Map((eventStatsResult.results || []).map((r) => [r.character_id, r]));
  const lastEventByChar = new Map((lastEventResult.results || []).map((r) => [r.character_id, r]));
  const progressByChar = new Map();
  for (const row of progressResult.results || []) {
    if (!progressByChar.has(row.character_id)) progressByChar.set(row.character_id, new Map());
    progressByChar.get(row.character_id).set(row.dungeon_id, Number(row.bosses_done) || 0);
  }
  const rows = characters.map((character) => {
    const income = incomeByChar.get(character.id) || {};
    const eventStats = eventStatsByChar.get(character.id) || {};
    const progressMap = progressByChar.get(character.id) || new Map();
    const dungeonProgress = dungeons.map((dungeon) => {
      const doneRaw = Number(progressMap.get(dungeon.id) || 0);
      const total = Number(dungeon.total_bosses) || 0;
      return {
        dungeon_id: dungeon.id,
        name: dungeon.name,
        total_bosses: total,
        bosses_done: Math.min(doneRaw, total),
        raw_bosses_done: doneRaw,
        cleared: total > 0 && doneRaw >= total,
      };
    });
    const clearedDungeons = dungeonProgress.filter((d) => d.cleared).length;
    const last = lastEventByChar.get(character.id);
    return {
      id: character.id,
      account_id: character.account_id,
      account_name: character.account_name,
      name: character.name,
      server: character.server,
      school: character.school,
      note: character.note,
      week_income: round2(income.income || 0),
      week_expense: round2(income.expense || 0),
      week_net: round2(income.net || 0),
      income_count: Number(income.record_count || 0),
      event_count: Number(eventStats.event_count || 0),
      has_records: Number(income.record_count || 0) + Number(eventStats.event_count || 0) > 0,
      dungeon_progress: dungeonProgress,
      cleared_dungeons: clearedDungeons,
      total_dungeons: dungeonProgress.length,
      all_cleared: dungeonProgress.length > 0 && clearedDungeons === dungeonProgress.length,
      last_event: last ? { date: last.date, type: last.type, title: last.title, value: last.value } : null,
    };
  });
  const totals = rows.reduce((acc, row) => {
    acc.week_income = round2(acc.week_income + row.week_income);
    acc.week_expense = round2(acc.week_expense + row.week_expense);
    acc.week_net = round2(acc.week_net + row.week_net);
    acc.record_count += row.income_count;
    acc.event_count += row.event_count;
    if (row.all_cleared) acc.cleared_characters += 1;
    if (!row.all_cleared) acc.uncleared_characters += 1;
    return acc;
  }, {
    week_income: 0, week_expense: 0, week_net: 0, record_count: 0, event_count: 0,
    cleared_characters: 0, uncleared_characters: 0,
  });
  return ok({
    week_start: week.start,
    week_end: week.end,
    today,
    generated_at: new Date().toISOString(),
    dungeons,
    characters: rows,
    totals: { ...totals, active_characters: rows.length },
  });
}

async function trend(context, method) {
  if (method !== 'GET') return methodNotAllowed();
  const db = getDb(context.env);
  const url = new URL(context.request.url);
  const mode = url.searchParams.get('mode') === 'week' ? 'week' : 'month';
  const today = todayInShanghai();
  const month = url.searchParams.get('month') || today.slice(0, 7);
  let start;
  let end;
  const dateList = [];
  if (mode === 'week') {
    const week = weekRange(today);
    start = week.start;
    end = week.end;
    for (let i = 0; i < 7; i += 1) {
      const [y, m, d] = start.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d + i));
      dateList.push({
        date: dt.toISOString().slice(0, 10),
        label: `${dt.getUTCMonth() + 1}/${dt.getUTCDate()}`,
        weekday: '日一二三四五六'[dt.getUTCDay()],
      });
    }
  } else {
    const info = monthRange(month);
    start = info.start;
    end = info.end;
    for (let day = 1; day <= info.days; day += 1) {
      const iso = `${month}-${String(day).padStart(2, '0')}`;
      const dt = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, day));
      dateList.push({ date: iso, label: String(day), weekday: '日一二三四五六'[dt.getUTCDay()] });
    }
  }
  const rows = await db.prepare(`
    SELECT date, SUM(income) AS income, SUM(expense) AS expense,
           SUM(net) AS net, COUNT(*) AS count
    FROM income_records WHERE date BETWEEN ? AND ? GROUP BY date ORDER BY date ASC
  `).bind(start, end).all();
  const byDate = new Map((rows.results || []).map((r) => [r.date, r]));
  const days = dateList.map((item) => {
    const row = byDate.get(item.date);
    return {
      ...item,
      income: round2(row?.income || 0),
      expense: round2(row?.expense || 0),
      net: round2(row?.net || 0),
      count: Number(row?.count || 0),
    };
  });
  const totals = days.reduce((acc, day) => {
    acc.income = round2(acc.income + day.income);
    acc.expense = round2(acc.expense + day.expense);
    acc.net = round2(acc.net + day.net);
    acc.record_count += day.count;
    return acc;
  }, { income: 0, expense: 0, net: 0, record_count: 0 });
  return ok({
    mode,
    month: mode === 'month' ? month : null,
    week_start: mode === 'week' ? start : null,
    week_end: mode === 'week' ? end : null,
    start,
    end,
    empty: totals.record_count === 0,
    days,
    totals,
  });
}

async function exportData(context, method) {
  if (method !== 'GET') return methodNotAllowed();
  const db = getDb(context.env);
  const tables = ['accounts', 'characters', 'dungeons', 'event_types', 'income_records', 'event_records'];
  const results = await Promise.all(tables.map((table) => db.prepare(`SELECT * FROM ${table} ORDER BY id ASC`).all()));
  const payload = {
    app: 'jx3-income-workbench',
    schema_version: 1,
    exported_at: new Date().toISOString(),
    export_date: todayInShanghai(),
  };
  tables.forEach((table, index) => {
    payload[table] = results[index].results || [];
  });
  const date = todayInShanghai().replaceAll('-', '');
  return new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="jx3-income-backup-${date}.json"`,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

function me(context, method) {
  if (method !== 'GET') return methodNotAllowed();
  const email = context.request.headers.get('Cf-Access-Authenticated-User-Email') || null;
  return ok({ email, authenticated: Boolean(email), local: !email });
}

async function health(context, method) {
  if (method !== 'GET') return methodNotAllowed();
  const db = getDb(context.env);
  const row = await db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM accounts) AS accounts,
      (SELECT COUNT(*) FROM characters) AS characters,
      (SELECT COUNT(*) FROM dungeons) AS dungeons,
      (SELECT COUNT(*) FROM income_records) AS income_records,
      (SELECT COUNT(*) FROM event_records) AS event_records
  `).first();
  return ok({ status: 'ok', counts: row, now: new Date().toISOString() });
}

export async function onRequest(context) {
  try {
    const url = new URL(context.request.url);
    const path = url.pathname.replace(/^\/api\/?/, '').replace(/\/+$/, '');
    const resource = path.split('/').filter(Boolean)[0] || '';
    const method = context.request.method;
    switch (resource) {
      case 'accounts': return await accounts(context, method);
      case 'characters': return await characters(context, method);
      case 'dungeons': return await dungeons(context, method);
      case 'event-types': return await eventTypes(context, method);
      case 'income-records': return await incomeRecords(context, method);
      case 'event-records': return await eventRecords(context, method);
      case 'summary': return await summary(context, method);
      case 'trend': return await trend(context, method);
      case 'export': return await exportData(context, method);
      case 'me': return me(context, method);
      case 'health': return await health(context, method);
      default: return fail('接口不存在。', 404);
    }
  } catch (error) {
    return handleError(error);
  }
}

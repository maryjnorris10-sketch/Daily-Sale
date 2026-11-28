import { getStore } from '@netlify/blobs';

export const config = { path: '/api/*' };

const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json' } });
const bad = (error, s = 400) => json({ error }, s);
const num = v => Math.max(0, +v || 0);

export async function handle(req, S) {
  if (!process.env.APP_PASSWORD) return bad('Netlify-তে APP_PASSWORD সেট করা নেই', 500);
  const pw = Buffer.from(req.headers.get('x-pass') || '', 'base64').toString('utf8');
  if (pw !== process.env.APP_PASSWORD) return bad('পাসওয়ার্ড ভুল', 401);

  const url = new URL(req.url);
  const [route, id] = url.pathname.replace(/^\/api\//, '').split('/');
  const m = req.method;
  const body = ['POST', 'PUT'].includes(m) ? await req.json().catch(() => ({})) : {};

  const getC = key => S.get('c/' + key, { type: 'json' });
  const allC = async () => {
    const { blobs } = await S.list({ prefix: 'c/' });
    const list = await Promise.all(blobs.map(b => S.get(b.key, { type: 'json' })));
    return list.filter(Boolean).sort((a, b) => a.name.localeCompare(b.name, 'bn'));
  };
  const getDMs = async () => (await S.get('dms', { type: 'json' })) || [];
  const getAreas = async () => (await S.get('areas', { type: 'json' })) || [];

  if (route === 'login' && m === 'POST') return json({ user: { shop: process.env.SHOP_NAME || 'হিসাব খাতা' } });

  if (route === 'data' && m === 'GET') {
    const cs = (await allC()).map(({ days, ...c }) => c);
    return json({ customers: cs, dms: await getDMs(), areas: await getAreas() });
  }

  if (route === 'dm' && m === 'POST') {
    const name = (body.name || '').trim();
    if (!name) return bad('নাম দিন');
    const dms = await getDMs();
    const d = { _id: crypto.randomUUID(), name };
    dms.push(d);
    await S.setJSON('dms', dms);
    return json(d);
  }
  if (route === 'dm' && m === 'DELETE') {
    await S.setJSON('dms', (await getDMs()).filter(d => d._id !== id));
    await S.setJSON('areas', (await getAreas()).map(a => a.dm === id ? { ...a, dm: '' } : a));
    for (const c of await allC()) if (c.dm === id) { c.dm = ''; await S.setJSON('c/' + c._id, c); }
    return json({ ok: true });
  }

  if (route === 'area' && m === 'POST') {
    const name = (body.name || '').trim();
    if (!name) return bad('এরিয়ার নাম দিন');
    const areas = await getAreas();
    const a = { _id: crypto.randomUUID(), name, dm: body.dm || '' };
    areas.push(a);
    await S.setJSON('areas', areas);
    return json(a);
  }
  if (route === 'area' && m === 'PUT') {
    const areas = await getAreas();
    const a = areas.find(x => x._id === id);
    if (!a) return bad('এরিয়া পাওয়া যায়নি', 404);
    if (body.name?.trim()) a.name = body.name.trim();
    a.dm = body.dm || '';
    await S.setJSON('areas', areas);
    return json({ ok: true });
  }
  if (route === 'area' && m === 'DELETE') {
    await S.setJSON('areas', (await getAreas()).filter(a => a._id !== id));
    for (const c of await allC()) if (c.area === id) { c.area = ''; await S.setJSON('c/' + c._id, c); }
    return json({ ok: true });
  }

  if (route === 'customer' && m === 'POST') {
    const name = (body.name || '').trim();
    if (!name) return bad('কাস্টমারের নাম দিন');
    const c = { _id: crypto.randomUUID(), name, phone: body.phone || '', dm: body.dm || '', area: body.area || '', opening: +body.opening || 0, days: {} };
    await S.setJSON('c/' + c._id, c);
    return json({ ok: true });
  }
  if (route === 'customer' && m === 'PUT') {
    const c = await getC(id);
    if (!c) return bad('কাস্টমার পাওয়া যায়নি', 404);
    if (body.name?.trim()) c.name = body.name.trim();
    c.phone = body.phone ?? c.phone;
    c.dm = body.dm || '';
    c.area = body.area || '';
    c.opening = +body.opening || 0;
    await S.setJSON('c/' + id, c);
    return json({ ok: true });
  }
  if (route === 'customer' && m === 'DELETE') {
    await S.delete('c/' + id);
    return json({ ok: true });
  }

  if (route === 'day' && m === 'GET') {
    const date = url.searchParams.get('date');
    const am = Object.fromEntries((await getAreas()).map(a => [a._id, a]));
    const rows = (await allC()).map(c => {
      let prev = c.opening || 0;
      for (const [d, e] of Object.entries(c.days || {})) {
        if (d < date) prev += e.morning + e.afternoon - e.ret - e.paid + (e.adj || 0);
        else if (d === date) prev += e.adj || 0;
      }
      const e = (c.days || {})[date] || {};
      return { id: c._id, name: c.name, area: am[c.area] ? c.area : '', dm: (am[c.area] && am[c.area].dm) || c.dm || '', prev, morning: e.morning || 0, afternoon: e.afternoon || 0, ret: e.ret || 0, paid: e.paid || 0 };
    });
    return json(rows);
  }

  if (route === 'entry' && m === 'PUT') {
    const c = await getC(body.customer);
    if (!c) return bad('কাস্টমার পাওয়া যায়নি', 404);
    c.days ||= {};
    const e = c.days[body.date] ||= { morning: 0, afternoon: 0, ret: 0, paid: 0 };
    ['morning', 'afternoon', 'ret', 'paid'].forEach(f => { if (f in body) e[f] = num(body[f]); });
    if ('prev' in body) { // আগের বাকি হাতে ঠিক করা: এই তারিখ থেকে সামনের সব হিসাবে প্রযোজ্য
      let base = c.opening || 0;
      for (const [d, x] of Object.entries(c.days)) if (d < body.date) base += x.morning + x.afternoon - x.ret - x.paid + (x.adj || 0);
      e.adj = (+body.prev || 0) - base;
    }
    await S.setJSON('c/' + c._id, c);
    return json({ ok: true });
  }

  if (route === 'clear' && m === 'PUT') {
    // এই তারিখের সকাল/বিকাল/ফেরত/পেইড মুছে ফেলে, বাকিটা "আগের বাকি" হিসেবে রেখে দেয়
    const { date, ids = [] } = body;
    for (const cid of ids) {
      const c = await getC(cid);
      const e = c?.days?.[date];
      if (!e) continue;
      let base = c.opening || 0;
      for (const [d, x] of Object.entries(c.days)) if (d < date) base += x.morning + x.afternoon - x.ret - x.paid + (x.adj || 0);
      const due = base + (e.adj || 0) + e.morning + e.afternoon - e.ret - e.paid;
      c.days[date] = { morning: 0, afternoon: 0, ret: 0, paid: 0, adj: due - base };
      await S.setJSON('c/' + c._id, c);
    }
    return json({ ok: true });
  }

  return bad('পাওয়া যায়নি', 404);
}

export default async req => {
  try { return await handle(req, getStore({ name: 'hisab', consistency: 'strong' })); }
  catch (e) { console.error(e); return bad('সার্ভারে সমস্যা হয়েছে', 500); }
};

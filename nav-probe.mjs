import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const w of [768, 834, 1023, 1024]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
  const p = await ctx.newPage();
  await p.goto('http://localhost:3213/login');
  await p.fill('input[type=password]', 'rc');
  await p.click('button[type=submit]');
  await p.waitForURL(/\/app/, { timeout: 20000 });
  await p.waitForTimeout(300);
  const r = await p.evaluate(() => {
    const header = document.querySelector('header');
    const row = header.firstElementChild;
    const kids = [...row.children].map((k) => ({
      tag: k.tagName.toLowerCase(),
      label: (k.getAttribute('aria-label') || k.className.slice(0, 24)).slice(0, 28),
      w: Math.round(k.getBoundingClientRect().width),
    }));
    const sum = kids.reduce((s, k) => s + k.w, 0);
    const items = [...row.querySelectorAll('nav ul > li')].map((li) => ({
      label: li.textContent.trim().slice(0, 12),
      left: Math.round(li.getBoundingClientRect().left),
      right: Math.round(li.getBoundingClientRect().right),
    }));
    return { rowWidth: Math.round(row.getBoundingClientRect().width), kids, sum, items };
  });
  console.log(`\n=== viewport ${w} · row ${r.rowWidth}px · children sum ${r.sum}px ===`);
  console.log(r.kids.map((k) => `${k.label}:${k.w}`).join('  '));
  const overlaps = r.items.filter((it, i) => i > 0 && it.left < r.items[i - 1].right);
  console.log('nav items:', r.items.map((i) => `${i.label}[${i.left}-${i.right}]`).join(' '));
  if (overlaps.length) console.log('  ⚠ overlapping:', overlaps.map((o) => o.label).join(', '));
  await ctx.close();
}
await b.close();

// Phone layout regression check (390x844). Fails when a visible element's right edge
// exceeds either the content edge of its own DOM parent (parent's right edge, inset by the
// parent's own padding/border) or the viewport's right edge - the generic signature of
// "child overflows its container" bugs (missing min-width:0 on a flex/grid child, a nowrap
// string, a stale negative margin). Horizontal strips (overflow-x: auto/scroll on a nowrap
// row, like the team tabs) are exempt, since that's an intentional pattern on phone. It also
// fails on text cut off with no ellipsis, and on single-line text truncated below 96px.
//
// The check also injects a couple of deterministic worst-case content probes (a long
// unbroken string in the meeting list, a second toast forced into the DOM) so the result
// does not depend on whatever happens to be in the dev database at the moment - it exercises
// the CSS mechanism itself, the same way the bug was reported with specific long content.
//
// Usage: node scripts/check-phone-layout.mjs [url]
// Defaults to http://127.0.0.1:4199/
import { chromium } from 'playwright-core';

const url = process.argv[2] || 'http://127.0.0.1:4199/';
const VIEWPORT = { width: 390, height: 844 };
const TOLERANCE = 1.5; // px, allow for subpixel rounding

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: VIEWPORT });

try {
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await page.waitForSelector('.topbar', { timeout: 10000 });
  await page.waitForTimeout(3000); // let post-load fetches (meetings, board, goals) paint

  // Worst-case content probes: these reproduce the reported bugs regardless of whatever
  // happens to be in the dev database right now.
  await page.evaluate(() => {
    // 1. Make sure the first meeting is open (it usually already is - clicking an open row
    //    would collapse it and silently skip this probe), then force the long unbroken
    //    strings that blew .meeting-item out to 532px inside its 374px card in the owner's
    //    screenshot: a "could not join: session_id: 20261001_185…" absent line, a transcript
    //    line with a path in it, and a long topic.
    const row = document.querySelector('.meeting-row');
    if (row && row.getAttribute('aria-expanded') !== 'true') row.click();
  });
  await page.waitForTimeout(300);
  const meetingProbed = await page.evaluate(() => {
    const longToken = `session_id:${'20261001_185133_a1b2c3d4e5f6'.repeat(4)}`;
    const lines = document.querySelector('.meeting-item .meeting-lines');
    if (!lines) return false;
    const absent = document.createElement('li');
    absent.className = 'meeting-absent';
    absent.textContent = `🚪 Grace Hopper could not join: ${longToken}`;
    lines.prepend(absent);
    const text = lines.querySelector('.chat-bubble .meeting-text');
    if (text) text.textContent = `/Users/yuma/Documents/Hermes/.hermes/installs/${'a00410ce8b9a457cba31d026e5d78ada'.repeat(3)}`;
    const small = document.querySelector('.meeting-main small');
    if (small) small.textContent = 'X'.repeat(140);
    const topic = document.querySelector('.meeting-main b');
    if (topic) topic.textContent = `Kanban_t_afe92873_${'Router-skill-kits'.repeat(8)}`;
    return true;
  });
  if (!meetingProbed) throw new Error('meeting probe could not open a meeting transcript; the 532px meeting bug would go unchecked');
  await page.evaluate(() => {
    // 2. Force a second toast into the DOM (bypassing the 9s auto-dismiss / staggered
    //    enqueue timing) so the "only one compact toast at a time" rule is exercised even
    //    when nothing is actually happening in the feed right now.
    const stack = document.querySelector('.toast-stack');
    const firstToast = stack?.querySelector('.agent-msg');
    if (stack && firstToast) {
      const clone = firstToast.cloneNode(true);
      stack.insertBefore(clone, firstToast);
    }
  });
  await page.waitForTimeout(300);

  const issues = await page.evaluate(({ viewportWidth, tolerance }) => {
    const describe = (el) => {
      const id = el.id ? `#${el.id}` : '';
      const cls = el.className && typeof el.className === 'string'
        ? `.${el.className.trim().split(/\s+/).slice(0, 3).join('.')}`
        : '';
      return `${el.tagName.toLowerCase()}${id}${cls}`;
    };
    // An intentional horizontal strip scrolls sideways AND lays its children side by side
    // (a nowrap flex row or a column-flow grid). A vertical list that merely has
    // `overflow: auto` (Yuma's desk, max-height list) is not a strip: a row that runs past
    // its edge there is cut text, not content parked off-screen on purpose.
    const isHScrollable = (el) => {
      const cs = getComputedStyle(el);
      if (cs.overflowX !== 'auto' && cs.overflowX !== 'scroll') return false;
      const flexRow = cs.display.includes('flex') && !cs.flexDirection.startsWith('column') && cs.flexWrap === 'nowrap';
      const gridRow = cs.display.includes('grid') && cs.gridAutoFlow.includes('column');
      return flexRow || gridRow;
    };
    // Only two things excuse an overflowing box: it's inside an intentional horizontal-scroll
    // strip (team tabs - the content is reachable, just off the first screenful), or it's
    // decorative (aria-hidden="true", like the vice-sun/grid backdrop) so nothing readable is
    // actually cut off. A generic "overflow: hidden ancestor" exemption is deliberately NOT
    // used here: the app shell itself sets overflow:hidden at the full viewport width, and
    // content clipped there still gets cut off exactly at the screen edge - visually the same
    // defect as overflowing the viewport outright, not a safe exemption.
    const clipState = (el) => {
      if (el.closest('[aria-hidden="true"]')) return 'decorative';
      let p = el.parentElement;
      while (p) {
        if (isHScrollable(p)) return 'scrollable';
        p = p.parentElement;
      }
      return 'none';
    };
    // The content edge is what "its section's right edge" means: the parent's own right
    // edge inset by that parent's padding/border, not the raw border-box edge. A child that
    // ignores the parent's padding (e.g. via a stale negative margin) is overflowing even if
    // it technically stays inside the parent's border box.
    const contentRight = (el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.right - parseFloat(cs.paddingRight || '0') - parseFloat(cs.borderRightWidth || '0');
    };

    const found = [];
    const all = document.querySelectorAll('body *');
    for (const el of all) {
      const tag = el.tagName.toLowerCase();
      if (tag === 'script' || tag === 'style' || tag === 'link') continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      if (rect.right <= 0) continue; // scrolled fully out of view horizontally, not our concern
      if (clipState(el) !== 'none') continue;

      // Viewport check.
      if (rect.right > viewportWidth + tolerance) {
        found.push({ selector: describe(el), kind: 'viewport', right: Math.round(rect.right), bound: viewportWidth });
      }

      // Parent-containment check. Skipped for absolutely/fixed-positioned elements: their
      // placement is intentionally relative to a positioned ancestor (badges, popovers) and
      // a small deliberate bleed past the immediate DOM parent is a normal, accepted pattern -
      // the viewport check above still catches a genuinely broken one.
      if (cs.position !== 'fixed' && cs.position !== 'absolute') {
        const parent = el.parentElement;
        if (parent && parent !== document.body) {
          const bound = contentRight(parent);
          if (parent.getBoundingClientRect().width > 0 && rect.right > bound + tolerance) {
            found.push({ selector: describe(el), kind: 'parent', right: Math.round(rect.right), bound: Math.round(bound), parent: describe(parent) });
          }
        }
      }
    }

    // Cut text: a box that clips its own text (overflow hidden) with no ellipsis or line
    // clamp hides words with no sign that anything is missing. And squeezed text: a label
    // that does end in an ellipsis but has been pushed down to a few characters
    // ("UPCLAS…", "Wh…") is unreadable even though nothing technically overflows.
    const SQUEEZED_PX = 96;
    for (const el of all) {
      if (el.closest('[aria-hidden="true"], .toast-stack')) continue;
      const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!hasText) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.bottom < 0 || rect.right <= 0) continue;
      if (clipState(el) !== 'none') continue;
      const truncated = el.scrollWidth > el.clientWidth + 1;
      if (!truncated) continue;
      const clipped = cs.overflowX === 'hidden' || cs.overflowX === 'clip';
      const marked = cs.textOverflow === 'ellipsis' || (cs.webkitLineClamp && cs.webkitLineClamp !== 'none');
      if (clipped && !marked) {
        found.push({ selector: describe(el), kind: 'cut-text', right: el.scrollWidth, bound: el.clientWidth });
      } else if (cs.textOverflow === 'ellipsis' && cs.whiteSpace === 'nowrap' && el.clientWidth < SQUEEZED_PX) {
        // Single-line only: a multi-line clamp at 83px still shows a readable phrase.
        found.push({ selector: describe(el), kind: 'squeezed', right: Math.round(el.clientWidth), bound: SQUEEZED_PX, text: el.textContent.trim().slice(0, 40) });
      }
    }

    // One-compact-toast rule: at most one toast may be visible at a time on phone.
    const visibleToasts = [...document.querySelectorAll('.toast-stack .agent-msg')]
      .filter((el) => getComputedStyle(el).display !== 'none');
    if (visibleToasts.length > 1) {
      found.push({ selector: '.toast-stack .agent-msg', kind: 'toast-count', right: visibleToasts.length, bound: 1 });
    }

    return found;
  }, { viewportWidth: VIEWPORT.width, tolerance: TOLERANCE });

  if (issues.length === 0) {
    console.log(`PASS: no element overflows its container or the ${VIEWPORT.width}px viewport; no cut or squeezed text; at most one toast is visible.`);
    await browser.close();
    process.exit(0);
  }

  console.error(`FAIL: ${issues.length} overflow(s) at ${VIEWPORT.width}x${VIEWPORT.height}:`);
  const seen = new Set();
  for (const issue of issues) {
    const key = `${issue.kind}:${issue.selector}:${issue.parent || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (issue.kind === 'viewport') {
      console.error(`  [viewport]    ${issue.selector} right=${issue.right}px > viewport=${issue.bound}px`);
    } else if (issue.kind === 'cut-text') {
      console.error(`  [cut-text]    ${issue.selector} text needs ${issue.right}px, shows ${issue.bound}px with no ellipsis`);
    } else if (issue.kind === 'squeezed') {
      console.error(`  [squeezed]    ${issue.selector} "${issue.text}" truncated to ${issue.right}px (< ${issue.bound}px readable minimum)`);
    } else if (issue.kind === 'toast-count') {
      console.error(`  [toast-count] ${issue.right} toasts visible at once; expected at most ${issue.bound}`);
    } else {
      console.error(`  [parent]      ${issue.selector} right=${issue.right}px > ${issue.parent} content-right=${issue.bound}px`);
    }
  }
  await browser.close();
  process.exit(1);
} catch (error) {
  console.error('Check errored:', error instanceof Error ? error.message : String(error));
  await browser.close();
  process.exit(1);
}

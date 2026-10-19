/* UNLEASHED.NEWS — splash page behaviour: the logo board follows the pointer, the first-alert sign-up, and the
   Fire Alert simulation (a post's reposts per minute climb past the threshold, the event is detected, investigated,
   confirmed and published first, on a loop). */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ---------- the logo board turns toward the pointer (a mouse, Reduce Motion off) ---------- */
  const board = $('#board');
  if (board && fine && !reduce) {
    let raf = 0, tx = 0, ty = 0;
    const apply = () => { raf = 0; board.style.setProperty('--rx', `${ty.toFixed(2)}deg`); board.style.setProperty('--ry', `${tx.toFixed(2)}deg`); };
    board.addEventListener('pointerenter', () => board.classList.add('is-live'));
    board.addEventListener('pointermove', (e) => {
      const r = board.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width - 0.5) * 14;    // left/right turns the board around its vertical axis
      ty = (0.5 - (e.clientY - r.top) / r.height) * 10;    // up/down tips it back
      if (!raf) raf = requestAnimationFrame(apply);
    });
    board.addEventListener('pointerleave', () => { tx = ty = 0; apply(); board.classList.remove('is-live'); });
  }

  /* ---------- the first-alert sign-up: addresses go to Jason's PitchZing list, filed under unleashed.news.
     One that cannot be sent (no signal) is kept on this device and sent again on the next visit. ---------- */
  const SIGNUP_URL = 'https://pitchzing-haro.pitchzing.workers.dev/public/book-site/notify', QKEY = 'unl_signup_queue';
  const form = $('#alert'), email = $('#alertEmail'), btn = $('#alertBtn'), note = $('#alertNote');
  const defaultNote = note ? note.textContent : '';
  const body = (addr) => ({ email: addr, role: 'reader', site: 'unleashed.news', page: location.pathname + location.search });
  const send = async (b) => {
    const r = await fetch(SIGNUP_URL, { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
    let j = {}; try { j = await r.json(); } catch {}
    return { ok: r.ok, status: r.status, error: j.error };
  };
  const readQ = () => { try { const q = JSON.parse(localStorage.getItem(QKEY) || '[]'); return Array.isArray(q) ? q : []; } catch { return []; } };
  const writeQ = (q) => { try { if (q.length) localStorage.setItem(QKEY, JSON.stringify(q.slice(-10))); else localStorage.removeItem(QKEY); } catch {} };
  const flushQ = async () => {
    const left = [];
    for (const b of readQ()) { try { const r = await send(b); if (!r.ok && r.status !== 400) left.push(b); } catch { left.push(b); } }
    writeQ(left);
  };
  if (readQ().length) setTimeout(flushQ, 1500);
  addEventListener('online', flushQ);

  if (form && email && btn && note) {
    const say = (cls, text) => { form.classList.remove('is-done', 'is-error'); if (cls) form.classList.add(cls); note.textContent = text; };
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const addr = email.value.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(addr)) { say('is-error', 'Please enter a valid email address.'); email.focus(); return; }
      btn.disabled = true; say('', 'Adding you to the list…');
      try {
        const r = await send(body(addr));
        if (r.ok) { try { localStorage.setItem('unl_email', addr); } catch {} say('is-done', `You're on the list. The first alert goes to ${addr}.`); email.value = ''; }
        else if (r.status === 400 || r.status === 429) say('is-error', r.error || 'That address was not accepted. Please check it and try again.');
        else { writeQ([...readQ().filter((b) => b.email !== addr), body(addr)]); say('is-done', `You're on the list. The first alert goes to ${addr}.`); email.value = ''; }
      } catch {
        // no signal: keep it here and send it on the next visit; the visitor is on the list either way
        writeQ([...readQ().filter((b) => b.email !== addr), body(addr)]);
        say('is-done', `You're on the list. The first alert goes to ${addr}.`); email.value = '';
      }
      btn.disabled = false;
    });
    email.addEventListener('input', () => { if (form.classList.contains('is-error')) say('', defaultNote); });
  }

  /* ---------- the Fire Alert simulation ---------- */
  const fire = $('#fire'), rtpmEl = $('#rtpm'), ageEl = $('#fireAge'), canvas = $('#spark'), stepsEl = $('#fireSteps'), threshEl = $('#fireThresh');
  if (fire && rtpmEl && canvas && stepsEl) {
    const steps = [...stepsEl.children];
    // The threshold here is for the picture only. The real one is Unleashed's own business and is not published
    // anywhere on this site (Jason, 2026-10-19); the board's line carries no number.
    const THRESH = 460, CYCLE = 15000;   // ms per loop
    const ctx = canvas.getContext('2d');
    const css = getComputedStyle(document.documentElement);
    const C = { hot: css.getPropertyValue('--hot').trim() || '#ff2e9a', cyan: css.getPropertyValue('--cyan').trim() || '#27d3ff', blu: css.getPropertyValue('--blu').trim() || '#1f6cff' };
    const pts = [];
    const sizeCanvas = () => { const r = canvas.getBoundingClientRect(); const dpr = Math.min(devicePixelRatio || 1, 2); canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr); };
    sizeCanvas(); addEventListener('resize', sizeCanvas);

    // the share rate over the first 6 s of a cycle: a slow burn, then the spike past the threshold
    const rate = (t) => {   // t in [0, 1]
      const burn = 20 + 90 * t;
      const spike = t < 0.55 ? 0 : 760 * Math.pow((t - 0.55) / 0.45, 2.2);
      return burn + spike;
    };
    const noise = (t) => Math.sin(t * 61) * 9 + Math.sin(t * 23) * 6;

    const draw = (progress, hot) => {
      const w = canvas.width, h = canvas.height, pad = 8 * (w / 600);
      ctx.clearRect(0, 0, w, h);
      const max = 900, y = (v) => h - pad - (v / max) * (h - 2 * pad), x = (i) => pad + (i / 119) * (w - 2 * pad);
      // the threshold line: a quiet cyan dash until the curve crosses it, then hot and flashing (Jason, 2026-10-19:
      // "that dotted line can begin to flash as an indication the threshold has been crossed and triggered"); a slow
      // pulse rather than a strobe with Reduce Motion
      const flashOn = !hot || Math.floor(performance.now() / (reduce ? 700 : 260)) % 2 === 0;
      ctx.setLineDash([6, 6]); ctx.lineWidth = hot ? 2 * (w / 600) : 1;
      ctx.strokeStyle = hot ? (flashOn ? C.hot : 'rgba(255,46,154,0.25)') : 'rgba(39,211,255,0.55)';
      ctx.shadowColor = hot && flashOn ? C.hot : 'transparent'; ctx.shadowBlur = hot && flashOn ? 10 * (w / 600) : 0;
      ctx.beginPath(); ctx.moveTo(pad, y(THRESH)); ctx.lineTo(w - pad, y(THRESH)); ctx.stroke();
      ctx.setLineDash([]); ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
      if (!pts.length) return;
      // the curve, filled below
      const grad = ctx.createLinearGradient(0, 0, w, 0); grad.addColorStop(0, C.blu); grad.addColorStop(0.7, C.cyan); grad.addColorStop(1, C.hot);
      ctx.beginPath(); ctx.moveTo(x(0), y(pts[0]));
      pts.forEach((v, i) => ctx.lineTo(x(i), y(v)));
      ctx.strokeStyle = grad; ctx.lineWidth = 2.5 * (w / 600); ctx.lineJoin = 'round'; ctx.stroke();
      ctx.lineTo(x(pts.length - 1), h - pad); ctx.lineTo(x(0), h - pad); ctx.closePath();
      const fill = ctx.createLinearGradient(0, 0, 0, h); fill.addColorStop(0, hot ? 'rgba(255,46,154,0.35)' : 'rgba(39,211,255,0.28)'); fill.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = fill; ctx.fill();
      // the live point
      const lx = x(pts.length - 1), ly = y(pts[pts.length - 1]);
      ctx.beginPath(); ctx.arc(lx, ly, 4 * (w / 600), 0, Math.PI * 2); ctx.fillStyle = hot ? C.hot : C.cyan; ctx.fill();
      if (hot) { ctx.beginPath(); ctx.arc(lx, ly, (9 + 5 * Math.sin(progress * 40)) * (w / 600), 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,46,154,0.5)'; ctx.lineWidth = 1.5; ctx.stroke(); }
    };
    const light = (n, hot) => steps.forEach((li, i) => { li.classList.toggle('on', i < n); li.classList.toggle('hot', hot && i < 2); });
    // the chart's label: "threshold" until the crossing, then the alert
    const hit = (on) => { if (!threshEl) return; threshEl.classList.toggle('fire__thresh--hit', on); threshEl.textContent = on ? 'threshold crossed · investigation triggered' : 'threshold'; };
    const pad2 = (n) => String(n).padStart(2, '0');
    const showAge = (ms) => { if (!ageEl) return; const s = Math.floor(ms / 1000); ageEl.textContent = `${pad2(Math.floor(s / 3600))}:${pad2(Math.floor((s % 3600) / 60))}:${pad2(s % 60)} since posted`; };

    // The board loops for everyone, Reduce Motion or not (Jason, 2026-10-19: "this traveling graph dot needs to be
    // on loop"): the climb and the crossing are the point of it. Reduce Motion still slows the crossed line's flash.
    {
      let start = 0, crossed = false;
      hit(false);
      const frame = (now) => {
        if (!start) start = now;
        const t = (now - start) % CYCLE, p = t / CYCLE;
        const climb = 6000;   // the first 6 s: the rate climbs
        if (t < climb) {
          const q = t / climb, n = Math.min(120, Math.floor(q * 120) + 1);
          pts.length = 0; for (let i = 0; i < n; i++) pts.push(Math.max(4, rate(i / 119) + noise(i / 119)));
          const v = Math.round(pts[pts.length - 1]);
          rtpmEl.textContent = String(v);
          if (!crossed && v >= THRESH) { crossed = true; fire.classList.add('is-hot'); hit(true); light(1, true); setTimeout(() => light(2, true), 450); }
          if (t < 150 && crossed) { crossed = false; fire.classList.remove('is-hot'); hit(false); light(0, false); }
          showAge(t * 40);
        } else {
          const v = 740 + Math.round(Math.sin(t / 300) * 14);
          rtpmEl.textContent = String(v);
          if (t > 7800) light(3, true);
          if (t > 10200) light(4, true);
          if (t > 12400) light(5, true);
          showAge(240000 + (t - climb) * 12);
        }
        draw(p, crossed);
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    }
  }

  const year = $('#year'); if (year) year.textContent = String(new Date().getFullYear());
})();

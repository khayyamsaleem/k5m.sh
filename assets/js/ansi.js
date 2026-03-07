import { AnsiUp } from 'ansi_up';

document.querySelectorAll('pre.ansi').forEach(el => {
  const au = new AnsiUp();
  const raw = el.textContent.replace(/\\x1b/g, '\x1b');
  el.innerHTML = au.ansi_to_html(raw);
});

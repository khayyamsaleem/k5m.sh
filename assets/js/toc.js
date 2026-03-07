const toc = document.getElementById('toc');
if (toc) {
  const links = toc.querySelectorAll('a');
  const ids = Array.from(links).map(a => a.getAttribute('href').slice(1));
  const headings = ids.map(id => document.getElementById(id)).filter(Boolean);

  if (headings.length) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          links.forEach(a => a.classList.remove('active'));
          const active = toc.querySelector(`a[href="#${entry.target.id}"]`);
          if (active) active.classList.add('active');
        }
      });
    }, { rootMargin: '0px 0px -70% 0px' });

    headings.forEach(h => observer.observe(h));
  }
}

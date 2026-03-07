document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.createElement('div');
  overlay.className = 'lightbox';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  document.body.appendChild(overlay);

  const close = () => {
    overlay.classList.remove('active');
    overlay.innerHTML = '';
  };

  overlay.addEventListener('click', close);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  document.querySelectorAll('article figure').forEach((fig) => {
    const img = fig.querySelector('img');
    if (!img) return;

    fig.style.cursor = 'zoom-in';
    fig.addEventListener('click', (e) => {
      e.stopPropagation();
      const clone = document.createElement('img');
      clone.src = img.src;
      clone.alt = img.alt || '';

      const caption = fig.querySelector('figcaption');
      if (caption) {
        const cap = document.createElement('p');
        cap.className = 'lightbox-caption';
        cap.textContent = caption.textContent;
        overlay.appendChild(clone);
        overlay.appendChild(cap);
      } else {
        overlay.appendChild(clone);
      }

      overlay.classList.add('active');
    });
  });
});

// Google Maps hover preview — desktop only
;(() => {
  // Only enable on devices with a fine pointer (mouse)
  if (!matchMedia('(pointer: fine)').matches) return

  let popup = null
  let currentLink = null
  let showTimeout = null
  let hideTimeout = null

  function createPopup() {
    const el = document.createElement('div')
    el.className = 'maps-preview'
    el.innerHTML = '<iframe loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>'
    document.body.appendChild(el)
    return el
  }

  function embedUrl(query, coords) {
    // Use coordinates for precise location when available
    if (coords) {
      const decoded = decodeURIComponent(query.replace(/\+/g, ' '))
      return 'https://maps.google.com/maps?q=' + encodeURIComponent(decoded) + '&ll=' + coords + '&z=17&output=embed'
    }
    const decoded = decodeURIComponent(query.replace(/\+/g, ' '))
    return 'https://maps.google.com/maps?q=' + encodeURIComponent(decoded) + '&output=embed'
  }

  function show(link) {
    if (!popup) popup = createPopup()
    const query = link.dataset.mapsQuery
    if (!query) return

    const coords = link.dataset.mapsCoords || ''
    const iframe = popup.querySelector('iframe')
    const src = embedUrl(query, coords)
    if (iframe.src !== src) iframe.src = src

    // Position the popup above or below the link
    const rect = link.getBoundingClientRect()
    const popupHeight = 300
    const popupWidth = 400
    const margin = 12

    let top, left

    // Prefer above the link
    if (rect.top > popupHeight + margin) {
      top = rect.top - popupHeight - margin + window.scrollY
    } else {
      top = rect.bottom + margin + window.scrollY
    }

    left = rect.left + (rect.width / 2) - (popupWidth / 2) + window.scrollX
    // Clamp to viewport
    left = Math.max(8, Math.min(left, window.innerWidth - popupWidth - 8))

    popup.style.top = top + 'px'
    popup.style.left = left + 'px'
    popup.classList.add('visible')
    currentLink = link
  }

  function hide() {
    if (popup) {
      popup.classList.remove('visible')
      currentLink = null
    }
  }

  document.addEventListener('pointerenter', (e) => {
    const link = e.target.closest('a.maps-link')
    if (!link) return
    clearTimeout(hideTimeout)
    showTimeout = setTimeout(() => show(link), 300)
  }, true)

  document.addEventListener('pointerleave', (e) => {
    const link = e.target.closest('a.maps-link')
    if (!link && e.target !== popup && !popup?.contains(e.target)) return
    clearTimeout(showTimeout)
    hideTimeout = setTimeout(hide, 200)
  }, true)

  // Keep popup open when hovering the popup itself
  document.addEventListener('pointerenter', (e) => {
    if (popup && (e.target === popup || popup.contains(e.target))) {
      clearTimeout(hideTimeout)
    }
  }, true)

  document.addEventListener('pointerleave', (e) => {
    if (popup && (e.target === popup || popup.contains(e.target))) {
      hideTimeout = setTimeout(hide, 200)
    }
  }, true)
})()

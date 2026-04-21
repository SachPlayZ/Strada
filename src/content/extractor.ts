export interface ExtractedCopyInline {
  url: string
  title: string
  headlines: string[]
  ctas: string[]
  valueProps: string[]
  bodyText: string
  extractedAt: number
}

export function extract(): ExtractedCopyInline {
  function normalizeWS(s: string): string {
    return s.replace(/\s+/g, ' ').trim()
  }

  function isVisible(el: Element): boolean {
    const style = window.getComputedStyle(el)
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0'
  }

  // Headlines: H1/H2/H3, trimmed, deduped, max 20
  const headlineEls = Array.from(document.querySelectorAll('h1, h2, h3'))
  const headlinesSeen = new Set<string>()
  const headlines: string[] = []
  for (const el of headlineEls) {
    const text = normalizeWS(el.textContent || '')
    if (text && !headlinesSeen.has(text)) {
      headlinesSeen.add(text)
      headlines.push(text)
      if (headlines.length >= 20) break
    }
  }

  // CTAs: buttons, submit inputs, action-verb links/role=button
  const actionVerbRe = /^(get|start|try|sign|buy|download|book|request|learn|see|explore|join)\b/i
  const ctaCandidates = Array.from(
    document.querySelectorAll('button, input[type="submit"], a, [role="button"]')
  )
  const ctasSeen = new Set<string>()
  const ctas: string[] = []
  for (const el of ctaCandidates) {
    const tag = el.tagName.toLowerCase()
    const text = normalizeWS(
      tag === 'input' ? (el as HTMLInputElement).value : el.textContent || ''
    )
    if (!text) continue
    const isButton = tag === 'button' || tag === 'input' || el.getAttribute('role') === 'button'
    const isActionLink = tag === 'a' && actionVerbRe.test(text)
    if ((isButton || isActionLink) && !ctasSeen.has(text)) {
      ctasSeen.add(text)
      ctas.push(text)
      if (ctas.length >= 30) break
    }
  }

  // Value props: first H1, first para after H1, meta description, og:description
  const valueProps: string[] = []
  const h1 = document.querySelector('h1')
  if (h1) {
    const h1Text = normalizeWS(h1.textContent || '')
    if (h1Text) valueProps.push(h1Text)

    let sibling = h1.nextElementSibling
    while (sibling) {
      if (sibling.tagName.toLowerCase() === 'p') {
        const t = normalizeWS(sibling.textContent || '')
        if (t) { valueProps.push(t); break }
      }
      sibling = sibling.nextElementSibling
    }
  }
  const metaDesc = document.querySelector('meta[name="description"]')?.getAttribute('content')
  if (metaDesc) valueProps.push(normalizeWS(metaDesc))
  const ogDesc = document.querySelector('meta[property="og:description"]')?.getAttribute('content')
  if (ogDesc) valueProps.push(normalizeWS(ogDesc))

  // Body text: visible <p> > 40 chars, outside nav/footer/aside/role=navigation/aria-hidden
  const excludedSelectors = 'nav, footer, aside, [role="navigation"], [aria-hidden="true"]'
  const paragraphs = Array.from(document.querySelectorAll('p'))
  const bodyParts: string[] = []
  for (const p of paragraphs) {
    if (p.closest(excludedSelectors)) continue
    if (!isVisible(p)) continue
    const text = normalizeWS(p.textContent || '')
    if (text.length > 40) bodyParts.push(text)
  }
  const rawBody = bodyParts.join('\n\n')
  const bodyText = rawBody.length > 8000 ? rawBody.slice(0, 8000) : rawBody

  return {
    url: location.href,
    title: document.title,
    headlines,
    ctas,
    valueProps,
    bodyText,
    extractedAt: Date.now(),
  }
}

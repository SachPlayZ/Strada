/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { extract } from './extractor'

function setBody(html: string) {
  document.body.innerHTML = html
}

describe('extract — whitespace preservation', () => {
  beforeEach(() => {
    document.head.innerHTML = '<title>Test</title>'
    document.body.innerHTML = ''
  })

  it('preserves whitespace across <br> inside a headline (engageos.ai regression)', () => {
    // Real H1 from engageos.ai — no whitespace around <br>, followed by an inline span.
    // textContent and (in some engines) innerText collapse this into "ThatConvert".
    setBody(
      '<h1>Build AI Agents That<br><span class="hero-highlight">Convert &amp; Engage</span></h1>',
    )
    const out = extract()
    expect(out.headlines[0]).toBe('Build AI Agents That Convert & Engage')
    expect(out.valueProps[0]).toBe('Build AI Agents That Convert & Engage')
  })

  it('handles adjacent inline spans with no separator', () => {
    setBody('<h1><span>Foo</span><span>Bar</span></h1>')
    const out = extract()
    expect(out.headlines[0]).toBe('FooBar')
  })

  it('inserts whitespace between block-level descendants', () => {
    setBody('<h2><div>First block</div><div>Second block</div></h2>')
    const out = extract()
    expect(out.headlines[0]).toBe('First block Second block')
  })

  it('collapses multiple br/whitespace into a single space', () => {
    setBody('<h1>One<br><br>   <br>Two</h1>')
    const out = extract()
    expect(out.headlines[0]).toBe('One Two')
  })

  it('trims leading/trailing whitespace from the wrapper', () => {
    setBody(`<h1>
      Hello<br>World
    </h1>`)
    const out = extract()
    expect(out.headlines[0]).toBe('Hello World')
  })
})

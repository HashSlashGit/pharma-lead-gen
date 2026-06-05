/**
 * Converts a plain-text email body into HTML that preserves formatting in Gmail.
 *
 * Rules applied (in order):
 *  1. Escape &, <, > so template content is never interpreted as HTML tags
 *  2. Normalize \r\n / \r to \n
 *  3. Split on 2+ consecutive newlines → paragraph boundaries
 *  4. Within each paragraph, split on single \n → <br> between lines
 *  5. Wrap each paragraph in <p> with bottom margin for spacing
 *  6. Wrap everything in a minimal outer <div> — no heavy styling
 *
 * Bullet lines beginning with • are kept as-is inside their paragraph;
 * the <br> joining handles the indented list appearance.
 */
export function formatEmailBodyAsHtml(plainText: string): string {
  const escaped = plainText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const normalized = escaped.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const paragraphs = normalized.split(/\n{2,}/);

  const htmlParagraphs = paragraphs
    .map((para) => para.trim())
    .filter((para) => para.length > 0)
    .map((para) => {
      const inner = para.split('\n').join('<br>');
      return `<p style="margin:0 0 16px 0;">${inner}</p>`;
    });

  return `<div style="font-family:sans-serif;font-size:14px;line-height:1.6;color:#333;">${htmlParagraphs.join('')}</div>`;
}

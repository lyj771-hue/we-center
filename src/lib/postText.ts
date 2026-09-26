// 게시글 HTML을 목록 미리보기용 텍스트로 바꾸는 도우미 (메모 보드·스크랩북 공용)

export const toText = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

/** 게시글 HTML을 문단 텍스트 배열로 — 빈 줄(\n\n)이나 <p>·<br>로 나뉜 문단을 살린다 */
export const toParagraphs = (html: string): string[] =>
  html
    .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .split(/\n\s*\n/)
    .map(toText)
    .filter(Boolean);

export const excerpt = (text: string, max = 60) => (text.length > max ? `${text.slice(0, max).trim()}…` : text);

/** 본문 HTML에 들어 있는 사진 주소들 (편집기로 넣은 <img>) */
export const extractImages = (html: string): string[] =>
  Array.from(html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi), m => m[1]);

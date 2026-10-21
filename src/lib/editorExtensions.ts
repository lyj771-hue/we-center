import { Extension, Node, mergeAttributes } from '@tiptap/core';
import Blockquote from '@tiptap/extension-blockquote';
import HorizontalRule from '@tiptap/extension-horizontal-rule';

// 글쓰기 에디터(네이버 블로그처럼) — 사이트에서 따로 만든 블록들.
// 모두 HTML로 저장되고, 게시글 화면(RichContent)은 globals.css 의 .rich-content 규칙으로 같은 모양을 그린다.

/** 인용구 모양 — line(왼쪽 줄) · quote(따옴표) · box(상자) · bubble(말풍선) */
export const QUOTE_STYLES = [
  { key: 'line', label: '세로줄' },
  { key: 'quote', label: '따옴표' },
  { key: 'box', label: '상자' },
  { key: 'bubble', label: '말풍선' },
] as const;
export const StyledBlockquote = Blockquote.extend({
  addAttributes() {
    return {
      variant: {
        default: 'line',
        parseHTML: el => el.getAttribute('data-style') || 'line',
        renderHTML: a => ({ 'data-style': a.variant }),
      },
    };
  },
});

/** 구분선 모양 — line(가는 줄) · dashed(점선) · double(두 줄) · dots(가운데 점 셋) · short(짧은 줄) */
export const DIVIDER_STYLES = [
  { key: 'line', label: '가는 줄' },
  { key: 'dashed', label: '점선' },
  { key: 'double', label: '두 줄' },
  { key: 'dots', label: '• • •' },
  { key: 'short', label: '짧은 줄' },
] as const;
export const StyledHorizontalRule = HorizontalRule.extend({
  addAttributes() {
    return {
      variant: {
        default: 'line',
        parseHTML: el => el.getAttribute('data-style') || 'line',
        renderHTML: a => ({ 'data-style': a.variant }),
      },
    };
  },
});

/** 줄 간격 — 문단·제목에 line-height */
export const LINE_HEIGHTS = [
  { label: '보통', value: '' },
  { label: '좁게', value: '1.5' },
  { label: '넓게', value: '2.2' },
  { label: '아주 넓게', value: '2.8' },
];
export const LineHeight = Extension.create({
  name: 'lineHeight',
  addGlobalAttributes() {
    return [{
      types: ['paragraph', 'heading'],
      attributes: {
        lineHeight: {
          default: null,
          parseHTML: el => el.style.lineHeight || null,
          renderHTML: a => (a.lineHeight ? { style: `line-height: ${a.lineHeight}` } : {}),
        },
      },
    }];
  },
});

/** 사진 여러 장 — row(한 줄에 나란히, 콜라주) · slide(옆으로 넘겨 보기) */
export const Gallery = Node.create({
  name: 'gallery',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      layout: { default: 'row', parseHTML: el => el.getAttribute('data-gallery') || 'row', renderHTML: () => ({}) },
      images: {
        default: [] as string[],
        parseHTML: el => Array.from(el.querySelectorAll('img')).map(i => i.getAttribute('src') ?? '').filter(Boolean),
        renderHTML: () => ({}),
      },
    };
  },
  parseHTML() { return [{ tag: 'div[data-gallery]', priority: 1000 }]; },
  renderHTML({ node }) {
    const imgs = (node.attrs.images as string[]).map(src => ['img', { src, alt: '' }]);
    return ['div', { 'data-gallery': node.attrs.layout, class: `post-gallery post-gallery-${node.attrs.layout}`, 'data-count': String(imgs.length) }, ...imgs];
  },
});

const enc = encodeURIComponent;
/** 장소 카드 — 가게 이름 · 주소, 네이버지도·카카오맵 바로가기 */
export const PlaceCard = Node.create({
  name: 'placeCard',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      name: { default: '', parseHTML: el => el.getAttribute('data-name') ?? '', renderHTML: () => ({}) },
      address: { default: '', parseHTML: el => el.getAttribute('data-address') ?? '', renderHTML: () => ({}) },
    };
  },
  parseHTML() { return [{ tag: 'div[data-place]', priority: 1000 }]; },
  renderHTML({ node }) {
    const { name, address } = node.attrs as { name: string; address: string };
    const q = `${name} ${address}`.trim();
    return ['div', { 'data-place': '', 'data-name': name, 'data-address': address, class: 'place-card' },
      ['span', { class: 'place-pin' }, '📍'],
      ['span', { class: 'place-body' },
        ['strong', {}, name],
        ['span', { class: 'place-addr' }, address],
        ['span', { class: 'place-links' },
          ['a', { href: `https://map.naver.com/p/search/${enc(q)}`, target: '_blank', rel: 'noopener noreferrer' }, '네이버지도'],
          ['a', { href: `https://map.kakao.com/link/search/${enc(q)}`, target: '_blank', rel: 'noopener noreferrer' }, '카카오맵'],
        ],
      ],
    ];
  },
});

/** 링크 카드 — 사이트 제목·설명·대표 그림 (주소를 넣으면 서버가 읽어 온다) */
export const LinkCard = Node.create({
  name: 'linkCard',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    const a = (name: string) => ({ default: '', parseHTML: (el: HTMLElement) => el.getAttribute(`data-${name}`) ?? '', renderHTML: () => ({}) });
    return { url: a('url'), title: a('title'), description: a('description'), image: a('image') };
  },
  parseHTML() { return [{ tag: 'a[data-link-card]', priority: 1000 }]; },
  renderHTML({ node }) {
    const { url, title, description, image } = node.attrs as Record<string, string>;
    let host = url;
    try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { /* 그대로 */ }
    return ['a', mergeAttributes({
      'data-link-card': '', 'data-url': url, 'data-title': title, 'data-description': description, 'data-image': image,
      href: url, target: '_blank', rel: 'noopener noreferrer', class: `link-card${image ? '' : ' no-image'}`,
    }),
      ...(image ? [['span', { class: 'lc-thumb' }, ['img', { src: image, alt: '' }]]] : []),
      ['span', { class: 'lc-body' },
        ['strong', {}, title || host],
        ...(description ? [['span', { class: 'lc-desc' }, description]] : []),
        ['span', { class: 'lc-host' }, host],
      ],
    ];
  },
});

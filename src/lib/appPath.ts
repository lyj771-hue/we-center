/** 보호자 앱 화면인지 — /app 과 그 아래 (홈페이지 머리말·꼬리말·닉네임 창을 숨긴다) */
export const isAppPath = (pathname: string | null | undefined) => !!pathname && (pathname === '/app' || pathname.startsWith('/app/'));

/** 앱의 [홈페이지] 탭 화면인지 — 홈페이지 머리말(☰ 메뉴)·꼬리말을 그대로 보여 준다 */
export const isAppSitePath = (pathname: string) => pathname === '/app' || pathname === '/app/site' || pathname.startsWith('/app/site/');

const SITE = ['/we-center', '/we-subjects', '/payment', '/location', '/privacy', '/notices', '/we-thoughts', '/etc', '/we-slang'];

/** 홈페이지 주소 → 앱 안 주소. 앱에서 홈페이지 링크를 누르면 앱 밖으로 나가지 않게 바꿔 연다. 바꿀 게 없으면 null */
export function toAppHref(path: string): string | null {
  if (path === '/') return '/app';
  if (SITE.some(p => path === p || path.startsWith(p + '/'))) return `/app/site${path}`;
  if (path === '/mypage') return '/app/pay';
  if (path === '/schedule' || path === '/schedule/uijeongbu') return '/app/class';
  if (path.startsWith('/schedule/')) return `/app/book/${path.slice('/schedule/'.length)}`;
  return null;
}

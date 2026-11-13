/** 보호자 앱 화면인지 — /app 과 그 아래 (홈페이지 머리말·꼬리말·닉네임 창을 숨긴다) */
export const isAppPath = (pathname: string | null | undefined) => !!pathname && (pathname === '/app' || pathname.startsWith('/app/'));

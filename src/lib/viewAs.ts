import { supabase } from './supabaseClient';

// 선생님이 정해진 아이 보호자 화면을 볼 때(supabase/teacher-view-child.sql) — 마이페이지 함수를 그 아이 보호자 기준으로 대신 부른다(읽기만).
// 보호자 앱이 선생님 [아이] 탭을 열 때 setViewChild(아이 id), 아니면 null. null 이면 평소처럼 내 함수를 부른다.

let viewChild: string | null = null;
export const setViewChild = (id: string | null) => { viewChild = id; };

/** my_child · my_lessons · my_payments · my_payment_history · my_prepaid_ledger 를 부를 때 쓴다 */
export async function myRpc(fn: string, args: Record<string, unknown> = {}) {
  if (!viewChild) return supabase.rpc(fn, args);
  return supabase.rpc('viewer_call', { p_child: viewChild, p_fn: fn, p_args: args });
}

/** 선생님: 내가 볼 수 있는 아이들 — SQL 전이거나 없으면 빈 목록 */
export interface ViewKid { id: string; name: string; number?: number; center: 'eunpyeong' | 'uijeongbu' }
export async function getViewerChildren(): Promise<ViewKid[]> {
  const { data, error } = await supabase.rpc('viewer_children');
  if (error) return [];
  return (data ?? []).map((r: { id: string; name: string; child_number: number | null; center: string }) => ({
    id: r.id, name: r.name, number: r.child_number ?? undefined, center: r.center === 'uijeongbu' ? 'uijeongbu' as const : 'eunpyeong' as const,
  }));
}

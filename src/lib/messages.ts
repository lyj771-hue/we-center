import { supabase } from './supabaseClient';

// 관리자 "알림 메시지" — 알림 종류별 메시지 포맷·알림 조건 (supabase/message-templates.sql)

export type MessageTemplate = { id: string; grp: string; label: string; body: string; condition: string; sort: number; updatedAt: string };

/** 묶음 — 표에서 이 순서로, 묶음 사이를 한 줄 띄운다. vars = 그 묶음 메시지에 넣을 수 있는 #{변수} */
export const MESSAGE_GROUPS: { key: string; label: string; vars: string[] }[] = [
  { key: 'lesson',    label: '수업·공지',   vars: ['보호자명', '아이이름', '날짜', '요일', '시간', '선생님', '센터', '제목'] },
  { key: 'timetable', label: '시간표 신청', vars: ['보호자명', '아이이름', '날짜', '요일', '시간', '선생님', '센터', '신청결과'] },
  { key: 'prepaid',   label: '선결제',      vars: ['보호자명', '아이이름', '날짜', '사용횟수', '충전횟수', '남은횟수'] },
  { key: 'member',    label: '회원',        vars: ['보호자명', '아이이름', '센터'] },
  { key: 'fixed',     label: '고정 스케줄', vars: ['보호자명', '아이이름', '날짜', '요일', '시간', '선생님', '센터', '변동내용'] },
  { key: 'etc',       label: '기타',        vars: ['보호자명', '아이이름', '날짜', '센터'] },
];

/** 미리보기용 예시 값 */
export const SAMPLE_VARS: Record<string, string> = {
  보호자명: '김유담 보호자', 아이이름: '김유담', 날짜: '10/14', 요일: '화', 시간: '15:40', 선생님: '이정길', 센터: '은평점',
  제목: '추석 연휴 휴무 안내', 신청결과: '신청 확정', 사용횟수: '2', 충전횟수: '20', 남은횟수: '44', 변동내용: '화 15:40 → 목 16:20',
};

export const fillVars = (body: string, vars: Record<string, string> = SAMPLE_VARS) =>
  body.replace(/#\{([^}]+)\}/g, (m, k: string) => vars[k.trim()] ?? m);

const fromRow = (r: Record<string, unknown>): MessageTemplate => ({
  id: r.id as string, grp: (r.grp as string) ?? 'etc', label: (r.label as string) ?? '', body: (r.body as string) ?? '',
  condition: (r.condition as string) ?? '', sort: (r.sort as number) ?? 0, updatedAt: r.updated_at as string,
});

export async function getMessageTemplates(): Promise<MessageTemplate[]> {
  const { data, error } = await supabase.from('message_templates').select('*').order('sort');
  if (error) throw error;
  return (data ?? []).map(fromRow);
}

export async function saveMessageTemplate(t: Omit<MessageTemplate, 'updatedAt'>): Promise<MessageTemplate> {
  const { data, error } = await supabase.from('message_templates')
    .upsert({ id: t.id, grp: t.grp, label: t.label.trim(), body: t.body, condition: t.condition, sort: t.sort, updated_at: new Date().toISOString() })
    .select().single();
  if (error) throw error;
  return fromRow(data);
}

export async function deleteMessageTemplate(id: string): Promise<void> {
  const { error } = await supabase.from('message_templates').delete().eq('id', id);
  if (error) throw error;
}

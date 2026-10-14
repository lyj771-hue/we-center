'use client';

import { useCallback, useEffect, useState } from 'react';
import { askConfirm, showAlert } from '@/lib/dialog';
import type { TeacherLogin } from '@/lib/teacher';
import { getTeacherLogins, saveTeacherPhone, unlinkTeacher } from '@/lib/teacher';

// 회원관리(선생님) — 두 센터 선생님을 한 곳에서. 선생님마다 휴대전화 뒷번호 4자리·회원 코드(T001 …)·카카오 연결.
// 선생님이 카카오로 로그인해서 [선생님]을 고르고 여기 적힌 이름·휴대전화 뒷번호를 똑같이 적으면 인증돼서 시간표 보기를 쓸 수 있다.

const fmtDate = (iso?: string) => { if (!iso) return ''; const d = new Date(iso); return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`; };

export default function TeachersTab() {
  const [list, setList] = useState<TeacherLogin[]>([]);
  const [failed, setFailed] = useState('');

  const load = useCallback(async () => {
    try { setList(await getTeacherLogins()); setFailed(''); }
    catch (e) { setFailed((e as Error).message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const savePhone = async (t: TeacherLogin, text: string) => {
    const v = text.replace(/\D/g, '').slice(-4);
    if (v === (t.phone ?? '')) return;
    if (v && v.length !== 4) { showAlert('휴대전화 뒷번호 4자리를 적어 주세요.'); return; }
    try { await saveTeacherPhone(t.teacherId, v); setList(l => l.map(x => (x.teacherId === t.teacherId ? { ...x, phone: v || undefined } : x))); }
    catch (e) { showAlert(`저장하지 못했어요.\n${(e as Error).message}`); }
  };
  const unlink = async (t: TeacherLogin) => {
    if (!(await askConfirm(`${t.name} 선생님의 카카오 연결을 끊을까요?\n다음에 로그인하면 다시 인증해야 해요.`))) return;
    try { await unlinkTeacher(t.teacherId); load(); }
    catch (e) { showAlert(`끊지 못했어요.\n${(e as Error).message}`); }
  };

  const th = 'text-left font-normal text-[12px] text-[#999] px-3 py-3 whitespace-nowrap';
  const td = 'px-3 py-2.5 align-middle';

  return (
    <div>
      <p className="mb-2 text-[12px] text-[#888]">선생님이 카카오로 로그인해서 <b className="font-normal text-[#555]">[선생님] · 이름 · 휴대전화 뒷번호 4자리</b>를 여기 적힌 것과 똑같이 적으면 인증돼요. 인증된 선생님은 위 메뉴의 시간표(수색·의정부)를 볼 수 있어요(고치기는 못 해요).</p>
      {failed && <p className="text-[13px] text-red-400 mb-3">불러오지 못했어요 — SQL(supabase/teacher-login.sql)을 실행했는지 확인해 주세요. ({failed})</p>}
      <div className="overflow-x-auto border-t border-[#e5e5e5]">
        <table className="w-full text-[14px] text-[#333] border-collapse">
          <thead>
            <tr className="border-b border-[#e5e5e5]">
              <th className={th}>구분</th>
              <th className={th}>이름</th>
              <th className={th}>휴대전화 뒷번호</th>
              <th className={th}>전화번호</th>
              <th className={th}>회원 코드</th>
              <th className={th}>카카오 연결</th>
              <th className={th}><span className="sr-only">관리</span></th>
            </tr>
          </thead>
          <tbody>
            {list.map(t => (
              <tr key={t.teacherId} className="border-b border-[#f0f0f0]">
                <td className={`${td} text-[12px] text-[#16a34a] whitespace-nowrap`}>선생님</td>
                <td className={`${td} whitespace-nowrap`}>{t.name}</td>
                <td className={td}>
                  <input key={`${t.teacherId}-${t.phone ?? ''}`} defaultValue={t.phone ?? ''} inputMode="numeric" maxLength={4} placeholder="1234"
                    onBlur={e => savePhone(t, e.target.value)} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    className="w-16 text-center tracking-[0.2em] border-b border-[#e5e5e5] py-1 text-[13px] tabular-nums outline-none bg-transparent focus:border-[var(--brand)]" />
                </td>
                {/* 카카오계정 전화번호 — 선생님이 로그인하면 채워진다(고칠 수 없음) */}
                <td className={`${td} text-[13px] tabular-nums whitespace-nowrap`} title="카카오계정 전화번호">{t.kakaoPhone ?? <span className="text-[#ccc]">-</span>}</td>
                <td className={`${td} text-[12px] text-[#888] tabular-nums whitespace-nowrap`}>{t.memberCode ?? '-'}</td>
                <td className={`${td} text-[12px] whitespace-nowrap`}>
                  {t.userId ? <span className="text-[var(--brand)]">인증됨 <span className="text-[#aaa]">{fmtDate(t.linkedAt)}</span></span> : <span className="text-[#ccc]">아직 안 함</span>}
                </td>
                <td className={`${td} text-right whitespace-nowrap`}>
                  {t.userId && <button onClick={() => unlink(t)} className="text-[12px] border border-[#e5e5e5] px-2.5 py-1 text-red-400 hover:bg-red-50">연결 끊기</button>}
                </td>
              </tr>
            ))}
            {!list.length && !failed && <tr><td colSpan={7} className="py-10 text-center text-[13px] text-[#bbb]">선생님이 없어요.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

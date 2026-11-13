import ScheduleDetail from '@/components/schedule/ScheduleDetail';

// 보호자 앱 — 수업스케쥴 하나 (홈페이지 /schedule/[id] 와 같은 화면: 선착순 신청·실시간 갱신)

interface Props { params: Promise<{ id: string }> }

export default async function AppScheduleDetailPage({ params }: Props) {
  const { id } = await params;
  return (
    <div className="-mx-4 -mt-5">
      <ScheduleDetail id={id} backHref="/app/book" />
    </div>
  );
}

import ScheduleDetail from '@/components/schedule/ScheduleDetail';

interface Props { params: Promise<{ id: string }> }

export default async function ScheduleDetailPage({ params }: Props) {
  const { id } = await params;
  return <ScheduleDetail id={id} />;
}

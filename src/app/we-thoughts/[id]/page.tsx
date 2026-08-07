import PostDetail from '@/components/PostDetail';

interface Props { params: Promise<{ id: string }> }

export default async function WeThoughtDetailPage({ params }: Props) {
  const { id } = await params;
  return (
    <div className="max-w-3xl mx-auto px-8 pt-8 pb-14 md:pt-14">
      <PostDetail category="thoughts" id={id} backHref="/we-thoughts" backLabel="We재활생각 목록" />
    </div>
  );
}

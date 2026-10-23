import { RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { getSupabaseServer, getCurrentUser } from '@/lib/supabase-server-auth';
import { Badge } from '@/components/ui/badge';

export default async function ReturnsPage() {
  const user = await getCurrentUser();
  const supabase = await getSupabaseServer();

  const { data: returns } = await supabase
    .from('returns')
    .select('*')
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false });

  return (
    <div>
      <h1 className="font-serif text-2xl font-bold text-primary">Returns &amp; Exchanges</h1>

      {!returns || returns.length === 0 ? (
        <div className="mt-8 flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center text-muted-foreground">
          <RotateCcw className="h-10 w-10" />
          <p>No return or exchange requests yet.</p>
          <p className="text-sm">
            You can request one from an eligible order under{' '}
            <Link href="/account/orders" className="font-medium text-primary hover:underline">
              My Orders
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {returns.map((r) => (
            <div key={r.id} className="rounded-lg border border-border/60 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium capitalize">{r.type} request</p>
                  <Link
                    href={`/account/orders/${r.order_id}`}
                    className="text-xs text-muted-foreground hover:underline"
                  >
                    Order #{r.order_id.slice(0, 8)}
                  </Link>
                </div>
                <Badge className="bg-muted text-foreground">{r.status}</Badge>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">Reason: {r.reason}</p>
              {r.admin_notes && (
                <p className="mt-1 text-sm text-secondary">Note: {r.admin_notes}</p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                Requested on {new Date(r.created_at).toLocaleDateString('en-IN')}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import { Wallet, TrendingUp, TrendingDown } from 'lucide-react';
import { getSupabaseServer, getCurrentUser } from '@/lib/supabase-server-auth';
import { formatINR } from '@/lib/format';
import { Badge } from '@/components/ui/badge';

const TYPE_LABEL: Record<string, string> = {
  issue: 'Credited',
  refund: 'Refund credited',
  redeem: 'Redeemed at checkout',
  adjust: 'Adjusted',
  expire: 'Expired',
};

export default async function StoreCreditPage() {
  const user = await getCurrentUser();
  const supabase = await getSupabaseServer();

  const [{ data: credit }, { data: ledger }] = await Promise.all([
    supabase.from('store_credits').select('balance').eq('user_id', user!.id).maybeSingle(),
    supabase
      .from('store_credit_ledger')
      .select('*')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false }),
  ]);

  const balance = Number(credit?.balance) || 0;

  return (
    <div>
      <h1 className="font-serif text-2xl font-bold text-primary">Store Credit</h1>

      <div className="mt-6 flex flex-col gap-4 rounded-lg border border-border/60 bg-gradient-to-br from-primary/5 to-secondary/5 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <Wallet className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Your balance</p>
            <p className="font-serif text-3xl font-bold text-primary">{formatINR(balance)}</p>
          </div>
        </div>
      </div>

      <p className="mt-4 text-sm text-muted-foreground">
        Store credit is applied automatically at checkout — up to your available balance, on
        whatever amount is left to pay. Refunds and goodwill credit issued to you show up here.
      </p>

      <h2 className="mt-8 font-serif text-lg font-semibold text-primary">History</h2>

      {!ledger || ledger.length === 0 ? (
        <div className="mt-4 flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center text-muted-foreground">
          <Wallet className="h-10 w-10" />
          <p>No store credit activity yet.</p>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {ledger.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center justify-between rounded-lg border border-border/60 p-4"
            >
              <div className="flex items-center gap-3">
                {Number(entry.amount) > 0 ? (
                  <TrendingUp className="h-4 w-4 text-secondary" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-destructive" />
                )}
                <div>
                  <p className="text-sm font-medium">
                    {entry.reason || TYPE_LABEL[entry.type] || 'Balance update'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(entry.created_at).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-sm font-semibold ${
                    Number(entry.amount) > 0 ? 'text-secondary-foreground' : 'text-destructive'
                  }`}
                >
                  {Number(entry.amount) > 0 ? '+' : ''}
                  {formatINR(Number(entry.amount))}
                </span>
                <Badge className="bg-muted text-foreground">{TYPE_LABEL[entry.type] || entry.type}</Badge>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

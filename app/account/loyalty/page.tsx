import { Gift, TrendingUp, TrendingDown } from 'lucide-react';
import { getSupabaseServer, getCurrentUser } from '@/lib/supabase-server-auth';
import { formatINR } from '@/lib/format';
import { DEFAULT_LOYALTY_SETTINGS, type LoyaltySettings } from '@/lib/loyalty-api';
import { Badge } from '@/components/ui/badge';

export default async function LoyaltyPage() {
  const user = await getCurrentUser();
  const supabase = await getSupabaseServer();

  const [{ data: profile }, { data: ledger }, { data: settingsRow }] = await Promise.all([
    supabase.from('profiles').select('loyalty_balance').eq('id', user!.id).maybeSingle(),
    supabase
      .from('loyalty_points_ledger')
      .select('*')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false }),
    supabase.from('settings').select('value').eq('key', 'loyalty_program').maybeSingle(),
  ]);

  const balance = profile?.loyalty_balance ?? 0;
  const settings: LoyaltySettings = {
    ...DEFAULT_LOYALTY_SETTINGS,
    ...((settingsRow?.value as Partial<LoyaltySettings>) ?? {}),
  };
  const worth = Math.round(balance * settings.redeem_value_per_point);

  const TYPE_LABEL: Record<string, string> = {
    earn: 'Earned',
    redeem: 'Redeemed',
    adjust: 'Adjusted',
    expire: 'Expired',
  };

  return (
    <div>
      <h1 className="font-serif text-2xl font-bold text-primary">Reward Points</h1>

      <div className="mt-6 flex flex-col gap-4 rounded-lg border border-border/60 bg-gradient-to-br from-primary/5 to-secondary/5 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <Gift className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Your balance</p>
            <p className="font-serif text-3xl font-bold text-primary">{balance} pts</p>
          </div>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-sm text-muted-foreground">Worth</p>
          <p className="text-xl font-semibold">{formatINR(worth)}</p>
          {balance < settings.min_redeem_points && (
            <p className="mt-1 text-xs text-muted-foreground">
              Earn {settings.min_redeem_points - balance} more points to redeem at checkout.
            </p>
          )}
        </div>
      </div>

      <p className="mt-4 text-sm text-muted-foreground">
        Earn {settings.points_per_100_rupees} points for every ₹100 you spend. Redeem them at
        checkout for {formatINR(settings.redeem_value_per_point)} off per point.
      </p>

      <h2 className="mt-8 font-serif text-lg font-semibold text-primary">History</h2>

      {!ledger || ledger.length === 0 ? (
        <div className="mt-4 flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center text-muted-foreground">
          <Gift className="h-10 w-10" />
          <p>No points activity yet.</p>
          <p className="text-sm">Place an order to start earning reward points.</p>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {ledger.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center justify-between rounded-lg border border-border/60 p-4"
            >
              <div className="flex items-center gap-3">
                {entry.points > 0 ? (
                  <TrendingUp className="h-4 w-4 text-secondary" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-destructive" />
                )}
                <div>
                  <p className="text-sm font-medium">
                    {entry.reason || TYPE_LABEL[entry.type] || 'Points update'}
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
                    entry.points > 0 ? 'text-secondary-foreground' : 'text-destructive'
                  }`}
                >
                  {entry.points > 0 ? '+' : ''}
                  {entry.points}
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

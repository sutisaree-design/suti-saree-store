import StockHoldSettings from '@/components/vendor/stock-hold-settings';

export default function VendorSettingsPage() {
  return (
    <div>
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">Vendor</p>
        <h1 className="mt-1 font-serif text-3xl font-bold text-primary sm:text-4xl">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage preferences for your seller account.</p>
      </div>

      <StockHoldSettings />
    </div>
  );
}

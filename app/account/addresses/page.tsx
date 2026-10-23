'use client';

import { useEffect, useState } from 'react';
import { Plus, Loader2, Trash2, Pencil, Star } from 'lucide-react';
import { fetchAddresses, upsertAddress, deleteAddress } from '@/lib/addresses-api';
import type { Address } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

// Same list as checkout page
const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi',
  'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];

const emptyForm = {
  full_name: '',
  phone: '',
  line1: '',
  line2: '',
  landmark: '',
  city: '',
  state: '',
  pincode: '',
  is_default: false,
};

export default function AddressesPage() {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Address | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setAddresses(await fetchAddresses()); }
    catch { toast.error('Could not load addresses'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (a: Address) => {
    setEditing(a);
    setForm({
      full_name: a.full_name,
      phone: a.phone,
      line1: a.line1,
      line2: a.line2 || '',
      landmark: a.landmark || '',
      city: a.city,
      state: a.state,
      pincode: a.pincode,
      is_default: a.is_default,
    });
    setOpen(true);
  };

  const f = (key: keyof typeof emptyForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [key]: e.target.value }));

  const onSave = async () => {
    if (!form.full_name.trim()) { toast.error('Full name is required'); return; }
    if (!form.phone.trim()) { toast.error('Phone is required'); return; }
    if (!form.line1.trim()) { toast.error('Street address is required'); return; }
    if (!form.pincode.trim() || !/^\d{6}$/.test(form.pincode.trim())) {
      toast.error('Please enter a valid 6-digit PIN code'); return;
    }
    if (!form.city.trim()) { toast.error('City is required'); return; }
    if (!form.state) { toast.error('Please select a state'); return; }

    setSaving(true);
    try {
      await upsertAddress({ id: editing?.id, ...form });
      toast.success('Address saved');
      setOpen(false);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (id: string) => {
    try { await deleteAddress(id); toast.success('Address removed'); load(); }
    catch { toast.error('Failed to remove'); }
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl font-bold text-primary">Saved Addresses</h1>
        <Button onClick={openNew} className="gap-2 bg-primary">
          <Plus className="h-4 w-4" /> Add Address
        </Button>
      </div>

      {loading ? (
        <Loader2 className="mt-8 h-6 w-6 animate-spin text-muted-foreground" />
      ) : addresses.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">No saved addresses yet.</p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {addresses.map((a) => (
            <div key={a.id} className="relative rounded-lg border border-border/60 p-4">
              {a.is_default && (
                <span className="absolute right-3 top-3 flex items-center gap-1 text-xs font-medium text-secondary">
                  <Star className="h-3 w-3 fill-secondary" /> Default
                </span>
              )}
              <p className="font-medium">{a.full_name}</p>
              <p className="text-sm text-muted-foreground">{a.phone}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {a.line1}
                {a.line2 ? `, ${a.line2}` : ''}
                {a.landmark ? `, Near ${a.landmark}` : ''},&nbsp;
                {a.city}, {a.state} — {a.pincode}
              </p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="outline" onClick={() => openEdit(a)} className="gap-1">
                  <Pencil className="h-3 w-3" /> Edit
                </Button>
                <Button
                  size="sm" variant="outline"
                  onClick={() => onDelete(a.id)}
                  className="gap-1 text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-3 w-3" /> Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Address' : 'Add Address'}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Full name */}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="full_name">Full name *</Label>
              <Input id="full_name" value={form.full_name} onChange={f('full_name')} placeholder="Bapan Mallick" />
            </div>

            {/* Phone */}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="phone">Phone *</Label>
              <Input id="phone" type="tel" value={form.phone} onChange={f('phone')} placeholder="+91 98765 43210" />
            </div>

            {/* Street address */}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="line1">Street address *</Label>
              <Input id="line1" value={form.line1} onChange={f('line1')} placeholder="12, MG Road, Apt 304" />
            </div>

            {/* Address line 2 */}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="line2">Apartment, suite, etc. <span className="text-muted-foreground">(optional)</span></Label>
              <Input id="line2" value={form.line2} onChange={f('line2')} placeholder="Bandra West" />
            </div>

            {/* Landmark */}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="landmark">Landmark <span className="text-muted-foreground">(optional)</span></Label>
              <Input id="landmark" value={form.landmark} onChange={f('landmark')} placeholder="Near City Hospital / Opposite SBI Bank" />
              <p className="text-xs text-muted-foreground">Helps our delivery partner find your address faster.</p>
            </div>

            {/* PIN code */}
            <div className="space-y-1.5">
              <Label htmlFor="pincode">PIN code *</Label>
              <Input
                id="pincode"
                value={form.pincode}
                onChange={f('pincode')}
                placeholder="400050"
                maxLength={6}
                inputMode="numeric"
              />
            </div>

            {/* City */}
            <div className="space-y-1.5">
              <Label htmlFor="city">City *</Label>
              <Input id="city" value={form.city} onChange={f('city')} placeholder="Mumbai" />
            </div>

            {/* State dropdown */}
            <div className="space-y-1.5 sm:col-span-2">
              <Label>State *</Label>
              <Select value={form.state} onValueChange={(v) => setForm(prev => ({ ...prev, state: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select state…" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {INDIAN_STATES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Default checkbox */}
            <div className="flex items-center gap-2 sm:col-span-2">
              <Checkbox
                id="is_default"
                checked={form.is_default}
                onCheckedChange={(v) => setForm(prev => ({ ...prev, is_default: !!v }))}
              />
              <Label htmlFor="is_default" className="cursor-pointer">Set as default address</Label>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={onSave} disabled={saving} className="w-full bg-primary">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Address
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { getSupabaseBrowser } from './supabase-browser';
import type { Address } from './types';

export async function fetchAddresses(): Promise<Address[]> {
  const supabase = getSupabaseBrowser();
  const { data, error } = await supabase
    .from('addresses')
    .select('*')
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function upsertAddress(address: Partial<Address> & { id?: string }) {
  const supabase = getSupabaseBrowser();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Please login');

  if (address.is_default) {
    await supabase.from('addresses').update({ is_default: false }).eq('user_id', user.id);
  }

  const { id, ...rest } = address;
  if (id) {
    const { error } = await supabase.from('addresses').update(rest).eq('id', id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('addresses').insert({ ...rest, user_id: user.id });
    if (error) throw error;
  }
}

export async function deleteAddress(id: string) {
  const supabase = getSupabaseBrowser();
  const { error } = await supabase.from('addresses').delete().eq('id', id);
  if (error) throw error;
}

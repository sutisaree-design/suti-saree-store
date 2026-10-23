/**
 * Free address autosuggest for the "Street address" field.
 *
 * Uses OpenStreetMap's public Nominatim search API — no API key, no cost,
 * no signup. Results are restricted to India (countrycodes=in) since that's
 * the only country this storefront ships to right now.
 *
 * Nominatim's usage policy asks for max ~1 request/second and a descriptive
 * referer, which the debounce in useAddressSuggestions() + browser-sent
 * Referer header already satisfy for a storefront of this size. If this
 * ever needs to scale up a lot, swap the endpoint below for a paid
 * provider (Google Places, Mapbox, etc.) without changing any callers.
 */

export interface AddressSuggestion {
  /** Full label shown in the suggestion dropdown */
  label: string;
  /** Best-guess first line (house/road/neighbourhood) to put in Street address */
  line1: string;
  city: string;
  state: string;
  pincode: string;
}

interface NominatimResult {
  display_name: string;
  address?: {
    house_number?: string;
    road?: string;
    neighbourhood?: string;
    suburb?: string;
    quarter?: string;
    hamlet?: string;
    city?: string;
    town?: string;
    village?: string;
    city_district?: string;
    county?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };
}

/**
 * Builds the "Street address" line from a Nominatim result. Tries to use
 * structured fields (house number, road, locality) first; if the result is
 * just a town/village-level match with no street-level detail (very common
 * for smaller Indian towns in OSM's free data), falls back to the leading,
 * non-redundant part of the full display_name instead of collapsing to
 * something identical to the City field.
 */
function buildLine1(addr: NominatimResult['address'], displayName: string, city: string): string {
  const structured = [
    addr?.house_number,
    addr?.road,
    addr?.neighbourhood || addr?.suburb || addr?.quarter || addr?.hamlet,
  ].filter(Boolean);
  if (structured.length > 0) return structured.join(', ');

  // No street-level fields — derive from display_name, dropping segments
  // that just repeat city/state/postcode/country/"India" so we don't hand
  // back something identical to the City field below it.
  const skip = new Set(
    [city, addr?.state, addr?.county, addr?.postcode, addr?.country, 'India']
      .filter(Boolean)
      .map((s) => (s as string).trim().toLowerCase())
  );
  const segments = displayName
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && !skip.has(s.toLowerCase()));

  return segments.slice(0, 2).join(', ') || displayName.split(',')[0];
}

/**
 * Looks up address suggestions for free-text typed into the Street address
 * field. Returns [] on any error, for very short queries, or when the free
 * OSM database simply has no match — callers should treat an empty result
 * as "no suggestions available" (and let the shopper keep typing manually)
 * rather than a hard failure, so checkout is never blocked by this.
 *
 * Note: this uses OpenStreetMap's crowd-sourced data, which is free but
 * has patchy coverage for exact house-level addresses in many Indian
 * towns — it's reliable for localities/areas/landmarks, less so for a
 * specific house number that was never mapped. The shopper can always
 * type their full address by hand; this is a convenience, not a
 * requirement.
 */
export async function fetchAddressSuggestions(
  query: string,
  signal?: AbortSignal
): Promise<AddressSuggestion[]> {
  const q = query.trim();
  if (q.length < 3) return [];

  try {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', q);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('countrycodes', 'in');
    url.searchParams.set('limit', '8');

    const res = await fetch(url.toString(), { signal });
    if (!res.ok) return [];
    const data: NominatimResult[] = await res.json();

    const results = data
      .map((r) => {
        const addr = r.address;
        const city =
          addr?.city || addr?.town || addr?.village || addr?.city_district || addr?.county || '';
        const line1 = buildLine1(addr, r.display_name, city);
        return {
          label: r.display_name,
          line1,
          city,
          state: addr?.state || '',
          pincode: addr?.postcode || '',
        };
      })
      .filter((s) => s.line1);

    // De-duplicate identical line1+city combos (Nominatim sometimes returns
    // near-duplicate POIs at the same address).
    const seen = new Set<string>();
    return results.filter((s) => {
      const key = `${s.line1}|${s.city}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } catch {
    // Aborted or network/API issue — just show no suggestions.
    return [];
  }
}

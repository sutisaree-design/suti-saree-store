export interface CustomerOrderSummary {
  id: string;
  total_amount: number;
  status: string;
  created_at: string;
  items: any[];
}

export interface CustomerBehavior {
  pagesVisited: string[];
  pagesVisitedCount: number;
  productsViewed: number;
  addedToCart: boolean;
  startedCheckout: boolean;
  converted: boolean;
}

export interface CustomerRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  isRegistered: boolean;
  orderCount: number;
  totalSpent: number;
  lastOrderAt: string;
  lastOrderItems: any[];
  orders: CustomerOrderSummary[];
  behavior: CustomerBehavior;
}

export async function fetchCustomers(): Promise<CustomerRow[]> {
  const res = await fetch('/api/admin/customers');
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to load customers');
  }
  const body = await res.json();
  return body.customers as CustomerRow[];
}

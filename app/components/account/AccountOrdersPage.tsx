'use client';

import { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Eye, Package, TrendingUp, DollarSign, Calendar } from 'lucide-react';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Order {
  order_id: string;
  customer_name: string;
  customer_email: string;
  total_amount: number;
  base_cost?: number;
  profit?: number;
  order_type: 'normal' | 'resale';
  order_status: string;
  created_at: string;
  items?: any[];
}

type TabType = 'personal' | 'resale';

// Memoized Order Card Component
const OrderCard = memo(({ order, onView }: { order: Order; onView: (order: Order) => void }) => (
  <div className="bg-white p-6 rounded-lg border border-gray-200 hover:border-gray-300 hover:shadow-md transition mb-4">
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
      <div>
        <p className="text-gray-600 text-sm">Order ID</p>
        <p className="font-mono font-bold text-gray-900">{order.order_id.slice(-8)}</p>
      </div>

      <div>
        <p className="text-gray-600 text-sm">Date</p>
        <p className="font-medium text-gray-900">
          {new Date(order.created_at).toLocaleDateString('en-IN')}
        </p>
      </div>

      <div>
        <p className="text-gray-600 text-sm">Status</p>
        <span className={`text-sm font-semibold px-3 py-1 rounded-full inline-block ${
          order.order_status === 'completed'
            ? 'bg-green-100 text-green-800'
            : order.order_status === 'pending'
            ? 'bg-yellow-100 text-yellow-800'
            : 'bg-gray-100 text-gray-800'
        }`}>
          {order.order_status || 'Pending'}
        </span>
      </div>
    </div>

    <div className="bg-gray-50 p-4 rounded-lg mb-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {order.base_cost && (
          <div>
            <p className="text-gray-600 text-xs uppercase tracking-wide">Base Cost</p>
            <p className="text-lg font-bold text-gray-900">₹{order.base_cost.toFixed(2)}</p>
          </div>
        )}
        
        <div>
          <p className="text-gray-600 text-xs uppercase tracking-wide">
            {order.order_type === 'resale' ? 'Final Price' : 'Total Amount'}
          </p>
          <p className="text-lg font-bold text-gray-900">₹{order.total_amount.toFixed(2)}</p>
        </div>

        {order.order_type === 'resale' && order.profit && (
          <div>
            <p className="text-gray-600 text-xs uppercase tracking-wide">Your Profit</p>
            <p className="text-lg font-bold text-green-600">₹{order.profit.toFixed(2)}</p>
          </div>
        )}
      </div>
    </div>

    <button
      onClick={() => onView(order)}
      className="w-full md:w-auto bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition font-medium text-sm flex items-center justify-center gap-2"
    >
      <Eye className="w-4 h-4" />
      View Details
    </button>
  </div>
));

OrderCard.displayName = 'OrderCard';

// Memoized Tab Button
const TabButton = memo(({ tab, label, count, isActive, onClick }: { 
  tab: TabType; 
  label: string; 
  count: number;
  isActive: boolean;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    className={`px-6 py-3 font-semibold text-sm transition-all border-b-2 ${
      isActive
        ? 'text-blue-600 border-blue-600'
        : 'text-gray-600 border-transparent hover:text-gray-900'
    }`}
  >
    {label}
    <span className="ml-2 px-2 py-1 bg-gray-100 text-gray-800 rounded-full text-xs">
      {count}
    </span>
  </button>
));

TabButton.displayName = 'TabButton';

// Memoized Modal Component
const OrderModal = memo(({ order, onClose }: { order: Order | null; onClose: () => void }) => {
  if (!order) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div 
        className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-6 pb-6 border-b">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Order Details</h2>
            <p className="text-gray-600 text-sm mt-1">Order #{order.order_id.slice(-8)}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-2 gap-6 mb-6">
          <div>
            <p className="text-gray-600 text-sm">Order Date</p>
            <p className="text-lg font-bold text-gray-900">
              {new Date(order.created_at).toLocaleDateString('en-IN')}
            </p>
          </div>
          <div>
            <p className="text-gray-600 text-sm">Order Status</p>
            <span className={`text-lg font-semibold px-3 py-1 rounded-full inline-block ${
              order.order_status === 'completed'
                ? 'bg-green-100 text-green-800'
                : 'bg-yellow-100 text-yellow-800'
            }`}>
              {order.order_status || 'Pending'}
            </span>
          </div>
          <div>
            <p className="text-gray-600 text-sm">Order Type</p>
            <span className={`text-lg font-semibold px-3 py-1 rounded-full inline-block ${
              order.order_type === 'resale'
                ? 'bg-purple-100 text-purple-800'
                : 'bg-blue-100 text-blue-800'
            }`}>
              {order.order_type === 'resale' ? 'Resale' : 'Normal'}
            </span>
          </div>
        </div>

        <div className="bg-gray-50 p-6 rounded-lg mb-6">
          <h3 className="font-bold text-gray-900 mb-4">Price Structure</h3>
          <div className="space-y-3">
            {order.base_cost && order.order_type === 'resale' && (
              <div className="flex justify-between items-center pb-3 border-b">
                <span className="text-gray-600">Base Cost (What you bought for)</span>
                <span className="font-bold text-gray-900 text-lg">₹{order.base_cost.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between items-center pb-3 border-b">
              <span className="text-gray-600">
                {order.order_type === 'resale' ? 'Selling Price' : 'Order Total'}
              </span>
              <span className="font-bold text-gray-900 text-lg">₹{order.total_amount.toFixed(2)}</span>
            </div>
            {order.profit && order.order_type === 'resale' && (
              <div className="flex justify-between items-center pt-2">
                <span className="text-green-600 font-bold">Your Profit Margin</span>
                <span className="font-bold text-green-600 text-lg">₹{order.profit.toFixed(2)}</span>
              </div>
            )}
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition font-bold"
        >
          Close
        </button>
      </div>
    </div>
  );
});

OrderModal.displayName = 'OrderModal';

export default function AccountOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('personal');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    getUserAndFetchOrders();
  }, []);

  const getUserAndFetchOrders = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) {
        setUserEmail(user.email);
        fetchUserOrders(user.email);
      }
    } catch (error) {
      console.error('Error getting user:', error);
    }
  };

  const fetchUserOrders = async (email: string) => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('customer_email', email)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const processedOrders = data?.map((order: any) => ({
        ...order,
        order_type: order.order_type || 'normal',
      })) || [];

      setOrders(processedOrders);
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  };

  // Memoized tab orders - instant switching!
  const tabOrders = useMemo(() => {
    return orders.filter(order => order.order_type === activeTab);
  }, [orders, activeTab]);

  // Memoized stats calculation
  const stats = useMemo(() => {
    if (activeTab === 'personal') {
      const personalOrders = orders.filter(o => o.order_type === 'normal');
      return {
        count: personalOrders.length,
        total: personalOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0),
      };
    } else {
      const resaleOrders = orders.filter(o => o.order_type === 'resale');
      return {
        count: resaleOrders.length,
        total: resaleOrders.reduce((sum, o) => sum + (o.profit || 0), 0),
      };
    }
  }, [orders, activeTab]);

  // Memoized callbacks for instant interaction
  const handleTabClick = useCallback((tab: TabType) => {
    setActiveTab(tab);
  }, []);

  const handleViewOrder = useCallback((order: Order) => {
    setSelectedOrder(order);
  }, []);

  const handleCloseModal = useCallback(() => {
    setSelectedOrder(null);
  }, []);

  const personalCount = useMemo(() => orders.filter(o => o.order_type === 'normal').length, [orders]);
  const resaleCount = useMemo(() => orders.filter(o => o.order_type === 'resale').length, [orders]);

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 md:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">My Orders</h1>
          <p className="text-gray-600 text-sm mt-1">Track and manage all your orders</p>
        </div>

        {/* Tabs - OPTIMIZED FOR SPEED */}
        <div className="bg-white border-b border-gray-200 mb-6">
          <div className="flex gap-8">
            <TabButton 
              tab="personal" 
              label="Personal Orders" 
              count={personalCount}
              isActive={activeTab === 'personal'}
              onClick={() => handleTabClick('personal')}
            />
            <TabButton 
              tab="resale" 
              label="Resale Orders" 
              count={resaleCount}
              isActive={activeTab === 'resale'}
              onClick={() => handleTabClick('resale')}
            />
          </div>
        </div>

        {/* Stats Card */}
        {!loading && tabOrders.length > 0 && (
          <div className="bg-white p-6 rounded-lg border border-gray-200 mb-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-3">
                <Package className="w-8 h-8 text-blue-600" />
                <div>
                  <p className="text-gray-600 text-sm">Total Orders</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.count}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <DollarSign className="w-8 h-8 text-green-600" />
                <div>
                  <p className="text-gray-600 text-sm">
                    {activeTab === 'resale' ? 'Total Profit' : 'Total Spent'}
                  </p>
                  <p className="text-2xl font-bold text-gray-900">₹{stats.total.toFixed(2)}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Orders List */}
        <div>
          {loading ? (
            <div className="bg-white p-8 rounded-lg text-center text-gray-500">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3"></div>
              Loading your orders...
            </div>
          ) : tabOrders.length === 0 ? (
            <div className="bg-white p-12 rounded-lg text-center">
              <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 text-lg font-medium">No {activeTab} orders yet</p>
              <p className="text-gray-400 text-sm mt-2">
                {activeTab === 'personal' 
                  ? 'Start shopping to see your orders here' 
                  : 'List your items for resale to get started'}
              </p>
            </div>
          ) : (
            <div>
              {tabOrders.map(order => (
                <OrderCard 
                  key={order.order_id} 
                  order={order}
                  onView={handleViewOrder}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Order Detail Modal - OPTIMIZED */}
      <OrderModal order={selectedOrder} onClose={handleCloseModal} />
    </div>
  );
}

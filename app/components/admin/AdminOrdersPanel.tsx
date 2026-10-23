'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  DollarSign,
  TrendingUp,
  Filter,
  Search,
  Eye,
  ArrowUpRight,
  ArrowDownLeft,
} from 'lucide-react';

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

export default function AdminOrdersPanel() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'normal' | 'resale'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [stats, setStats] = useState({
    totalOrders: 0,
    totalRevenue: 0,
    resaleProfit: 0,
    avgOrderValue: 0,
  });

  useEffect(() => {
    fetchOrders();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [orders, filter, searchTerm]);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const processedOrders = data?.map((order: any) => ({
        ...order,
        order_type: order.order_type || 'normal',
      })) || [];

      setOrders(processedOrders);
      calculateStats(processedOrders);
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (orderList: Order[]) => {
    const totalOrders = orderList.length;
    const totalRevenue = orderList.reduce((sum, order) => sum + (order.total_amount || 0), 0);
    const resaleOrders = orderList.filter(o => o.order_type === 'resale');
    const resaleProfit = resaleOrders.reduce((sum, order) => sum + (order.profit || 0), 0);
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    setStats({
      totalOrders,
      totalRevenue,
      resaleProfit,
      avgOrderValue,
    });
  };

  const applyFilters = () => {
    let filtered = orders;

    // Filter by type
    if (filter !== 'all') {
      filtered = filtered.filter(o => o.order_type === filter);
    }

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(o =>
        o.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.customer_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.order_id.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    setFilteredOrders(filtered);
  };

  const getProfitMargin = (order: Order) => {
    if (!order.base_cost || !order.total_amount) return 0;
    return ((order.total_amount - order.base_cost) / order.total_amount) * 100;
  };

  const StatCard = ({ icon: Icon, label, value, subtext, trend }: any) => (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <p className="text-gray-600 text-sm font-medium">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-2">{value}</p>
          {subtext && <p className="text-gray-500 text-xs mt-1">{subtext}</p>}
        </div>
        <div className={`p-3 rounded-lg ${trend === 'up' ? 'bg-green-100' : 'bg-blue-100'}`}>
          {trend === 'up' ? (
            <ArrowUpRight className="w-5 h-5 text-green-600" />
          ) : (
            <Icon className={`w-5 h-5 ${trend === 'positive' ? 'text-blue-600' : 'text-gray-600'}`} />
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Orders Dashboard</h1>
        <p className="text-gray-600 text-sm mt-1">Manage and track all orders with detailed insights</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          icon={DollarSign}
          label="Total Revenue"
          value={`₹${stats.totalRevenue.toFixed(0)}`}
          subtext={`${stats.totalOrders} orders`}
          trend="positive"
        />
        <StatCard
          icon={TrendingUp}
          label="Avg Order Value"
          value={`₹${stats.avgOrderValue.toFixed(0)}`}
          subtext="Average sale"
          trend="positive"
        />
        <StatCard
          icon={DollarSign}
          label="Resale Profit"
          value={`₹${stats.resaleProfit.toFixed(0)}`}
          subtext="From resales"
          trend="up"
        />
        <StatCard
          icon={TrendingUp}
          label="Total Orders"
          value={stats.totalOrders}
          subtext="All time"
          trend="positive"
        />
      </div>

      {/* Filters and Search */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, email, or order ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-gray-600" />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as any)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Orders</option>
              <option value="normal">Normal Orders</option>
              <option value="resale">Resale Orders</option>
            </select>
          </div>

          {/* Results */}
          <div className="flex items-center justify-end text-sm text-gray-600">
            Showing <span className="font-bold mx-1">{filteredOrders.length}</span> of{' '}
            <span className="font-bold mx-1">{orders.length}</span> orders
          </div>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading orders...</div>
        ) : filteredOrders.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No orders found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Order ID</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Customer</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Type</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700">Base Cost</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700">Total</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700">Profit</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700">Margin %</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredOrders.map((order) => (
                  <tr key={order.order_id} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-4 text-sm font-mono text-blue-600">{order.order_id.slice(-8)}</td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">{order.customer_name}</div>
                      <div className="text-xs text-gray-500">{order.customer_email}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
                        order.order_type === 'resale'
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {order.order_type === 'resale' ? 'Resale' : 'Normal'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-right text-gray-600">
                      {order.base_cost ? `₹${order.base_cost.toFixed(0)}` : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-right font-bold text-gray-900">
                      ₹{order.total_amount.toFixed(0)}
                    </td>
                    <td className="px-6 py-4 text-sm text-right">
                      <span className={order.profit ? 'text-green-600 font-bold' : 'text-gray-500'}>
                        {order.profit ? `₹${order.profit.toFixed(0)}` : '-'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-right font-semibold text-gray-900">
                      {getProfitMargin(order) > 0 ? `${getProfitMargin(order).toFixed(1)}%` : '-'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
                        order.order_status === 'completed'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {order.order_status || 'pending'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => setSelectedOrder(order)}
                        className="text-blue-600 hover:text-blue-800 transition flex items-center gap-1"
                      >
                        <Eye className="w-4 h-4" />
                        <span className="text-xs">View</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-96 overflow-y-auto p-6">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Order Details</h2>
                <p className="text-gray-600 text-sm mt-1">{selectedOrder.order_id}</p>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="text-gray-400 hover:text-gray-600 text-xl"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-6 mb-6">
              <div>
                <p className="text-gray-600 text-sm">Customer Name</p>
                <p className="text-lg font-bold text-gray-900">{selectedOrder.customer_name}</p>
              </div>
              <div>
                <p className="text-gray-600 text-sm">Email</p>
                <p className="text-lg font-bold text-gray-900">{selectedOrder.customer_email}</p>
              </div>
              <div>
                <p className="text-gray-600 text-sm">Order Type</p>
                <span className={`text-lg font-bold px-3 py-1 rounded-full inline-block ${
                  selectedOrder.order_type === 'resale'
                    ? 'bg-purple-100 text-purple-800'
                    : 'bg-blue-100 text-blue-800'
                }`}>
                  {selectedOrder.order_type === 'resale' ? 'Resale' : 'Normal'}
                </span>
              </div>
              <div>
                <p className="text-gray-600 text-sm">Status</p>
                <p className="text-lg font-bold text-gray-900 capitalize">{selectedOrder.order_status}</p>
              </div>
            </div>

            {/* Price Breakdown */}
            <div className="bg-gray-50 p-4 rounded-lg mb-6">
              <h3 className="font-bold text-gray-900 mb-4">Price Structure</h3>
              <div className="space-y-2">
                {selectedOrder.base_cost && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Base Cost:</span>
                    <span className="font-bold text-gray-900">₹{selectedOrder.base_cost.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Total Amount:</span>
                  <span className="font-bold text-gray-900">₹{selectedOrder.total_amount.toFixed(2)}</span>
                </div>
                {selectedOrder.profit && (
                  <div className="flex justify-between text-sm border-t pt-2 mt-2">
                    <span className="text-green-600 font-bold">Profit:</span>
                    <span className="font-bold text-green-600">₹{selectedOrder.profit.toFixed(2)}</span>
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={() => setSelectedOrder(null)}
              className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition font-medium"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot, getDocs } from 'firebase/firestore';
import { UserActivityLog } from '../types';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { Calendar, User, Shield } from 'lucide-react';

export const UserActivityTab: React.FC = () => {
  // Filters
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [selectedRole, setSelectedRole] = useState<string>('all');
  const [selectedUser, setSelectedUser] = useState<string>('all');

  const [activities, setActivities] = useState<UserActivityLog[]>([]);
  const [authorizedUsers, setAuthorizedUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Fetch authorized users for the dropdown
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const snap = await getDocs(collection(db, 'authorizedUsers'));
        const usersList = snap.docs.map(doc => ({
          email: doc.id,
          ...doc.data()
        }));
        setAuthorizedUsers(usersList);
      } catch (err) {
        console.error("Error fetching users", err);
      }
    };
    fetchUsers();
  }, []);

  // Fetch user activities
  useEffect(() => {
    setLoading(true);
    
    // Parse selectedDate to start and end of day timestamp
    const startOfDay = new Date(`${selectedDate}T00:00:00`);
    const endOfDay = new Date(`${selectedDate}T23:59:59.999`);
    
    let q = query(
      collection(db, 'userActivities'),
      where('timestamp', '>=', startOfDay),
      where('timestamp', '<=', endOfDay)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logs: UserActivityLog[] = [];
      snapshot.forEach(doc => {
        logs.push({ id: doc.id, ...doc.data() } as UserActivityLog);
      });
      setActivities(logs);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching activities", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [selectedDate]);

  // Process data for the chart
  const chartData = useMemo(() => {
    // 1. Filter by user and role
    const filteredLogs = activities.filter(log => {
      if (selectedRole !== 'all' && log.userRole !== selectedRole) return false;
      if (selectedUser !== 'all' && log.userEmail !== selectedUser) return false;
      return true;
    });

    // 2. Group by hour (0 to 23)
    const hourlyData = Array.from({ length: 24 }, (_, i) => ({
      hour: `${i.toString().padStart(2, '0')}:00`,
      salesOrder: 0,
      purchaseOrder: 0,
      catalog: 0,
    }));

    filteredLogs.forEach(log => {
      if (!log.timestamp) return;
      const date = log.timestamp.toDate ? log.timestamp.toDate() : new Date(log.timestamp);
      const hour = date.getHours();
      
      if (log.entityType === 'SALES_ORDER') hourlyData[hour].salesOrder += 1;
      else if (log.entityType === 'PURCHASE_ORDER') hourlyData[hour].purchaseOrder += 1;
      else if (log.entityType === 'CATALOG') hourlyData[hour].catalog += 1;
    });

    return hourlyData;
  }, [activities, selectedRole, selectedUser]);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#f8fafc] dark:bg-[#111827]">
      <div className="p-4 sm:p-6 lg:p-8 w-full max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">Kegiatan User</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Pantau aktivitas user (pembuatan, perubahan, dan penghapusan) berdasarkan waktu.
          </p>
        </div>

        {/* Filters */}
        <div className="bg-white dark:bg-[#1f2937] p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 flex flex-wrap gap-4 items-end">
          
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" /> Tanggal
            </label>
            <input 
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full text-sm p-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#374151] text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            />
          </div>

          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1">
              <Shield className="w-3.5 h-3.5" /> Role
            </label>
            <select
              value={selectedRole}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedRole(val);
                if (val !== 'all') setSelectedUser('all');
              }}
              className="w-full text-sm p-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#374151] text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            >
              <option value="all">Semua Role</option>
              <option value="owner">Owner</option>
              <option value="admin">Admin</option>
              <option value="staff">Staff</option>
            </select>
          </div>

          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1">
              <User className="w-3.5 h-3.5" /> Spesifik User
            </label>
            <select
              value={selectedUser}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedUser(val);
                if (val !== 'all') setSelectedRole('all');
              }}
              className="w-full text-sm p-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#374151] text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            >
              <option value="all">Semua User</option>
              {authorizedUsers.map(user => (
                <option key={user.email} value={user.email}>
                  {user.email} {user.role ? `(${user.role})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Chart */}
        <div className="bg-white dark:bg-[#1f2937] p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">Grafik Aktivitas Per Jam</h2>
          
          <div className="w-full h-[400px]">
            {loading ? (
              <div className="w-full h-full flex items-center justify-center text-gray-400">
                Memuat data...
              </div>
            ) : activities.length === 0 ? (
              <div className="w-full h-full flex items-center justify-center text-gray-400">
                Tidak ada aktivitas pada tanggal ini
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} vertical={false} />
                  <XAxis 
                    dataKey="hour" 
                    stroke="#6b7280" 
                    fontSize={12}
                    tickMargin={10}
                  />
                  <YAxis 
                    stroke="#6b7280" 
                    fontSize={12}
                    allowDecimals={false}
                    tickMargin={10}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'rgba(31, 41, 55, 0.95)', 
                      borderColor: '#374151',
                      borderRadius: '8px',
                      color: '#f3f4f6'
                    }}
                    itemStyle={{ color: '#f3f4f6' }}
                  />
                  <Legend wrapperStyle={{ paddingTop: '20px' }} />
                  
                  <Line 
                    type="monotone" 
                    name="Sales Order"
                    dataKey="salesOrder" 
                    stroke="#3b82f6" 
                    strokeWidth={3}
                    dot={{ r: 4, strokeWidth: 2 }}
                    activeDot={{ r: 6 }}
                  />
                  <Line 
                    type="monotone" 
                    name="Purchase Order"
                    dataKey="purchaseOrder" 
                    stroke="#10b981" 
                    strokeWidth={3}
                    dot={{ r: 4, strokeWidth: 2 }}
                    activeDot={{ r: 6 }}
                  />
                  <Line 
                    type="monotone" 
                    name="Katalog Buku"
                    dataKey="catalog" 
                    stroke="#f59e0b" 
                    strokeWidth={3}
                    dot={{ r: 4, strokeWidth: 2 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

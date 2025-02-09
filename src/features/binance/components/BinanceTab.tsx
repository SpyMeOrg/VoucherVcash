import React, { useState } from 'react';
import { BinanceService } from '../services/binanceService';
import { BinanceOrder } from '../types/orders';

export const BinanceTab: React.FC = () => {
    const [orders, setOrders] = useState<BinanceOrder[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [apiKey, setApiKey] = useState('');
    const [secretKey, setSecretKey] = useState('');

    // تجربة الاتصال
    const handleConnect = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!apiKey || !secretKey) {
            setError('الرجاء إدخال المفاتيح');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const service = new BinanceService(apiKey, secretKey);
            const fetchedOrders = await service.getP2POrders();
            console.log('تم جلب الأوردرات:', fetchedOrders);
            setOrders(fetchedOrders);
        } catch (err) {
            console.error('خطأ في الاتصال:', err);
            setError(err instanceof Error ? err.message : 'حدث خطأ في الاتصال مع Binance');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-4">
            {/* نموذج إدخال المفاتيح */}
            <form onSubmit={handleConnect} className="space-y-4">
                <div className="space-y-2">
                    <div>
                        <label className="block text-sm font-medium mb-1">
                            API Key
                        </label>
                        <input
                            type="password"
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            className="w-full p-2 border rounded"
                            placeholder="أدخل API Key"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">
                            Secret Key
                        </label>
                        <input
                            type="password"
                            value={secretKey}
                            onChange={(e) => setSecretKey(e.target.value)}
                            className="w-full p-2 border rounded"
                            placeholder="أدخل Secret Key"
                        />
                    </div>
                </div>
                <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-blue-500 text-white p-2 rounded disabled:bg-gray-400"
                >
                    {loading ? 'جاري الاتصال...' : 'اتصال'}
                </button>
            </form>

            {/* عرض الخطأ */}
            {error && (
                <div className="mt-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
                    {error}
                </div>
            )}

            {/* عرض الأوردرات */}
            {orders.length > 0 && (
                <div className="mt-4 overflow-x-auto">
                    <table className="min-w-full bg-white">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="p-4 text-right">رقم الأوردر</th>
                                <th className="p-4 text-right">النوع</th>
                                <th className="p-4 text-right">المبلغ (جنيه)</th>
                                <th className="p-4 text-right">الكمية (USDT)</th>
                                <th className="p-4 text-right">الكمية الصافية (USDT)</th>
                                <th className="p-4 text-right">السعر</th>
                                <th className="p-4 text-right">الرسوم (USDT)</th>
                                <th className="p-4 text-right">الحالة</th>
                                <th className="p-4 text-right">التاريخ</th>
                            </tr>
                        </thead>
                        <tbody>
                            {orders.map((order) => (
                                <tr 
                                    key={order.orderId}
                                    className={
                                        order.status === 'CANCELLED' ? 'bg-white' :
                                        order.type === 'BUY' ? 'bg-green-50' : 'bg-red-50'
                                    }
                                >
                                    <td className="p-4">
                                        <span 
                                            className="cursor-pointer hover:text-blue-500"
                                            onClick={() => {
                                                navigator.clipboard.writeText(order.orderId);
                                                // اختياري: يمكن إضافة إشعار هنا لإخبار المستخدم أنه تم النسخ
                                            }}
                                            title="انقر للنسخ"
                                        >
                                            ...{order.orderId.slice(-5)}
                                        </span>
                                    </td>
                                    <td className="p-4">{order.type === 'BUY' ? 'شراء' : 'بيع'}</td>
                                    <td className="p-4">{order.fiatAmount.toFixed(2)}</td>
                                    <td className="p-4">{order.cryptoAmount.toFixed(2)}</td>
                                    <td className="p-4">{order.netAmount.toFixed(2)}</td>
                                    <td className="p-4">{order.price.toFixed(2)}</td>
                                    <td className="p-4">{order.fee.toFixed(2)}</td>
                                    <td className="p-4 text-center">
                                        <span className={
                                            order.status === 'COMPLETED' ? 'text-green-500' :
                                            order.status === 'CANCELLED' ? 'text-red-500' : 'text-gray-500'
                                        }>
                                            {order.status === 'COMPLETED' ? '✅' :
                                             order.status === 'CANCELLED' ? '❌' : '⏳'}
                                        </span>
                                    </td>
                                    <td className="p-4">
                                        {new Date(order.createTime).toLocaleString('ar-EG')}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

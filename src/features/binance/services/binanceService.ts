import { BinanceOrder } from '../types/orders';

export class BinanceService {
    private baseUrl = 'https://api.binance.com';
    private proxyUrl = 'https://cors-proxy.fringe.zone/';
    private apiKey: string;
    private secretKey: string;
    private recvWindow = 60000;

    constructor(apiKey: string, secretKey: string) {
        this.apiKey = apiKey;
        this.secretKey = secretKey;
    }

    async checkServerTime(): Promise<number> {
        try {
            const response = await fetch(`${this.proxyUrl}${this.baseUrl}/api/v3/time`);
            if (!response.ok) {
                throw new Error(`خطأ في الاتصال: ${response.status}`);
            }
            const data = await response.json();
            return data.serverTime;
        } catch (error) {
            console.error('خطأ في الحصول على وقت السيرفر:', error);
            throw new Error('فشل الاتصال مع سيرفر Binance');
        }
    }

    private async validateTimestamp(timestamp: number): Promise<boolean> {
        try {
            const serverTime = await this.checkServerTime();
            const diff = Math.abs(serverTime - timestamp);
            return diff <= this.recvWindow;
        } catch {
            return true;
        }
    }

    async getP2POrders() {
        try {
            const timestamp = Date.now();
            await this.validateTimestamp(timestamp);

            const queryParams = new URLSearchParams({
                timestamp: timestamp.toString(),
                recvWindow: this.recvWindow.toString()
            });

            const signature = window.CryptoJS.HmacSHA256(queryParams.toString(), this.secretKey).toString();
            queryParams.append('signature', signature);

            const url = `${this.proxyUrl}${this.baseUrl}/sapi/v1/c2c/orderMatch/listUserOrderHistory?${queryParams.toString()}`;
            
            console.log('جاري الاتصال مع:', url);
            
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'X-MBX-APIKEY': this.apiKey,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const errorData = await response.json();
                if (response.status === 429) {
                    throw new Error('تم تجاوز حد الطلبات المسموح به');
                } else if (response.status === 418) {
                    throw new Error('تم حظر عنوان IP الخاص بك');
                }
                throw new Error(errorData.msg || 'خطأ في جلب الأوردرات');
            }

            const data = await response.json();
            console.log('البيانات المستلمة من Binance:', data);

            if (!data || !Array.isArray(data.data)) {
                console.error('شكل البيانات غير صحيح:', data);
                throw new Error('البيانات المستلمة غير صالحة');
            }

            return this.transformOrders(data.data);

        } catch (error) {
            console.error('خطأ في getP2POrders:', error);
            if (error instanceof Error) {
                throw error;
            }
            throw new Error('حدث خطأ غير متوقع');
        }
    }

    private transformOrders(data: any[]): BinanceOrder[] {
        return data.map(order => {
            if (!order || typeof order !== 'object') {
                console.warn('تم تخطي أوردر غير صالح:', order);
                return null;
            }

            try {
                // تأكد من وجود البيانات الأساسية
                if (!order.orderNumber || !order.totalPrice || !order.amount || !order.unitPrice) {
                    console.warn('بيانات الأوردر غير مكتملة:', order);
                    return null;
                }

                const type = (order.tradeType || '').toString().toUpperCase();
                if (type !== 'BUY' && type !== 'SELL') {
                    console.warn('نوع الأوردر غير صالح:', type);
                    return null;
                }

                // معالجة الرسوم - إذا كان taker نضع 0.05 وإلا نستخدم القيمة من الـ API
                const isTaker = order.orderSource === 'TAKER';
                const fee = isTaker ? 0.05 : (order.commission ? Number(order.commission) : 0.05);

                // حساب الكمية الصافية (بعد خصم الرسوم)
                const cryptoAmount = this.parseNumber(order.amount);
                const netAmount = type === 'BUY' ? 
                    cryptoAmount - fee :  // في الشراء: نخصم الرسوم من الكمية
                    cryptoAmount + fee;   // في البيع: نضيف الرسوم على الكمية

                return {
                    orderId: order.orderNumber,
                    type: type as 'BUY' | 'SELL',
                    fiatAmount: this.parseNumber(order.totalPrice),
                    price: this.parseNumber(order.unitPrice),
                    cryptoAmount: cryptoAmount,
                    fee: fee,
                    netAmount: netAmount,
                    status: this.mapOrderStatus(order.orderStatus),
                    createTime: order.createTime
                };
            } catch (error) {
                console.error('خطأ في تحويل الأوردر:', error, order);
                return null;
            }
        }).filter(order => order !== null) as BinanceOrder[];
    }

    private parseNumber(value: any): number {
        if (value === undefined || value === null) {
            throw new Error('القيمة غير موجودة');
        }
        
        // تحويل القيمة لـ string للتأكد من معالجة الأرقام العشرية بشكل صحيح
        const strValue = value.toString().trim();
        
        // إزالة أي رموز غير رقمية ما عدا النقطة العشرية والسالب
        const cleanValue = strValue.replace(/[^0-9.-]/g, '');
        
        // التحويل لرقم مع الحفاظ على الأرقام بعد العلامة العشرية
        const num = Number(cleanValue);
        
        if (isNaN(num)) {
            throw new Error('القيمة ليست رقماً صالحاً');
        }
        
        // التأكد من أن الرقم ليس undefined أو NaN
        return num === 0 ? 0 : num || 0;
    }

    private mapOrderStatus(status: string): 'COMPLETED' | 'CANCELLED' | 'PENDING' {
        if (!status) return 'PENDING';
        
        const normalizedStatus = status.toString().toUpperCase();
        
        if (normalizedStatus.includes('COMPLET') || normalizedStatus.includes('SUCCESS')) {
            return 'COMPLETED';
        }
        if (normalizedStatus.includes('CANCEL') || normalizedStatus.includes('FAIL')) {
            return 'CANCELLED';
        }
        return 'PENDING';
    }
}

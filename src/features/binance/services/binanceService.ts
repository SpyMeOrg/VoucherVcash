import { BinanceOrder } from '../types/orders';

declare global {
    interface Window {
        CryptoJS: any;
    }
}

export interface P2POrderParams {
    startTime?: number;
    endTime?: number;
    page?: number;
    rows?: number;
    tradeType?: string;  // 'BUY' | 'SELL'
}

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

    async getP2POrders(params: P2POrderParams = {}) {
        try {
            const timestamp = Date.now();
            await this.validateTimestamp(timestamp);

            const queryParams = new URLSearchParams({
                timestamp: timestamp.toString(),
                recvWindow: this.recvWindow.toString()
            });
            
            // إضافة معلمات إضافية إذا كانت موجودة
            if (params.startTime) {
                queryParams.append('startTimestamp', params.startTime.toString());
            }
            
            if (params.endTime) {
                queryParams.append('endTimestamp', params.endTime.toString());
            }
            
            if (params.page) {
                queryParams.append('page', params.page.toString());
            }
            
            if (params.rows) {
                queryParams.append('rows', params.rows.toString());
            }
            
            if (params.tradeType) {
                queryParams.append('tradeType', params.tradeType);
            }

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
            const cryptoAmount = this.parseNumber(order.amount);
            const isTakerOrder = order.commission === 0;
            const fee = isTakerOrder ? 0.05 : this.parseNumber(order.commission);
            
            // حساب اليوزد الفعلي بناءً على نوع الأوردر
            let actualUsdt = cryptoAmount; // القيمة الافتراضية
            
            if (isTakerOrder) {
                // أوردرات التيكر (Taker)
                if (order.tradeType === 'BUY') {
                    // في حالة الشراء: نخصم الرسوم (0.05)
                    actualUsdt = cryptoAmount - 0.05;
                } else {
                    // في حالة البيع: نضيف الرسوم (0.05)
                    actualUsdt = cryptoAmount + 0.05;
                }
            } else {
                // أوردرات الميكر (Maker)
                if (order.tradeType === 'BUY') {
                    // في حالة الشراء: نخصم الرسوم
                    actualUsdt = cryptoAmount - fee;
                } else {
                    // في حالة البيع: نضيف الرسوم
                    actualUsdt = cryptoAmount + fee;
                }
            }

            const transformedOrder: BinanceOrder = {
                orderId: order.orderNumber,
                type: order.tradeType as 'BUY' | 'SELL',
                fiatAmount: this.parseNumber(order.totalPrice),
                price: this.parseNumber(order.unitPrice),
                cryptoAmount: cryptoAmount,
                fee: fee,
                netAmount: cryptoAmount,
                actualUsdt: actualUsdt,
                status: this.mapOrderStatus(order.orderStatus),
                createTime: order.createTime
            };
            return transformedOrder;
        });
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

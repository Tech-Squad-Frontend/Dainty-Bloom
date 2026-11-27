import type { IOrder } from '../../models/Order';
import { AppError } from '../../utils/AppError';

export function assertPersistedOrderTotal(order: IOrder): void {
  const calculated =
    order.items.reduce(
      (sum, item) => sum + item.unitPriceMinor * item.quantity,
      0,
    ) -
    order.discountMinor +
    order.shippingMinor +
    order.taxMinor;
  if (!Number.isSafeInteger(calculated) || calculated !== order.totalMinor) {
    throw new AppError(
      'Stored order totals do not reconcile',
      409,
      'PAYMENT_TOTAL_MISMATCH',
    );
  }
  if (!Number.isSafeInteger(order.totalMinor) || order.totalMinor <= 0) {
    throw new AppError(
      'Stored order total is invalid',
      409,
      'PAYMENT_TOTAL_MISMATCH',
    );
  }
}

export function assertPaymentEventAmount(
  order: IOrder,
  amountMinor: number,
  currency: string,
): void {
  if (amountMinor !== order.totalMinor) {
    throw new AppError(
      'Payment amount does not match the stored order',
      409,
      'PAYMENT_AMOUNT_MISMATCH',
    );
  }
  if (currency.toUpperCase() !== order.currency.toUpperCase()) {
    throw new AppError(
      'Payment currency does not match the stored order',
      409,
      'PAYMENT_CURRENCY_MISMATCH',
    );
  }
}

export function assertPaymentStatusPayable(order: IOrder): void {
  if (
    order.status !== 'pending_payment' ||
    !['pending', 'failed'].includes(order.payment.status)
  ) {
    throw new AppError(
      'Order is not available for payment',
      409,
      'ORDER_NOT_PAYABLE',
    );
  }
}

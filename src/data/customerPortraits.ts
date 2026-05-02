export const CUSTOMER_VARIANT_COUNT = 29;

export const CUSTOMER_VARIANT_KEYS = Array.from(
  { length: CUSTOMER_VARIANT_COUNT },
  (_, index) => `customer-variant-${String(index + 1).padStart(2, '0')}`,
);


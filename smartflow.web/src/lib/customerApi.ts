import { api } from "./api";

export type CustomerDashboard = {
  balance: number;
  hold_balance: number;
  daily_limit_litres: number;
  daily_consumed_litres: number;
  daily_remaining_litres: number;
  price_per_litre: number;
  currency: string;
  total_orders: number;
  total_litres: number;
};

export type OperatingHour = {
  day_of_week: number;
  opening_time: string;
  closing_time: string;
  is_closed: boolean;
};

export type CustomerTap = {
  id: number;
  label: string;
  status: string;
  is_available: boolean;
  is_busy: boolean;
};

export type CustomerPlant = {
  id: number;
  name: string;
  city: string;
  province: string;
  area: string;
  address: string;
  status: string;
  is_active: boolean;
  tap_count: number;
  available_taps: number;
  taps: CustomerTap[];
  operating_hours: OperatingHour[];
};

export type CustomerTransaction = {
  id: number;
  user_email: string;
  amount: number;
  type: string;
  timestamp: string;
  purchase_id: number | null;
};

export type CustomerPurchase = {
  id: string;
  plant_name: string;
  status: string;
  total_litres: number;
  total_price: number;
  cane_count: number;
  created_at: string;
};

export async function getCustomerDashboard(): Promise<CustomerDashboard> {
  const { data } = await api.get<CustomerDashboard>("/api/customer/dashboard");
  return data;
}

export async function getCustomerPlants(): Promise<CustomerPlant[]> {
  const { data } = await api.get<CustomerPlant[]>("/api/customer/plants");
  return data;
}

export async function getCustomerTransactions(): Promise<CustomerTransaction[]> {
  const { data } = await api.get<CustomerTransaction[]>("/api/customer/transactions");
  return data;
}

export async function getCustomerPurchases(): Promise<CustomerPurchase[]> {
  const { data } = await api.get<CustomerPurchase[]>("/api/customer/purchases");
  return data;
}

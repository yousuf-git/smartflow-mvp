import { api } from "./api";
import type { AuthUser } from "../contexts/AuthContext";

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

export type CustomerCaneDetail = {
  id: number;
  tap_label: string;
  cane_number: number;
  litres_requested: number;
  litres_delivered: number;
  price: number;
  status: string;
  reason: string | null;
  started_at: string | null;
  completed_at: string | null;
};

export type CustomerPurchase = {
  id: string;
  plant_name: string;
  status: string;
  total_litres: number;
  total_price: number;
  cane_count: number;
  created_at: string;
  canes: CustomerCaneDetail[];
};

export type TopUpMethod = "Jazzcash" | "Easypaisa";

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

export async function topUpWallet(amount: number, method: TopUpMethod): Promise<CustomerTransaction> {
  const { data } = await api.post<CustomerTransaction>("/api/customer/top-up", { amount, method });
  return data;
}

export async function updateCustomerProfile(firstName: string, lastName: string): Promise<AuthUser> {
  const { data } = await api.put<AuthUser>("/api/customer/profile", {
    first_name: firstName,
    last_name: lastName,
  });
  return data;
}

export async function uploadCustomerAvatar(file: Blob): Promise<AuthUser> {
  const formData = new FormData();
  formData.append("file", file, "avatar.png");
  const { data } = await api.post<AuthUser>("/api/customer/profile/avatar", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

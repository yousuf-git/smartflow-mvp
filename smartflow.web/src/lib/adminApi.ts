import { api } from "./api";

export type AdminDashboard = {
  total_users: number;
  total_customers: number;
  total_orders: number;
  total_litres_dispensed: number;
  total_revenue: number;
  today_orders: number;
  today_revenue: number;
  active_sessions: number;
};

export type AdminUser = {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  created_at: string;
  is_active: boolean;
  plant_name?: string | null;
};

export type CreateUserPayload = {
  email: string;
  first_name: string;
  last_name: string;
  password: string;
  role: "admin" | "manager" | "customer";
  customer_type?: string;
  plant_id?: number;
  initial_balance?: number;
};

export type AdminCustomer = {
  user_id: number;
  email: string;
  first_name: string;
  last_name: string;
  customer_type: string;
  balance: number;
  daily_consumed: number;
};

export type AdminOrder = {
  id: string;
  user_email: string;
  plant_name: string;
  status: string;
  total_litres: number;
  total_price: number;
  cane_count: number;
  created_at: string;
};

export type AdminPlantTap = {
  id: number;
  label: string;
  status: string;
  is_available: boolean;
};

export type AdminPlantController = {
  id: number;
  name: string;
  status: string;
};

export type OperatingHour = {
  day_of_week: number;
  opening_time: string;
  closing_time: string;
  is_closed: boolean;
};

export type AdminPlant = {
  id: number;
  name: string;
  status: string;
  is_active: boolean;
  controller: AdminPlantController | null;
  taps: AdminPlantTap[];
  operating_hours: OperatingHour[];
};

export type AdminTransaction = {
  id: number;
  user_email: string;
  amount: number;
  type: string;
  timestamp: string;
  purchase_id?: number | null;
};

export const getAdminDashboard = () =>
  api.get<AdminDashboard>("/api/admin/dashboard").then((r) => r.data);

export const getAdminUsers = (role?: string) =>
  api.get<AdminUser[]>("/api/admin/users", { params: role ? { role } : {} }).then((r) => r.data);

export const createUser = (data: CreateUserPayload) =>
  api.post<AdminUser>("/api/admin/users", data).then((r) => r.data);

export const getAdminCustomers = () =>
  api.get<AdminCustomer[]>("/api/admin/customers").then((r) => r.data);

export const getAdminOrders = (status?: string) =>
  api.get<AdminOrder[]>("/api/admin/orders", { params: status ? { status } : {} }).then((r) => r.data);

export const getAdminPlants = () =>
  api.get<AdminPlant[]>("/api/admin/plants").then((r) => r.data);

export const getAdminTransactions = (userId?: number) =>
  api.get<AdminTransaction[]>("/api/admin/transactions", { params: userId ? { user_id: userId } : {} }).then((r) => r.data);

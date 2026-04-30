import { api } from "./api";
import type { AdminOrder, AdminCustomer, AdminPlant } from "./adminApi";
export type { AdminPlant };

export type ManagerDashboard = {
  plant_name: string;
  total_orders: number;
  total_litres_dispensed: number;
  total_revenue: number;
  today_orders: number;
  today_revenue: number;
  active_sessions: number;
  tap_count: number;
};

export const getManagerDashboard = () =>
  api.get<ManagerDashboard>("/api/manager/dashboard").then((r) => r.data);

export const getManagerPlant = () =>
  api.get<AdminPlant>("/api/manager/plant").then((r) => r.data);

export const getManagerOrders = (status?: string) =>
  api.get<AdminOrder[]>("/api/manager/orders", { params: status ? { status } : {} }).then((r) => r.data);

export const getManagerCustomers = () =>
  api.get<AdminCustomer[]>("/api/manager/customers").then((r) => r.data);

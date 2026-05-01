import { api } from "./api";
import type { AdminOrder, AdminCustomer, AdminPlant, OperatingHour } from "./adminApi";
export type { AdminPlant, AdminOrder, AdminCustomer, OperatingHour };

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

export const getManagerOrders = (status?: string, dateFrom?: string, dateTo?: string) =>
  api.get<AdminOrder[]>("/api/manager/orders", {
    params: {
      ...(status ? { status } : {}),
      ...(dateFrom ? { date_from: dateFrom } : {}),
      ...(dateTo ? { date_to: dateTo } : {}),
    },
  }).then((r) => r.data);

export const getManagerCustomers = () =>
  api.get<AdminCustomer[]>("/api/manager/customers").then((r) => r.data);

// Status updates
export const updatePlantStatus = (data: { status: string; is_active?: boolean }) =>
  api.put("/api/manager/plant/status", data).then((r) => r.data);

export const updateTapStatus = (tapId: number, data: { status: string }) =>
  api.put(`/api/manager/taps/${tapId}/status`, data).then((r) => r.data);

export const updateControllerStatus = (controllerId: number, data: { status: string; is_active?: boolean }) =>
  api.put(`/api/manager/controllers/${controllerId}/status`, data).then((r) => r.data);

// Operating hours CRUD
export const createOperatingHour = (data: { day_of_week: number; opening_time: string; closing_time: string; is_closed?: boolean }) =>
  api.post<OperatingHour>("/api/manager/operating-hours", data).then((r) => r.data);

export const updateOperatingHour = (id: number, data: Record<string, unknown>) =>
  api.put(`/api/manager/operating-hours/${id}`, data).then((r) => r.data);

export const deleteOperatingHour = (id: number) =>
  api.delete(`/api/manager/operating-hours/${id}`).then((r) => r.data);

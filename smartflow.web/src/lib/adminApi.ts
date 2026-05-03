import { api } from "./api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

export type ChartDataPoint = { date: string; value: number };
export type AdminChartData = {
  revenue_chart: ChartDataPoint[];
  orders_chart: ChartDataPoint[];
  customer_types: { name: string; value: number }[];
};

export type AdminUser = {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  phone?: string | null;
  avatar_url?: string | null;
  created_at: string;
  is_active: boolean;
  plant_name?: string | null;
  deleted_at?: string | null;
  customer_type?: string | null;
  balance?: number | null;
};

export type CreateUserPayload = {
  email: string;
  first_name: string;
  last_name: string;
  password: string;
  role: "admin" | "manager" | "customer";
  phone?: string;
  customer_type?: string;
  plant_id?: number;
  initial_balance?: number;
};

export type UpdateUserPayload = {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  password?: string;
  role?: string;
  is_active?: boolean;
  plant_id?: number | null;
  customer_type_id?: number;
};

export type AdminCustomer = {
  user_id: number;
  email: string;
  first_name: string;
  last_name: string;
  avatar_url?: string | null;
  customer_type: string;
  balance: number;
  daily_consumed: number;
};

export type AdminOrderCane = {
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

export type AdminOrder = {
  id: string;
  user_email: string;
  plant_name: string;
  status: string;
  total_litres: number;
  total_price: number;
  unit_price?: number | null;
  daily_litre_limit?: number | null;
  cane_count: number;
  created_at: string;
  canes: AdminOrderCane[];
};

export type AdminPlantTap = {
  id: number;
  label: string;
  status: string;
  is_available: boolean;
  gpio_pin_number: number;
};

export type AdminPlantController = {
  id: number;
  name: string;
  com_id: string;
  status: string;
  is_active: boolean;
};

export type OperatingHour = {
  id: number;
  day_of_week: number;
  opening_time: string;
  closing_time: string;
  is_closed: boolean;
};

export type AdminPlant = {
  id: number;
  name: string;
  city: string;
  province: string;
  area: string;
  address: string;
  status: string;
  is_active: boolean;
  controller: AdminPlantController | null;
  controllers: AdminPlantController[];
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

export type PriceRow = {
  id: number;
  currency: string;
  unit_price: number;
  is_active: boolean;
  timestamp: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
};

export type LimitRow = {
  id: number;
  daily_litre_limit: number;
  is_active: boolean;
  timestamp: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
};

export type CustomerTypeRow = {
  id: number;
  name: string;
  description: string;
  price_id: number;
  limit_id: number;
  unit_price: number;
  daily_litre_limit: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
};

export type SystemLogRow = {
  id: number;
  level: string;
  message: string;
  source: string;
  user_id?: number | null;
  created_at: string;
};

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export const getAdminDashboard = () =>
  api.get<AdminDashboard>("/api/admin/dashboard").then((r) => r.data);

export const getAdminCharts = () =>
  api.get<AdminChartData>("/api/admin/dashboard/charts").then((r) => r.data);

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export const getAdminUsers = (role?: string, includeDeleted?: boolean) =>
  api.get<AdminUser[]>("/api/admin/users", {
    params: { ...(role ? { role } : {}), ...(includeDeleted ? { include_deleted: true } : {}) },
  }).then((r) => r.data);

export const createUser = (data: CreateUserPayload) =>
  api.post<AdminUser>("/api/admin/users", data).then((r) => r.data);

export const updateUser = (id: number, data: UpdateUserPayload) =>
  api.put(`/api/admin/users/${id}`, data).then((r) => r.data);

export const deleteUser = (id: number) =>
  api.delete(`/api/admin/users/${id}`).then((r) => r.data);

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export const getAdminCustomers = () =>
  api.get<AdminCustomer[]>("/api/admin/customers").then((r) => r.data);

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export const getAdminOrders = (status?: string, dateFrom?: string, dateTo?: string) =>
  api.get<AdminOrder[]>("/api/admin/orders", {
    params: {
      ...(status ? { status } : {}),
      ...(dateFrom ? { date_from: dateFrom } : {}),
      ...(dateTo ? { date_to: dateTo } : {}),
    },
  }).then((r) => r.data);

// ---------------------------------------------------------------------------
// Plants
// ---------------------------------------------------------------------------

export const getAdminPlants = () =>
  api.get<AdminPlant[]>("/api/admin/plants").then((r) => r.data);

export const createPlant = (data: { name: string; city?: string; province?: string; area?: string; address?: string; is_active?: boolean }) =>
  api.post<AdminPlant>("/api/admin/plants", data).then((r) => r.data);

export const updatePlant = (id: number, data: Record<string, unknown>) =>
  api.put(`/api/admin/plants/${id}`, data).then((r) => r.data);

export const deletePlant = (id: number) =>
  api.delete(`/api/admin/plants/${id}`).then((r) => r.data);

// Controllers
export const createController = (plantId: number, data: { name: string; com_id?: string; is_active?: boolean }) =>
  api.post(`/api/admin/plants/${plantId}/controllers`, data).then((r) => r.data);

export const updateController = (id: number, data: Record<string, unknown>) =>
  api.put(`/api/admin/controllers/${id}`, data).then((r) => r.data);

export const deleteController = (id: number) =>
  api.delete(`/api/admin/controllers/${id}`).then((r) => r.data);

// Taps
export const createTap = (plantId: number, data: { controller_id: number; label: string; gpio_pin_number?: number }) =>
  api.post(`/api/admin/plants/${plantId}/taps`, data).then((r) => r.data);

export const updateTap = (id: number, data: Record<string, unknown>) =>
  api.put(`/api/admin/taps/${id}`, data).then((r) => r.data);

export const deleteTap = (id: number) =>
  api.delete(`/api/admin/taps/${id}`).then((r) => r.data);

// Operating Hours
export const createOperatingHour = (plantId: number, data: { day_of_week: number; opening_time: string; closing_time: string; is_closed?: boolean }) =>
  api.post(`/api/admin/plants/${plantId}/operating-hours`, data).then((r) => r.data);

export const updateOperatingHour = (id: number, data: Record<string, unknown>) =>
  api.put(`/api/admin/operating-hours/${id}`, data).then((r) => r.data);

export const deleteOperatingHour = (id: number) =>
  api.delete(`/api/admin/operating-hours/${id}`).then((r) => r.data);

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

export const getAdminTransactions = (userId?: number, dateFrom?: string, dateTo?: string) =>
  api.get<AdminTransaction[]>("/api/admin/transactions", {
    params: {
      ...(userId ? { user_id: userId } : {}),
      ...(dateFrom ? { date_from: dateFrom } : {}),
      ...(dateTo ? { date_to: dateTo } : {}),
    },
  }).then((r) => r.data);

// ---------------------------------------------------------------------------
// Customer Types
// ---------------------------------------------------------------------------

export const getCustomerTypes = () =>
  api.get<CustomerTypeRow[]>("/api/admin/customer-types").then((r) => r.data);

export const createCustomerType = (data: { name: string; description?: string; price_id: number; limit_id: number }) =>
  api.post("/api/admin/customer-types", data).then((r) => r.data);

export const updateCustomerType = (id: number, data: Record<string, unknown>) =>
  api.put(`/api/admin/customer-types/${id}`, data).then((r) => r.data);

export const deleteCustomerType = (id: number) =>
  api.delete(`/api/admin/customer-types/${id}`).then((r) => r.data);

// ---------------------------------------------------------------------------
// Prices
// ---------------------------------------------------------------------------

export const getPrices = () =>
  api.get<PriceRow[]>("/api/admin/prices").then((r) => r.data);

export const createPrice = (data: { unit_price: number; is_active?: boolean }) =>
  api.post("/api/admin/prices", data).then((r) => r.data);

export const updatePrice = (id: number, data: Record<string, unknown>) =>
  api.put(`/api/admin/prices/${id}`, data).then((r) => r.data);

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

export const getLimits = () =>
  api.get<LimitRow[]>("/api/admin/limits").then((r) => r.data);

export const createLimit = (data: { daily_litre_limit: number; is_active?: boolean }) =>
  api.post("/api/admin/limits", data).then((r) => r.data);

export const updateLimit = (id: number, data: Record<string, unknown>) =>
  api.put(`/api/admin/limits/${id}`, data).then((r) => r.data);

// ---------------------------------------------------------------------------
// System Logs
// ---------------------------------------------------------------------------

export const getSystemLogs = (level?: string, limit = 100) =>
  api.get<SystemLogRow[]>("/api/admin/system-logs", { params: { ...(level ? { level } : {}), limit } }).then((r) => r.data);

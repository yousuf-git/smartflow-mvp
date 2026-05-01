import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import AdminCustomerTypes from "./pages/admin/AdminCustomerTypes";
import AdminPrices from "./pages/admin/AdminPrices";
import AdminLimits from "./pages/admin/AdminLimits";
import AdminSystemLogs from "./pages/admin/AdminSystemLogs";
import DashboardLayout from "./layouts/DashboardLayout";
import MobileLayout from "./layouts/MobileLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminCustomers from "./pages/admin/AdminCustomers";
import AdminPlants from "./pages/admin/AdminPlants";
import AdminOrders from "./pages/admin/AdminOrders";
import AdminTransactions from "./pages/admin/AdminTransactions";
import AdminProfile from "./pages/admin/AdminProfile";
import ManagerDashboard from "./pages/manager/ManagerDashboard";
import ManagerPlant from "./pages/manager/ManagerPlant";
import ManagerOrders from "./pages/manager/ManagerOrders";
import ManagerCustomers from "./pages/manager/ManagerCustomers";
import CustomerDashboard from "./pages/customer/CustomerDashboard";
import CustomerPlants from "./pages/customer/CustomerPlants";
import CustomerScan from "./pages/customer/CustomerScan";
import CustomerTransactions from "./pages/customer/CustomerTransactions";
import CustomerProfile from "./pages/customer/CustomerProfile";
import CustomerTopUp from "./pages/customer/CustomerTopUp";

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          {/* Public */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />

          {/* Customer — mobile layout with bottom nav */}
          <Route
            path="/app"
            element={
              <ProtectedRoute roles={["customer"]}>
                <MobileLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<CustomerDashboard />} />
            <Route path="plants" element={<CustomerPlants />} />
            <Route path="scan" element={<CustomerScan />} />
            <Route path="transactions" element={<CustomerTransactions />} />
            <Route path="top-up" element={<CustomerTopUp />} />
            <Route path="profile" element={<CustomerProfile />} />
          </Route>

          {/* Admin */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute roles={["admin"]}>
                <DashboardLayout role="admin" />
              </ProtectedRoute>
            }
          >
            <Route index element={<AdminDashboard />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="customers" element={<AdminCustomers />} />
            <Route path="plants" element={<AdminPlants />} />
            <Route path="orders" element={<AdminOrders />} />
            <Route path="transactions" element={<AdminTransactions />} />
            <Route path="customer-types" element={<AdminCustomerTypes />} />
            <Route path="prices" element={<AdminPrices />} />
            <Route path="limits" element={<AdminLimits />} />
            <Route path="system-logs" element={<AdminSystemLogs />} />
            <Route path="profile" element={<AdminProfile />} />
          </Route>

          {/* Manager */}
          <Route
            path="/manager"
            element={
              <ProtectedRoute roles={["manager"]}>
                <DashboardLayout role="manager" />
              </ProtectedRoute>
            }
          >
            <Route index element={<ManagerDashboard />} />
            <Route path="plant" element={<ManagerPlant />} />
            <Route path="orders" element={<ManagerOrders />} />
            <Route path="customers" element={<ManagerCustomers />} />
            <Route path="profile" element={<AdminProfile />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

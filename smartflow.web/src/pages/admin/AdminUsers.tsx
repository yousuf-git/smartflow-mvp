import { useEffect, useState, type FormEvent } from "react";
import {
  Paper,
  Chip,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  InputLabel,
  FormControl,
  Alert,
  Skeleton,
  InputAdornment,
  IconButton,
  Tooltip,
} from "@mui/material";
import { UserPlus, Search, Pencil, Trash2 } from "lucide-react";
import {
  getAdminUsers,
  createUser,
  updateUser,
  deleteUser,
  getAdminPlants,
  getCustomerTypes,
  type AdminUser,
  type AdminPlant,
  type CustomerTypeRow,
} from "../../lib/adminApi";
import { useGlobalToast } from "../../contexts/ToastContext";

const ROLE_COLORS: Record<string, "primary" | "success" | "default"> = {
  admin: "primary",
  manager: "success",
  customer: "default",
};

export default function AdminUsers() {
  const { showToast } = useGlobalToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [plants, setPlants] = useState<AdminPlant[]>([]);
  const [customerTypes, setCustomerTypes] = useState<CustomerTypeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    email: "", first_name: "", last_name: "", password: "", phone: "",
    role: "customer" as "admin" | "manager" | "customer",
    customer_type: "normal", plant_id: 0, initial_balance: 500,
  });

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [editForm, setEditForm] = useState({
    first_name: "", last_name: "", email: "", phone: "",
    role: "" as string, is_active: true, plant_id: null as number | null,
    customer_type_id: null as number | null,
  });

  // Delete dialog
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);

  const loadUsers = () => {
    setLoading(true);
    getAdminUsers(roleFilter || undefined)
      .then(setUsers)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadUsers();
    getAdminPlants().then(setPlants);
    getCustomerTypes().then(setCustomerTypes);
  }, [roleFilter]);

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    return u.email.toLowerCase().includes(q) || u.first_name.toLowerCase().includes(q) || u.last_name.toLowerCase().includes(q);
  });

  const resetForm = () => {
    setForm({ email: "", first_name: "", last_name: "", password: "", phone: "", role: "customer", customer_type: "normal", plant_id: 0, initial_balance: 500 });
    setFormError("");
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setFormError("");
    setSubmitting(true);
    try {
      await createUser({
        email: form.email, first_name: form.first_name, last_name: form.last_name,
        password: form.password, role: form.role, phone: form.phone || undefined,
        customer_type: form.role === "customer" ? form.customer_type : undefined,
        plant_id: form.role === "manager" && form.plant_id ? form.plant_id : undefined,
        initial_balance: form.role === "customer" ? form.initial_balance : undefined,
      });
      setCreateOpen(false);
      resetForm();
      loadUsers();
      showToast("User created", "success");
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Failed to create user.";
      setFormError(detail === "email_already_exists" ? "A user with this email already exists." : String(detail));
    } finally {
      setSubmitting(false);
    }
  };

  const openEdit = (u: AdminUser) => {
    setEditUser(u);
    setEditForm({
      first_name: u.first_name, last_name: u.last_name, email: u.email,
      phone: u.phone ?? "", role: u.role, is_active: u.is_active,
      plant_id: null, customer_type_id: null,
    });
    setFormError("");
    setEditOpen(true);
  };

  const handleEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editUser) return;
    setFormError("");
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {};
      if (editForm.first_name !== editUser.first_name) payload.first_name = editForm.first_name;
      if (editForm.last_name !== editUser.last_name) payload.last_name = editForm.last_name;
      if (editForm.email !== editUser.email) payload.email = editForm.email;
      if (editForm.phone !== (editUser.phone ?? "")) payload.phone = editForm.phone;
      if (editForm.role !== editUser.role) payload.role = editForm.role;
      if (editForm.is_active !== editUser.is_active) payload.is_active = editForm.is_active;
      if (editForm.plant_id !== null) payload.plant_id = editForm.plant_id;
      if (editForm.customer_type_id !== null) payload.customer_type_id = editForm.customer_type_id;
      await updateUser(editUser.id, payload);
      setEditOpen(false);
      loadUsers();
      showToast("User updated", "success");
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Update failed";
      setFormError(String(detail));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSubmitting(true);
    try {
      await deleteUser(deleteTarget.id);
      setDeleteOpen(false);
      setDeleteTarget(null);
      loadUsers();
      showToast("User deleted", "success");
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Delete failed";
      showToast(String(detail), "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink-900 mb-1">Users</h1>
          <p className="text-sm text-ink-300">Manage system users</p>
        </div>
        <Button variant="contained" startIcon={<UserPlus className="w-4 h-4" />} onClick={() => setCreateOpen(true)} sx={{ textTransform: "none", fontWeight: 600 }}>
          Add User
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <TextField size="small" placeholder="Search users..." value={search} onChange={(e) => setSearch(e.target.value)}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search className="w-4 h-4 text-ink-300" /></InputAdornment> } }}
          sx={{ minWidth: 240 }}
        />
        <div className="flex gap-1.5">
          {["", "admin", "manager", "customer"].map((r) => (
            <Chip key={r} label={r || "All"} size="small" variant={roleFilter === r ? "filled" : "outlined"} color={roleFilter === r ? "primary" : "default"} onClick={() => setRoleFilter(r)} sx={{ textTransform: "capitalize", fontWeight: 500 }} />
          ))}
        </div>
      </div>

      {/* Table */}
      <Paper elevation={0} sx={{ border: "1px solid #EDF0F2", borderRadius: 3, overflow: "hidden" }}>
        {loading ? (
          <div className="p-6 space-y-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} variant="rounded" height={48} />)}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-ink-100/30">
                  <th className="text-left px-5 py-3 font-semibold text-ink-700">Name</th>
                  <th className="text-left px-5 py-3 font-semibold text-ink-700">Email</th>
                  <th className="text-left px-5 py-3 font-semibold text-ink-700">Role</th>
                  <th className="text-left px-5 py-3 font-semibold text-ink-700 hidden sm:table-cell">Status</th>
                  <th className="text-left px-5 py-3 font-semibold text-ink-700 hidden lg:table-cell">Type / Balance</th>
                  <th className="text-left px-5 py-3 font-semibold text-ink-700 hidden md:table-cell">Created</th>
                  <th className="text-right px-5 py-3 font-semibold text-ink-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id} className="border-t border-ink-100/50 hover:bg-ink-100/20 transition-colors">
                    <td className="px-5 py-3 font-medium text-ink-900">{u.first_name} {u.last_name}</td>
                    <td className="px-5 py-3 text-ink-700">{u.email}</td>
                    <td className="px-5 py-3">
                      <Chip label={u.role} size="small" color={ROLE_COLORS[u.role] ?? "default"} sx={{ textTransform: "capitalize", fontWeight: 500, fontSize: "0.75rem" }} />
                    </td>
                    <td className="px-5 py-3 hidden sm:table-cell">
                      <Chip label={u.deleted_at ? "Deleted" : u.is_active ? "Active" : "Inactive"} size="small"
                        color={u.deleted_at ? "error" : u.is_active ? "success" : "default"} variant="outlined" sx={{ fontSize: "0.7rem" }} />
                    </td>
                    <td className="px-5 py-3 text-ink-700 hidden lg:table-cell">
                      {u.customer_type && <span className="capitalize">{u.customer_type}</span>}
                      {u.balance != null && <span className="ml-2 text-ink-300">Rs. {u.balance.toFixed(0)}</span>}
                    </td>
                    <td className="px-5 py-3 text-ink-300 hidden md:table-cell">{new Date(u.created_at).toLocaleDateString()}</td>
                    <td className="px-5 py-3 text-right">
                      <Tooltip title="Edit">
                        <IconButton size="small" onClick={() => openEdit(u)}><Pencil className="w-4 h-4 text-ink-300" /></IconButton>
                      </Tooltip>
                      {!u.deleted_at && (
                        <Tooltip title="Delete">
                          <IconButton size="small" onClick={() => { setDeleteTarget(u); setDeleteOpen(true); }}><Trash2 className="w-4 h-4 text-red-400" /></IconButton>
                        </Tooltip>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && <tr><td colSpan={7} className="px-5 py-10 text-center text-ink-300">No users found.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </Paper>

      {/* Create dialog */}
      <Dialog open={createOpen} onClose={() => { setCreateOpen(false); resetForm(); }} maxWidth="sm" fullWidth>
        <form onSubmit={handleCreate}>
          <DialogTitle sx={{ fontWeight: 700 }}>Create User</DialogTitle>
          <DialogContent className="!space-y-4 !pt-2">
            {formError && <Alert severity="error">{formError}</Alert>}
            <div className="grid grid-cols-2 gap-3">
              <TextField label="First Name" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} required size="small" />
              <TextField label="Last Name" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} required size="small" />
            </div>
            <TextField label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required fullWidth size="small" />
            <TextField label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} fullWidth size="small" />
            <TextField label="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required fullWidth size="small" />
            <FormControl fullWidth size="small">
              <InputLabel>Role</InputLabel>
              <Select label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as "admin" | "manager" | "customer" })}>
                <MenuItem value="admin">Admin</MenuItem>
                <MenuItem value="manager">Manager</MenuItem>
                <MenuItem value="customer">Customer</MenuItem>
              </Select>
            </FormControl>
            {form.role === "customer" && (
              <>
                <FormControl fullWidth size="small">
                  <InputLabel>Customer Type</InputLabel>
                  <Select label="Customer Type" value={form.customer_type} onChange={(e) => setForm({ ...form, customer_type: e.target.value })}>
                    {customerTypes.map((ct) => (
                      <MenuItem key={ct.id} value={ct.name}>{ct.name} (Rs. {ct.unit_price}/L)</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField label="Initial Balance (Rs.)" type="number" value={form.initial_balance} onChange={(e) => setForm({ ...form, initial_balance: Number(e.target.value) })} fullWidth size="small" />
              </>
            )}
            {form.role === "manager" && plants.length > 0 && (
              <FormControl fullWidth size="small">
                <InputLabel>Assign Plant</InputLabel>
                <Select label="Assign Plant" value={form.plant_id || ""} onChange={(e) => setForm({ ...form, plant_id: Number(e.target.value) })}>
                  {plants.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
                </Select>
              </FormControl>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => { setCreateOpen(false); resetForm(); }} sx={{ textTransform: "none" }}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={submitting} sx={{ textTransform: "none", fontWeight: 600 }}>{submitting ? "Creating..." : "Create"}</Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
        <form onSubmit={handleEdit}>
          <DialogTitle sx={{ fontWeight: 700 }}>Edit User</DialogTitle>
          <DialogContent className="!space-y-4 !pt-2">
            {formError && <Alert severity="error">{formError}</Alert>}
            <div className="grid grid-cols-2 gap-3">
              <TextField label="First Name" value={editForm.first_name} onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })} required size="small" />
              <TextField label="Last Name" value={editForm.last_name} onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })} required size="small" />
            </div>
            <TextField label="Email" type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} required fullWidth size="small" />
            <TextField label="Phone" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} fullWidth size="small" />
            <FormControl fullWidth size="small">
              <InputLabel>Role</InputLabel>
              <Select label="Role" value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}>
                <MenuItem value="admin">Admin</MenuItem>
                <MenuItem value="manager">Manager</MenuItem>
                <MenuItem value="customer">Customer</MenuItem>
              </Select>
            </FormControl>
            <FormControl fullWidth size="small">
              <InputLabel>Status</InputLabel>
              <Select label="Status" value={editForm.is_active ? "active" : "inactive"} onChange={(e) => setEditForm({ ...editForm, is_active: e.target.value === "active" })}>
                <MenuItem value="active">Active</MenuItem>
                <MenuItem value="inactive">Inactive</MenuItem>
              </Select>
            </FormControl>
            {editUser?.role === "customer" && customerTypes.length > 0 && (
              <FormControl fullWidth size="small">
                <InputLabel>Customer Type</InputLabel>
                <Select label="Customer Type" value={editForm.customer_type_id ?? ""} onChange={(e) => setEditForm({ ...editForm, customer_type_id: Number(e.target.value) })}>
                  {customerTypes.map((ct) => <MenuItem key={ct.id} value={ct.id}>{ct.name} (Rs. {ct.unit_price}/L)</MenuItem>)}
                </Select>
              </FormControl>
            )}
            {editForm.role === "manager" && plants.length > 0 && (
              <FormControl fullWidth size="small">
                <InputLabel>Assign Plant</InputLabel>
                <Select label="Assign Plant" value={editForm.plant_id ?? ""} onChange={(e) => setEditForm({ ...editForm, plant_id: Number(e.target.value) })}>
                  {plants.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
                </Select>
              </FormControl>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setEditOpen(false)} sx={{ textTransform: "none" }}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={submitting} sx={{ textTransform: "none", fontWeight: 600 }}>{submitting ? "Saving..." : "Save"}</Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Delete User</DialogTitle>
        <DialogContent>
          <p className="text-sm text-ink-700">
            Are you sure you want to delete <strong>{deleteTarget?.first_name} {deleteTarget?.last_name}</strong>? This action can be reversed by an admin.
          </p>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteOpen(false)} sx={{ textTransform: "none" }}>Cancel</Button>
          <Button onClick={handleDelete} variant="contained" color="error" disabled={submitting} sx={{ textTransform: "none", fontWeight: 600 }}>{submitting ? "Deleting..." : "Delete"}</Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}

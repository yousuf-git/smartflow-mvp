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
} from "@mui/material";
import { UserPlus, Search } from "lucide-react";
import {
  getAdminUsers,
  createUser,
  getAdminPlants,
  type AdminUser,
  type AdminPlant,
} from "../../lib/adminApi";

const ROLE_COLORS: Record<string, "primary" | "success" | "default"> = {
  admin: "primary",
  manager: "success",
  customer: "default",
};

export default function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [plants, setPlants] = useState<AdminPlant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    email: "",
    first_name: "",
    last_name: "",
    password: "",
    role: "customer" as "admin" | "manager" | "customer",
    customer_type: "normal",
    plant_id: 0,
    initial_balance: 500,
  });

  const loadUsers = () => {
    setLoading(true);
    getAdminUsers(roleFilter || undefined)
      .then(setUsers)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadUsers();
    getAdminPlants().then(setPlants);
  }, [roleFilter]);

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    return (
      u.email.toLowerCase().includes(q) ||
      u.first_name.toLowerCase().includes(q) ||
      u.last_name.toLowerCase().includes(q)
    );
  });

  const resetForm = () => {
    setForm({
      email: "",
      first_name: "",
      last_name: "",
      password: "",
      role: "customer",
      customer_type: "normal",
      plant_id: 0,
      initial_balance: 500,
    });
    setFormError("");
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setFormError("");
    setSubmitting(true);
    try {
      await createUser({
        email: form.email,
        first_name: form.first_name,
        last_name: form.last_name,
        password: form.password,
        role: form.role,
        customer_type: form.role === "customer" ? form.customer_type : undefined,
        plant_id: form.role === "manager" && form.plant_id ? form.plant_id : undefined,
        initial_balance: form.role === "customer" ? form.initial_balance : undefined,
      });
      setDialogOpen(false);
      resetForm();
      loadUsers();
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ?? "Failed to create user.";
      setFormError(
        detail === "email_already_exists"
          ? "A user with this email already exists."
          : String(detail),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink-900 mb-1">Users</h1>
          <p className="text-sm text-ink-300">
            Manage system users
          </p>
        </div>
        <Button
          variant="contained"
          startIcon={<UserPlus className="w-4 h-4" />}
          onClick={() => setDialogOpen(true)}
          sx={{ textTransform: "none", fontWeight: 600 }}
        >
          Add User
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <TextField
          size="small"
          placeholder="Search users..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <Search className="w-4 h-4 text-ink-300" />
                </InputAdornment>
              ),
            },
          }}
          sx={{ minWidth: 240 }}
        />
        <div className="flex gap-1.5">
          {["", "admin", "manager", "customer"].map((r) => (
            <Chip
              key={r}
              label={r || "All"}
              size="small"
              variant={roleFilter === r ? "filled" : "outlined"}
              color={roleFilter === r ? "primary" : "default"}
              onClick={() => setRoleFilter(r)}
              sx={{ textTransform: "capitalize", fontWeight: 500 }}
            />
          ))}
        </div>
      </div>

      {/* Table */}
      <Paper
        elevation={0}
        sx={{ border: "1px solid #EDF0F2", borderRadius: 3, overflow: "hidden" }}
      >
        {loading ? (
          <div className="p-6 space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} variant="rounded" height={48} />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-ink-100/30">
                  <th className="text-left px-5 py-3 font-semibold text-ink-700">
                    Name
                  </th>
                  <th className="text-left px-5 py-3 font-semibold text-ink-700">
                    Email
                  </th>
                  <th className="text-left px-5 py-3 font-semibold text-ink-700">
                    Role
                  </th>
                  <th className="text-left px-5 py-3 font-semibold text-ink-700 hidden sm:table-cell">
                    Status
                  </th>
                  <th className="text-left px-5 py-3 font-semibold text-ink-700 hidden md:table-cell">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr
                    key={u.id}
                    className="border-t border-ink-100/50 hover:bg-ink-100/20 transition-colors"
                  >
                    <td className="px-5 py-3 font-medium text-ink-900">
                      {u.first_name} {u.last_name}
                    </td>
                    <td className="px-5 py-3 text-ink-700">{u.email}</td>
                    <td className="px-5 py-3">
                      <Chip
                        label={u.role}
                        size="small"
                        color={ROLE_COLORS[u.role] ?? "default"}
                        sx={{ textTransform: "capitalize", fontWeight: 500, fontSize: "0.75rem" }}
                      />
                    </td>
                    <td className="px-5 py-3 hidden sm:table-cell">
                      <Chip
                        label={u.is_active ? "Active" : "Inactive"}
                        size="small"
                        color={u.is_active ? "success" : "default"}
                        variant="outlined"
                        sx={{ fontSize: "0.7rem" }}
                      />
                    </td>
                    <td className="px-5 py-3 text-ink-300 hidden md:table-cell">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-5 py-10 text-center text-ink-300"
                    >
                      No users found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Paper>

      {/* Create user dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          resetForm();
        }}
        maxWidth="sm"
        fullWidth
      >
        <form onSubmit={handleCreate}>
          <DialogTitle sx={{ fontWeight: 700 }}>Create User</DialogTitle>
          <DialogContent className="!space-y-4 !pt-2">
            {formError && <Alert severity="error">{formError}</Alert>}

            <div className="grid grid-cols-2 gap-3">
              <TextField
                label="First Name"
                value={form.first_name}
                onChange={(e) =>
                  setForm({ ...form, first_name: e.target.value })
                }
                required
                size="small"
              />
              <TextField
                label="Last Name"
                value={form.last_name}
                onChange={(e) =>
                  setForm({ ...form, last_name: e.target.value })
                }
                required
                size="small"
              />
            </div>

            <TextField
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
              fullWidth
              size="small"
            />

            <TextField
              label="Password"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              fullWidth
              size="small"
            />

            <FormControl fullWidth size="small">
              <InputLabel>Role</InputLabel>
              <Select
                label="Role"
                value={form.role}
                onChange={(e) =>
                  setForm({
                    ...form,
                    role: e.target.value as "admin" | "manager" | "customer",
                  })
                }
              >
                <MenuItem value="admin">Admin</MenuItem>
                <MenuItem value="manager">Manager</MenuItem>
                <MenuItem value="customer">Customer</MenuItem>
              </Select>
            </FormControl>

            {form.role === "customer" && (
              <>
                <FormControl fullWidth size="small">
                  <InputLabel>Customer Type</InputLabel>
                  <Select
                    label="Customer Type"
                    value={form.customer_type}
                    onChange={(e) =>
                      setForm({ ...form, customer_type: e.target.value })
                    }
                  >
                    <MenuItem value="normal">Normal (5 PKR/L)</MenuItem>
                    <MenuItem value="commercial">
                      Commercial (4 PKR/L)
                    </MenuItem>
                  </Select>
                </FormControl>
                <TextField
                  label="Initial Balance (PKR)"
                  type="number"
                  value={form.initial_balance}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      initial_balance: Number(e.target.value),
                    })
                  }
                  fullWidth
                  size="small"
                />
              </>
            )}

            {form.role === "manager" && plants.length > 0 && (
              <FormControl fullWidth size="small">
                <InputLabel>Assign Plant</InputLabel>
                <Select
                  label="Assign Plant"
                  value={form.plant_id || ""}
                  onChange={(e) =>
                    setForm({ ...form, plant_id: Number(e.target.value) })
                  }
                >
                  {plants.map((p) => (
                    <MenuItem key={p.id} value={p.id}>
                      {p.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button
              onClick={() => {
                setDialogOpen(false);
                resetForm();
              }}
              sx={{ textTransform: "none" }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={submitting}
              sx={{ textTransform: "none", fontWeight: 600 }}
            >
              {submitting ? "Creating..." : "Create"}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </div>
  );
}

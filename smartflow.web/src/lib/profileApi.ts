import { api } from "./api";
import type { AuthUser } from "../contexts/AuthContext";

export type ProfileUpdatePayload = {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string | null;
  password?: string;
};

function profileBase(role?: string) {
  if (role === "admin") return "/api/admin/profile";
  if (role === "manager") return "/api/manager/profile";
  return "/api/auth/profile";
}

export const updateOwnProfile = (data: ProfileUpdatePayload, role?: string) =>
  api.put<AuthUser>(profileBase(role), data).then((r) => r.data);

export const uploadOwnAvatar = (file: Blob, role?: string) => {
  const formData = new FormData();
  formData.append("file", file, "avatar.png");
  return api
    .post<AuthUser>(`${profileBase(role)}/avatar`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    })
    .then((r) => r.data);
};

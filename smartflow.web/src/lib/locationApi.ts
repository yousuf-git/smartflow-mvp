import { api } from "./api";

export type LocationOption = {
  id: number | null;
  name: string;
  iso2: string | null;
};

export const getPakistanStates = () =>
  api.get<LocationOption[]>("/api/locations/states").then((r) => r.data);

export const getPakistanCities = (stateIso2: string) =>
  api.get<LocationOption[]>(`/api/locations/states/${stateIso2}/cities`).then((r) => r.data);

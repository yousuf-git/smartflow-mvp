import { useEffect, useMemo, useState } from "react";
import { Autocomplete, TextField } from "@mui/material";
import {
  getPakistanCities,
  getPakistanStates,
  type LocationOption,
} from "../lib/locationApi";

type Props = {
  stateName: string;
  cityName: string;
  onChange: (next: { stateName: string; cityName: string }) => void;
};

const byName = (items: LocationOption[], name: string) =>
  items.find((item) => item.name.toLowerCase() === name.toLowerCase()) ?? null;

export default function StateCityFields({ stateName, cityName, onChange }: Props) {
  const [states, setStates] = useState<LocationOption[]>([]);
  const [cities, setCities] = useState<LocationOption[]>([]);
  const [statesLoading, setStatesLoading] = useState(false);
  const [citiesLoading, setCitiesLoading] = useState(false);

  const selectedState = useMemo(() => byName(states, stateName), [states, stateName]);
  const selectedCity = useMemo(() => byName(cities, cityName), [cities, cityName]);

  useEffect(() => {
    setStatesLoading(true);
    getPakistanStates()
      .then(setStates)
      .finally(() => setStatesLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedState?.iso2) {
      setCities([]);
      return;
    }
    setCitiesLoading(true);
    getPakistanCities(selectedState.iso2)
      .then(setCities)
      .finally(() => setCitiesLoading(false));
  }, [selectedState?.iso2]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <Autocomplete
        options={states}
        value={selectedState}
        loading={statesLoading}
        getOptionLabel={(option) => option.name}
        isOptionEqualToValue={(option, value) => option.iso2 === value.iso2}
        onChange={(_, value) => onChange({ stateName: value?.name ?? "", cityName: "" })}
        renderInput={(params) => <TextField {...params} label="State" size="small" />}
      />
      <Autocomplete
        options={cities}
        value={selectedCity}
        disabled={!selectedState}
        loading={citiesLoading}
        getOptionLabel={(option) => option.name}
        isOptionEqualToValue={(option, value) => option.name === value.name}
        onChange={(_, value) => onChange({ stateName, cityName: value?.name ?? "" })}
        renderInput={(params) => (
          <TextField {...params} label="City" size="small" helperText={!selectedState ? "Select state first" : undefined} />
        )}
      />
    </div>
  );
}

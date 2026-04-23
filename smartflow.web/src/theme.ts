import { createTheme } from "@mui/material/styles";

export const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#0F8CB0",
      dark: "#0A6B8A",
      light: "#5EC5D9",
      contrastText: "#ffffff",
    },
    error: {
      main: "#D97757",
    },
    success: {
      main: "#3B7A57",
    },
    background: {
      default: "#F6F8F9",
      paper: "#ffffff",
    },
    text: {
      primary: "#111718",
      secondary: "#3A464C",
    },
  },
  shape: {
    borderRadius: 12,
  },
  typography: {
    fontFamily:
      '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
});

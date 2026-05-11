import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Replace "elpaso-neighborhood-map" below with your actual GitHub repository name.
// For example, if your repo URL is https://github.com/yourname/my-repo,
// set base to "/my-repo/"
export default defineConfig({
  plugins: [react()],
  base: "/crowdsourcedneighborhoods/",
});

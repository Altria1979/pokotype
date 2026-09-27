import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
const config: NextConfig = {
  output: "export",
  trailingSlash: true,
  turbopack: { root: process.cwd() },
};
export default createNextIntlPlugin()(config);

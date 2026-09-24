import type { NextConfig } from "next";
import createMDX from "@next/mdx";

const withMDX = createMDX({
  extension: /\.mdx?$/,
});

const nextConfig: NextConfig = {
  pageExtensions: ["ts", "tsx", "mdx"],
  // NOTE: do NOT also set `experimental.mdxRs`. That is the Rust-compiler MDX
  // path and is mutually exclusive with the @next/mdx loader used above.
};

export default withMDX(nextConfig);

import type { NextConfig } from "next";
import createMDX from "@next/mdx";

/**
 * Remark plugins must be declared as PLAIN OBJECT tuples, not as imported
 * function references. Turbopack serialises loader options across a worker
 * boundary; a function value fails with "options are not serializable" and the
 * dev server dies at boot.
 *
 * The `data.remarkPlugins` form keeps each entry a string + plain array so it
 * survives serialisation.
 */
const withMDX = createMDX({
  extension: /\.mdx?$/,
  options: {
    remarkPlugins: [
      "remark-frontmatter",
      ["remark-mdx-frontmatter", { name: "frontmatter" }],
    ],
  },
});

const nextConfig: NextConfig = {
  pageExtensions: ["ts", "tsx", "mdx"],
  // NOTE: do NOT also set `experimental.mdxRs`. That is the Rust-compiler MDX
  // path and is mutually exclusive with the @next/mdx loader used above.
};

export default withMDX(nextConfig);

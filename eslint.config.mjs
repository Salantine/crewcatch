import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Rest-destructuring to drop polymorphic props (`const { variant, ...rest }`)
      // is idiomatic for a component that renders either <a> or <button>.
      // Underscore-prefixed bindings are intentional there, so silence the
      // rule for them rather than renaming to something meaningless.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    // The service-role client BYPASSES RLS. If it is ever imported into a
    // contractor-facing render path, that page returns every tenant's rows in
    // one query and no policy can stop it. This is the largest privilege
    // boundary in the app, so it is machine-enforced rather than trusted to
    // reviewer attention.
    files: ["src/app/(portal)/**/*.{ts,tsx}", "src/components/portal/**/*.{ts,tsx}"],
    ignores: ["src/app/(portal)/admin/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/supabase/admin",
              message:
                "The service-role client bypasses RLS and is ingestion-only. Portal pages must use the RLS-scoped createClient() from @/lib/supabase/server. If you genuinely need admin access, you are in the wrong surface — the answer is /admin.",
            },
          ],
          patterns: [
            {
              group: ["**/supabase/admin", "**/supabase/admin.*"],
              message:
                "Service-role access bypasses RLS and belongs only on the ingestion path.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;

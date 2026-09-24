import type { MDXComponents } from "mdx/types";

/**
 * Required by @next/mdx with the App Router — the build fails without it.
 * Maps markdown elements onto the industrial design tokens so MDX content
 * inherits the same contrast rules as the rest of the site.
 */
const components: MDXComponents = {
  h2: (props) => (
    <h2
      className="mt-10 text-2xl font-black uppercase tracking-tight text-fg"
      {...props}
    />
  ),
  h3: (props) => (
    <h3 className="mt-6 text-lg font-bold uppercase tracking-wide text-fg" {...props} />
  ),
  p: (props) => <p className="mt-4 leading-relaxed text-fg-muted" {...props} />,
  ul: (props) => <ul className="mt-4 list-disc space-y-2 pl-5 text-fg-muted" {...props} />,
  ol: (props) => <ol className="mt-4 list-decimal space-y-2 pl-5 text-fg-muted" {...props} />,
  li: (props) => <li className="leading-relaxed" {...props} />,
  strong: (props) => <strong className="font-bold text-fg" {...props} />,
  a: (props) => (
    <a
      className="font-semibold text-accent-ink underline underline-offset-2"
      {...props}
    />
  ),
  code: (props) => (
    <code className="metric border border-border-subtle bg-surface-1 px-1.5 py-0.5 text-sm" {...props} />
  ),
  pre: (props) => (
    <pre
      className="mt-4 overflow-x-auto border border-border-subtle bg-surface-1 p-4"
      {...props}
    />
  ),
  hr: (props) => <hr className="my-8 border-border-subtle" {...props} />,
  blockquote: (props) => (
    <blockquote className="mt-4 border-l-2 border-accent pl-4 text-fg-muted" {...props} />
  ),
};

export function useMDXComponents(): MDXComponents {
  return components;
}

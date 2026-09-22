# DEX research visual workflow

The site has two reusable visual components. Both are designed for the Stack
theme, dark mode, mobile reading, browser printing, and the optional static PDF
generator.

## 1. Industry chains and mind maps

Use the `research-diagram` shortcode with Mermaid source inside it. Keep a
fallback SVG in the same page bundle so readers without JavaScript and static
PDFs still receive the diagram.

```text
{{< research-diagram
    label="Industry chain"
    title="Example value chain"
    caption="What the arrows represent."
    source="DEX synthesis based on the report"
    fallback="example-value-chain.svg"
>}}
flowchart LR
    A[Upstream] --> B[Midstream] --> C[Downstream]
{{< /research-diagram >}}
```

Rules:

- Use Mermaid for relationships, sequences, and hierarchy—not decorative art.
- Keep the main diagram under roughly 15 nodes; split larger systems into
  multiple figures.
- Add `accTitle` and `accDescr` to every Mermaid definition.
- Use a caption that explains the meaning of arrows, colors, or grouping.
- Cite the underlying source or label the visual as a DEX synthesis.
- Update the fallback SVG whenever the Mermaid logic changes.

## 2. Business models

Create a YAML file in `data/business_models/`, then call it from an article:

```text
{{< business-model id="example" fallback="example-business-model.svg" >}}
```

The YAML file contains a title, summary, source note, and a list of sections.
The component renders semantic HTML, so it remains readable on mobile and in
browser print mode. The fallback SVG is used by the static PDF generator.

## Publication checklist

1. Confirm that every relationship shown is supported by the article.
2. Check spelling, units, company names, and dates.
3. Test light mode, dark mode, mobile width, fullscreen expansion, and print.
4. Confirm that the fallback SVG communicates the same structure.
5. Do not use AI-generated raster art for factual diagrams or labels.
